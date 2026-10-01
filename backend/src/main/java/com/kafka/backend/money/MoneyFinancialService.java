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
    public List<MoneyProductService.Reconciliation> reconciliation(){return product.reconciliation();}
    public record ReconcileInput(Instant observedAt,BigDecimal observedBalance,BigDecimal expectedLedgerBalance,String note,Long expectedVersion) {}
    /**
     * Owner accepts the bank-reported balance as the new basis after an unexplained ledger difference.
     * Recorded as an auditable BALANCE_ADJUSTMENT whose calculated side is the ledger-only balance, never as income/expense.
     */
    public MoneyTransaction acceptObserved(UUID accountId,ReconcileInput v) {
        lock();require(v!=null,"Reconciliation input required");var a=money.account(accountId);
        version(a.version(),v.expectedVersion());require(!a.archived(),"Account is archived");text(v.note(),500,true,"Reason");
        var row=product.reconciliation().stream().filter(r->r.accountId().equals(accountId)).findFirst().orElseThrow();
        require("MISMATCH".equals(row.status()),"현재 설명되지 않은 잔액 차이가 없습니다.");
        if(v.observedAt()==null||v.observedBalance()==null||v.expectedLedgerBalance()==null||!row.observedAt().equals(v.observedAt())
            ||row.observedBalance().compareTo(v.observedBalance())!=0||row.ledgerBalance().compareTo(v.expectedLedgerBalance())!=0)
            throw new OptimisticLockConflictException("잔액 대조 결과가 바뀌었습니다. 새로고침 후 다시 확인하세요.");
        UUID checkpoint=UUID.randomUUID(),id=UUID.randomUUID();
        db.update("insert into money_balance_checkpoints(id,user_id,account_id,amount,verified_at,note) values(?,?,?,?,?,?)",checkpoint,owner(),accountId,row.observedBalance(),Timestamp.from(row.observedAt()),v.note());
        db.update("""
            insert into money_transactions(id,user_id,type,to_account_id,amount,currency,occurred_at,memo,title,manual,balance_checkpoint_id,calculated_balance,verified_balance)
            values(?,?,'BALANCE_ADJUSTMENT',?,?,'KRW',?,?,'잔액 맞추기',true,?,?,?)
            """,id,owner(),accountId,row.difference(),Timestamp.from(row.observedAt()),v.note(),checkpoint,row.ledgerBalance(),row.observedBalance());
        db.update("update money_accounts set version=version+1,updated_at=now() where user_id=? and id=?",owner(),accountId);
        return money.transaction(id);
    }
    public record OpeningRemoval(Long expectedVersion) {}
    /**
     * Removes the opening-balance record only. The account, later ledger facts and later checkpoints are untouched;
     * the account returns to "opening balance unknown". A full snapshot is appended to the meaning audit first.
     */
    public Map<String,Object> removeOpening(UUID accountId,OpeningRemoval v) {
        lock();require(v!=null,"Version required");var a=money.account(accountId);version(a.version(),v.expectedVersion());
        removeOpening(accountId,"INITIAL_BALANCE_REMOVED");
        db.update("update money_accounts set version=version+1,updated_at=now() where user_id=? and id=?",owner(),accountId);
        return Map.of("account",money.account(accountId),"balance",product.balance(accountId));
    }
    /** Edits the opening balance as remove + recreate in one transaction, preserving the previous value in audit. */
    public MoneyTransaction replaceOpening(UUID accountId,BalanceInput v) {
        lock();require(v!=null&&v.type()==TransactionType.INITIAL_BALANCE,"Opening balance input required");var a=money.account(accountId);
        version(a.version(),v.expectedVersion());removeOpening(accountId,"INITIAL_BALANCE_REPLACED");
        return balance(accountId,new BalanceInput(TransactionType.INITIAL_BALANCE,v.amount(),v.asOf(),v.note(),a.version(),null));
    }
    private void removeOpening(UUID accountId,String action) {
        var rows=db.queryForList("select t.id,t.amount,t.occurred_at as \"occurredAt\",t.memo,t.version,t.balance_checkpoint_id as \"checkpointId\",c.verified_at as \"verifiedAt\",c.note,c.created_at as \"checkpointCreatedAt\" from money_transactions t join money_balance_checkpoints c on c.id=t.balance_checkpoint_id and c.user_id=t.user_id where t.user_id=? and t.to_account_id=? and t.type='INITIAL_BALANCE'",owner(),accountId);
        require(!rows.isEmpty(),"설정된 초기 잔액이 없습니다.");var row=rows.getFirst();UUID tx=(UUID)row.get("id");
        require(db.queryForObject("select count(*) from money_corrections where user_id=? and transaction_id=?",Integer.class,owner(),tx)==0,"Correction history references this opening balance");
        db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,?,cast(? as jsonb),'{}'::jsonb)",UUID.randomUUID(),owner(),accountId,action,json.writeValueAsString(row));
        for(String table:List.of("money_rule_projections","money_review_decisions","money_bookkeeping_overrides"))
            db.update("delete from "+table+" where user_id=? and transaction_id=?",owner(),tx);
        db.update("delete from money_transactions where user_id=? and id=? and type='INITIAL_BALANCE'",owner(),tx);
        db.update("delete from money_balance_checkpoints where user_id=? and id=?",owner(),row.get("checkpointId"));
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
        amount(v.amount());time(v.occurredAt());text(v.note(),2000,false,"Note");
        require(loan.startDate()==null||!v.occurredAt().atZone(java.time.ZoneId.of("Asia/Seoul")).toLocalDate().isBefore(loan.startDate()),"Payment precedes loan start");
        boolean known=v.principal()!=null||v.interest()!=null||v.fee()!=null;
        if(known){
            for(BigDecimal part:Arrays.asList(v.principal(),v.interest(),v.fee())){signedAmount(part);require(part.signum()>=0,"Split must be nonnegative");}
            require(v.amount().compareTo(v.principal().add(v.interest()).add(v.fee()))==0,"Total must equal principal + interest + fee");
        }
        MoneyTransaction old=id==null?null:money.transaction(id);BigDecimal oldPrincipal=BigDecimal.ZERO;
        // Archived accounts cannot receive new repayments, but correcting an existing one keeps its historical account.
        require(!money.account(v.paymentAccountId()).archived()||(old!=null&&v.paymentAccountId().equals(old.fromAccountId())),"Payment account is archived");
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
