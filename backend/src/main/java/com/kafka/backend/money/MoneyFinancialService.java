package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** Audited financial operations. All writes share the canonical owner lock. */
@Service
@Transactional
public class MoneyFinancialService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyService money;
    private final MoneyProductService product;
    private final MoneyWebService web;
    private final ObjectMapper json;

    public MoneyFinancialService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,
            MoneyProductService product,MoneyWebService web,ObjectMapper json) {
        this.db=db;this.users=users;this.money=money;this.product=product;this.web=web;this.json=json;
    }
    public record BalanceInput(TransactionType type,BigDecimal amount,Instant asOf,String note,Long expectedVersion,BigDecimal expectedCalculatedBalance) {}
    public record PaymentInput(UUID loanId,UUID paymentAccountId,BigDecimal amount,BigDecimal principal,
            BigDecimal interest,BigDecimal fee,Instant occurredAt,String note,Long expectedVersion,Long expectedLoanVersion) {}
    private UUID owner(){return users.getCurrentUserId();}
    private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
    private void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("기록이 변경되었습니다. 새로고침 후 다시 저장하세요.");}
    private static void signedAmount(BigDecimal v){require(v!=null&&v.abs().compareTo(new BigDecimal("100000000000000000"))<0&&v.stripTrailingZeros().scale()<=2,"Invalid balance");}
    private static void time(Instant v){require(v!=null&&!v.isAfter(Instant.now().plusSeconds(60)),"A verified date/time up to now is required");}

    @Transactional(readOnly=true)
    public MoneyProductService.Balance calculated(UUID accountId,Instant asOf) {
        money.account(accountId);time(asOf);
        return (MoneyProductService.Balance)product.accountBalances(asOf,accountId).getFirst().get("balance");
    }

    public MoneyTransaction balance(UUID accountId,BalanceInput v) {
        lock();require(v!=null,"Balance input required");var a=money.account(accountId);
        version(a.version(),v.expectedVersion());require(!a.archived(),"Account is archived");
        require(v.type()==TransactionType.INITIAL_BALANCE||v.type()==TransactionType.BALANCE_ADJUSTMENT,"Select opening or reconciliation");
        signedAmount(v.amount());time(v.asOf());text(v.note(),500,v.type()==TransactionType.BALANCE_ADJUSTMENT,"Reason");
        BigDecimal before=calculated(accountId,v.asOf()).amount();
        if(v.type()==TransactionType.INITIAL_BALANCE) {
            require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and to_account_id=? and type='INITIAL_BALANCE')",Boolean.class,owner(),accountId)),"Opening balance already exists; create a reconciliation");
        } else {
            require(v.expectedCalculatedBalance()!=null,"Confirm the calculated balance before reconciliation");
            if(before.compareTo(v.expectedCalculatedBalance())!=0)throw new OptimisticLockConflictException("Calculated balance changed. Review and retry.");
        }
        // The checkpoint is an absolute as-of anchor; its ledger fact is not another delta.
        UUID checkpoint=UUID.randomUUID(),id=UUID.randomUUID();
        db.update("insert into money_balance_checkpoints(id,user_id,account_id,amount,verified_at,note) values(?,?,?,?,?,?)",checkpoint,owner(),accountId,v.amount(),Timestamp.from(v.asOf()),v.note());
        BigDecimal delta=v.type()==TransactionType.INITIAL_BALANCE?v.amount():v.amount().subtract(before);signedAmount(delta);
        db.update("""
            insert into money_transactions(id,user_id,type,to_account_id,amount,currency,occurred_at,memo,title,manual,
              balance_checkpoint_id,calculated_balance,verified_balance)
            values(?,?,?,?,?,'KRW',?,?,?,true,?,?,?)
            """,id,owner(),v.type().name(),accountId,delta,Timestamp.from(v.asOf()),v.note(),
            v.type()==TransactionType.INITIAL_BALANCE?"초기 잔액":"잔액 맞추기",checkpoint,
            v.type()==TransactionType.INITIAL_BALANCE?null:before,v.amount());
        db.update("update money_accounts set version=version+1,updated_at=now() where user_id=? and id=?",owner(),accountId);
        return money.transaction(id);
    }

    @Transactional(readOnly=true)
    public Map<String,Object> detail(UUID id) {
        var rows=db.queryForList("""
            select id,loan_id as "loanId",principal,interest,fee,
              calculated_balance as "calculatedBalance",verified_balance as "verifiedBalance",
              balance_checkpoint_id as "checkpointId",version
            from money_transactions where user_id=? and id=?
            """,owner(),id);
        if(rows.isEmpty())throw new ResourceNotFoundException("Financial record not found");return rows.getFirst();
    }

    public MoneyTransaction payment(UUID id,PaymentInput v) {
        lock();require(v!=null&&v.loanId()!=null&&v.paymentAccountId()!=null,"Loan and payment account required");
        var loan=web.loan(v.loanId());version(loan.version(),v.expectedLoanVersion());
        require(!"INACTIVE".equals(loan.status()),"Loan is inactive");
        require(!money.account(v.paymentAccountId()).archived(),"Payment account is archived");
        amount(v.amount());time(v.occurredAt());text(v.note(),2000,false,"Note");
        require(loan.startDate()==null||!v.occurredAt().atZone(java.time.ZoneId.of("Asia/Seoul")).toLocalDate().isBefore(loan.startDate()),"Payment precedes loan start");
        boolean known=v.principal()!=null||v.interest()!=null||v.fee()!=null;
        if(known){
            for(BigDecimal part:Arrays.asList(v.principal(),v.interest(),v.fee())){signedAmount(part);require(part.signum()>=0,"Split must be nonnegative");}
            require(v.amount().compareTo(v.principal().add(v.interest()).add(v.fee()))==0,"Total must equal principal + interest + fee");
        }
        MoneyTransaction old=id==null?null:money.transaction(id);BigDecimal oldPrincipal=BigDecimal.ZERO;
        if(old!=null) {
            version(old.version(),v.expectedVersion());
            require(!old.excluded()&&old.mergedInto()==null&&"KRW".equals(old.currency())
                &&(old.type()==TransactionType.EXPENSE||old.type()==TransactionType.LOAN_PAYMENT),"Only an included expense or loan payment can be confirmed");
            require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions where user_id=? and refund_of=?) or exists(select 1 from money_bookkeeping_overrides where user_id=? and transaction_id=? and overrides<>'{}'::jsonb)",Boolean.class,owner(),id,owner(),id)),"Resolve refunds and Bookkeeping overrides before confirming repayment");
            var previous=detail(id);
            if(old.type()==TransactionType.LOAN_PAYMENT){require(v.loanId().equals(previous.get("loanId")),"A recorded repayment cannot be moved to another loan");oldPrincipal=(BigDecimal)previous.get("principal");if(oldPrincipal==null)oldPrincipal=BigDecimal.ZERO;}
            db.update("insert into money_corrections(id,user_id,transaction_id,action,previous_value) values(?,?,?,'LOAN_PAYMENT_CONFIRM',cast(? as jsonb))",UUID.randomUUID(),owner(),id,json.writeValueAsString(Map.of("transaction",old,"financial",previous)));
        }
        BigDecimal remaining=loan.remainingPrincipal().add(oldPrincipal).subtract(known?v.principal():BigDecimal.ZERO);
        require(remaining.signum()>=0,"Confirmed principal exceeds remaining loan principal");
        require(!"COMPLETED".equals(loan.status())||remaining.signum()==0,"Reopen the loan before correcting its remaining principal");
        if(id==null){
            id=UUID.randomUUID();
            db.update("""
                insert into money_transactions(id,user_id,type,from_account_id,amount,currency,occurred_at,memo,title,manual,loan_id,principal,interest,fee)
                values(?,?,'LOAN_PAYMENT',?,?,'KRW',?,?,?,true,?,?,?,?)
                """,id,owner(),v.paymentAccountId(),v.amount(),Timestamp.from(v.occurredAt()),v.note(),loan.name()+" 상환",v.loanId(),v.principal(),v.interest(),v.fee());
        } else {
            db.update("""
                update money_transactions set type='LOAN_PAYMENT',from_account_id=?,amount=?,occurred_at=?,memo=?,
                loan_id=?,principal=?,interest=?,fee=?,category_id=null,version=version+1 where user_id=? and id=?
                """,v.paymentAccountId(),v.amount(),Timestamp.from(v.occurredAt()),v.note(),v.loanId(),v.principal(),v.interest(),v.fee(),owner(),id);
        }
        db.update("update money_loans set remaining_principal=?,version=version+1,updated_at=now() where user_id=? and id=?",remaining,owner(),loan.id());
        return money.transaction(id);
    }

    @Transactional(readOnly=true)
    public List<Map<String,Object>> history(UUID loanId) {
        var loan=web.loan(loanId);
        return db.queryForList("""
            select id,occurred_at as "occurredAt",from_account_id as "paymentAccountId",amount,principal,interest,fee,
              ? + sum(coalesce(principal,0)) over ()
                - sum(coalesce(principal,0)) over(order by occurred_at,id rows unbounded preceding) as "remainingPrincipal",
              principal is null as unresolved,version,memo,title
            from money_transactions where user_id=? and loan_id=? and not excluded and merged_into is null
            order by occurred_at desc,id desc
            """,loan.remainingPrincipal(),owner(),loanId);
    }
}
