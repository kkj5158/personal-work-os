package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import java.util.*;
import java.math.BigDecimal;
import java.time.ZoneId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.*;

/** Registers a verified single cash leg while leaving its financial interpretation unresolved. */
@Service
public class MoneyObservedDirectionService {
    public record Candidate(UUID id,long version,String direction,String disposition,String fingerprint) {}
    public record Reverse(UUID requestId,long expectedVersion,UUID registrationId) {}
    public record Register(UUID requestId,long expectedVersion,String fingerprint) {}
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyService money;
    private final MoneyCommandService commands;

    public MoneyObservedDirectionService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyCommandService commands) {
        this.db=db;this.users=users;this.money=money;this.commands=commands;
    }

    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<Candidate> inventory() {
        var owner=users.getCurrentUserId();
        var ids=db.queryForList("""
            select id from money_transactions where user_id=? and not excluded and merged_into is null
              and meaning_state='UNRESOLVED' order by id
            """,UUID.class,owner);
        var accounts=money.accounts();
        return ids.stream().map(id->inspect(owner,money.transaction(id),accounts)).toList();
    }

    private Candidate inspect(UUID owner,MoneyTransaction t,List<MoneyAccount> accounts) {
        var row=new MoneyOwnerFinancialDecision(db,owner).fact(t.id(),false);
        var direction=MoneyFinancialEvidence.simpleDirection(t);
        String status; Object source=null;
        if (!"UNRESOLVED".equals(t.meaningState()) || t.excluded() || t.mergedInto()!=null) status="OUTSIDE_SCOPE";
        else if (row.get("declaredFinancialType")!=null || MoneyFinancialEvidence.ownerProtected(db,owner,t.id())) status="KEEP_OWNER_DECISION";
        else if (row.get("observed_direction")!=null) status="ALREADY_REGISTERED";
        else if (direction==null || t.manual() || t.refundOf()!=null || t.transferDestinationStatus()!=null || row.get("loan_id")!=null) status="REVIEW_RELATION";
        else {
            var statements=statementEvidence(owner,t);
            var notification=MoneyFinancialEvidence.primaryAttempt(money,t);
            boolean pushVerified=false;
            if(notification!=null && notification.candidate().direction()==direction) {
                var c=notification.candidate();
                var leg=direction==Direction.OUT?t.fromAccountId():t.toAccountId();
                var hint=direction==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint();
                var account=new MoneyAccountResolver().resolve(accounts,c.provider(),hint);
                pushVerified=account.resolved() && account.account().id().equals(leg);
            }
            boolean bankVerified=statements.size()==1 && statementMatches(statements.getFirst(),t,direction,pushVerified);
            boolean conflict=!statements.isEmpty() && !bankVerified;
            if(bankVerified && !t.sources().stream().allMatch(evidence -> linkedMatches(evidence,t,direction))) conflict=true;
            if(conflict) status="SOURCE_CONFLICT";
            else status=bankVerified || pushVerified?"REGISTER_OBSERVED_DIRECTION":"SOURCE_NOT_VERIFIED";
            source=Arrays.asList(statements,t.sources().stream().map(TransactionSource::parseAttemptId).sorted(Comparator.nullsFirst(Comparator.naturalOrder())).toList(),notification==null?null:notification.id());
        }
        String type=direction==null?null:t.type().name();
        return new Candidate(t.id(),t.version(),type,status,commands.fingerprint(Arrays.asList(t.id(),t.version(),type,status,
            t.fromAccountId(),t.toAccountId(),t.amount(),t.currency(),t.occurredAt(),row.get("decisionVersion"),source)));
    }

    private boolean linkedMatches(TransactionSource source,MoneyTransaction t,Direction direction) {
        var attempts=money.attempts(source.rawEventId());
        if(attempts.isEmpty() || !attempts.getLast().id().equals(source.parseAttemptId())) return false;
        var attempt=attempts.getLast();
        var c=attempt.candidate();
        return "PARSED".equals(attempt.status()) && c!=null && c.direction()==direction
            && c.amount()!=null && c.amount().compareTo(t.amount())==0
            && t.currency().equals(MoneyOrdinaryAdmission.currency(c)) && c.occurredAt()!=null
            && MoneyStatementReconciliationService.near(c.occurredAt(),t.occurredAt());
    }

    private List<Map<String,Object>> statementEvidence(UUID owner,MoneyTransaction t) {
        if(!MoneyStatementProtection.installed(db))return List.of();
        return db.queryForList("""
            select r.id,r.account_id,r.direction,r.amount,extract(epoch from r.occurred_at) as occurred_epoch,s.currency,s.fingerprint,
              coalesce(to_jsonb(r)->>'time_precision','SECOND') as precision,
              (e.cash_key=r.cash_key and e.account_id=r.account_id and s.account_id=r.account_id) as same_identity
            from money_statement_effects e join money_statement_rows r on r.user_id=e.user_id and r.id=e.row_id
            join money_bank_statements s on s.user_id=r.user_id and s.id=r.statement_id
            where e.user_id=? and e.transaction_id=? order by r.id
            """,owner,t.id());
    }

    private static boolean statementMatches(Map<String,Object> row,MoneyTransaction t,Direction direction,boolean exactPrimary) {
        var epoch=(BigDecimal)row.get("occurred_epoch");
        var observed=java.time.Instant.ofEpochSecond(epoch.longValue(),epoch.remainder(BigDecimal.ONE).movePointRight(9).longValueExact());
        var zone=ZoneId.of("Asia/Seoul");
        boolean sameDay=observed.atZone(zone).toLocalDate().equals(t.occurredAt().atZone(zone).toLocalDate());
        boolean sameTime="DAY".equals(row.get("precision")) || "DAY".equals(t.occurrencePrecision())
            ? sameDay
            : observed.equals(t.occurredAt()) || exactPrimary && sameDay && MoneyStatementReconciliationService.near(observed,t.occurredAt());
        return Boolean.TRUE.equals(row.get("same_identity")) && direction.name().equals(row.get("direction"))
            && Objects.equals(row.get("account_id"),direction==Direction.OUT?t.fromAccountId():t.toAccountId())
            && t.currency().equals(row.get("currency")) && t.amount().compareTo((BigDecimal)row.get("amount"))==0 && sameTime;
    }

    public Map<String,Object> reverse(UUID id,Reverse input) {
        require(input!=null && input.registrationId()!=null,"원래 등록 요청이 필요합니다.");
        UUID owner=users.getCurrentUserId();
        return commands.execute(owner,input.requestId(),"REVERSE_OBSERVED_DIRECTION",List.of(id,input),()->{
            var row=new MoneyOwnerFinancialDecision(db,owner).fact(id,true);
            MoneyMeaningService.version(((Number)row.get("version")).longValue(),input.expectedVersion());
            require(row.get("observed_direction")!=null && row.get("declaredFinancialType")==null
                && "UNRESOLVED".equals(row.get("meaning_state")),"이후 결정이 기록된 거래는 복원할 수 없습니다.");
            String direction=row.get("observed_direction").toString();
            int changed=db.update("""
                update money_transactions t set observed_direction=null,version=version+1
                where user_id=? and id=? and version=? and exists (
                    select 1 from money_meaning_audit a where a.user_id=t.user_id and a.subject_id=t.id
                    and a.id=? and a.action='REGISTER_OBSERVED_DIRECTION'
                    and (a.next_value->>'version')::bigint=t.version and a.next_value->>'observedDirection'=t.observed_direction)
                """,owner,id,input.expectedVersion(),input.registrationId());
            require(changed==1,"원래 요청의 거래와 버전이 일치하지 않습니다.");
            db.update("""
                insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value)
                values(?,?,?,'REVERSE_OBSERVED_DIRECTION',jsonb_build_object('version',?::bigint,'observedDirection',?::text),
                   jsonb_build_object('version',?::bigint,'reversedRequestId',?::uuid))
                """,input.requestId(),owner,id,input.expectedVersion(),direction,input.expectedVersion()+1,input.registrationId());
            return Map.of("id",id,"version",input.expectedVersion()+1,"registrationReversed",true);
        });
    }

    public Map<String,Object> register(UUID id,Register input) {
        require(input!=null && input.fingerprint()!=null,"검토한 거래 지문이 필요합니다.");
        UUID owner=users.getCurrentUserId();
        return commands.execute(owner,input.requestId(),"REGISTER_OBSERVED_DIRECTION",List.of(id,input),()->{
            var decisions=new MoneyOwnerFinancialDecision(db,owner);
            decisions.fact(id,true);
            var candidate=inspect(owner,money.transaction(id),money.accounts());
            MoneyMeaningService.version(candidate.version(),input.expectedVersion());
            require(candidate.fingerprint().equals(input.fingerprint()) && candidate.disposition().equals("REGISTER_OBSERVED_DIRECTION"),
                "검토한 원본·거래 상태가 변경되었습니다.");
            int count=db.update("""
                update money_transactions set observed_direction=?,version=version+1 where user_id=? and id=?
                  and version=? and meaning_state='UNRESOLVED' and not excluded and merged_into is null and observed_direction is null
                """,candidate.direction(),owner,id,candidate.version());
            require(count==1,"거래가 변경되었습니다.");
            db.update("""
                insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value)
                values(?,?,?,'REGISTER_OBSERVED_DIRECTION',jsonb_build_object('version',?::bigint,'observedDirection',null),
                   jsonb_build_object('version',?::bigint,'observedDirection',?::text,'fingerprint',?::text))
                """,input.requestId(),owner,id,candidate.version(),candidate.version()+1,candidate.direction(),candidate.fingerprint());
            return Map.of("id",id,"version",candidate.version()+1,"observedDirection",candidate.direction(),"interpretationStatus","PROVISIONAL");
        });
    }
}
