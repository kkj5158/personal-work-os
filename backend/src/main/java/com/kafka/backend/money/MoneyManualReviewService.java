package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** Manual financial repair retains capture/parse evidence, and shares canonical accounting and command locks. */
@Service
public class MoneyManualReviewService {
    public record Source(UUID id,Long version,String fingerprint,String direction) {
        public Source(UUID id,Long version,String fingerprint){this(id,version,fingerprint,null);}
    }
    public record Repair(UUID requestId,String action,Long version,UUID otherId,Long otherVersion,
        UUID loanId,Long loanVersion,BigDecimal principal,BigDecimal interest,BigDecimal fee,String note) {}
    public record Confirmation(UUID requestId,List<Source> sources,String action,TransactionType type,
        UUID accountId,UUID otherAccountId,Long accountVersion,Long otherAccountVersion,
        BigDecimal amount,String currency,Instant occurredAt,String timeSource,String counterparty,String note,
        UUID existingTransactionId,Long existingTransactionVersion,UUID refundOf,Long refundVersion,
        UUID loanId,Long loanVersion,BigDecimal principal,BigDecimal interest,BigDecimal fee,boolean impactAccepted) {}
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    private final MoneyService money;
    private final MoneyCommandService commands;
    private final MoneyFinancialService financial;
    private final MoneyWebService web;
    public MoneyManualReviewService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,
        MoneyCommandService commands,MoneyFinancialService financial,MoneyWebService web) {
        this.db=db;this.users=users;this.json=json;this.money=money;this.commands=commands;this.financial=financial;this.web=web;
    }
    private UUID owner() { return users.getCurrentUserId(); }
    private List<Map<String,Object>> attempts(UUID id) {
        return db.queryForList("select id,status,candidate::text,failure_code from money_parse_attempts where user_id=? and raw_event_id=? order by created_at desc,id desc limit 1",owner(),id);
    }
    private String fingerprint(UUID id) {
        return commands.fingerprint(Arrays.asList(money.notification(id),attempts(id),
            db.queryForList("select transaction_id from money_transaction_sources where user_id=? and raw_event_id=? order by transaction_id",owner(),id)));
    }
    private void unresolved(UUID id) {
        var raw=money.notification(id);
        require(Set.of(ProcessingState.FAILED,ProcessingState.REVIEW_REQUIRED).contains(raw.state()),"이미 처리된 원문입니다. 최신 금융 이력을 확인하세요.");
        require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?)",Boolean.class,owner(),id)),"이미 금융 거래에 연결된 원문입니다.");
    }
    @Transactional(readOnly=true) public Map<String,Object> context(UUID id) {
        unresolved(id);var result=new LinkedHashMap<String,Object>();
        result.put("raw",money.notification(id));result.put("attempts",attempts(id));
        result.put("version",money.notification(id).processingVersion());result.put("fingerprint",fingerprint(id));
        return result;
    }
    private MoneyAccount account(UUID id,Long version) {
        require(id!=null,"활성 소유 계좌를 선택하세요.");var a=money.account(id);
        MoneyMeaningService.version(a.version(),version);require(!a.archived(),"활성 소유 계좌를 선택하세요.");return a;
    }
    static void validateAssertions(Confirmation v) {
        require(v!=null&&v.impactAccepted(),"직접 입력한 금융 영향을 명시적으로 확인하세요.");
        require(v.type()!=null&&Set.of(TransactionType.INCOME,TransactionType.EXPENSE,TransactionType.TRANSFER,TransactionType.REFUND,TransactionType.LOAN_PAYMENT,TransactionType.LOAN_RECEIPT).contains(v.type()),"금융 유형을 선택하세요.");
        currencyAmount(v.amount(),v.currency());
        require(v.currency()!=null&&v.currency().matches("[A-Z]{3}"),"원래 통화를 입력하세요.");
        require(v.occurredAt()!=null&&!v.occurredAt().isAfter(Instant.now().plusSeconds(60)),"실제 거래 시각을 입력하세요.");
        require(Set.of("OWNER_ENTERED","SOURCE_CONFIRMED").contains(Objects.toString(v.timeSource(),"")),"거래 시각의 확인 근거를 선택하세요.");
        text(v.counterparty(),500,true,"거래 내용");text(v.note(),2000,false,"확인 메모");
        require(Set.of("REGISTER_SEPARATE","LINK_DUPLICATE").contains(Objects.toString(v.action(),"")),"별도 등록 또는 기존 거래 연결을 선택하세요.");
    }
    public Map<String,Object> confirm(UUID id,Confirmation input) {
        require(input!=null&&input.requestId()!=null,"원래 요청 식별자가 필요합니다.");
        return commands.execute(owner(),input.requestId(),"OWNER_MANUAL_REVIEW_V2",Arrays.asList(id,input),()->apply(id,input));
    }
    private Map<String,Object> apply(UUID id,Confirmation v) {
        validateAssertions(v);
        require(v.sources()!=null&&!v.sources().isEmpty()&&v.sources().size()<=2&&v.sources().stream().allMatch(s->s!=null&&s.id()!=null&&s.version()!=null&&s.fingerprint()!=null)&&id.equals(v.sources().getFirst().id()),"원래 검토 출처를 확인하세요.");
        var ids=v.sources().stream().map(Source::id).toList();require(!ids.contains(null)&&new HashSet<>(ids).size()==ids.size(),"출처가 중복되었습니다.");
        for(UUID raw:ids.stream().sorted().toList())db.queryForList("select id from money_raw_notifications where user_id=? and id=? for update",owner(),raw);
        for(var s:v.sources()) {
            unresolved(s.id());MoneyMeaningService.version(money.notification(s.id()).processingVersion(),s.version());
            if(!Objects.equals(fingerprint(s.id()),s.fingerprint()))throw new OptimisticLockConflictException("원문 또는 분석 근거가 변경되었습니다. 입력과 최신 근거를 비교하세요.");
        }
        var own=account(v.accountId(),v.accountVersion());
        UUID from=null,to=null;
        if(Set.of(TransactionType.EXPENSE,TransactionType.LOAN_PAYMENT).contains(v.type()))from=own.id();else to=own.id();
        if(v.type()==TransactionType.TRANSFER) { from=own.id();to=account(v.otherAccountId(),v.otherAccountVersion()).id();require(!from.equals(to),"서로 다른 출금·입금 계좌가 필요합니다."); }
        require(ids.size()==1||v.type()==TransactionType.TRANSFER,"두 출처는 한 이체로만 연결할 수 있습니다.");
        // Known provider/currency are consistency constraints, even when the parser failed.
        if(ids.size()==2)require(v.sources().stream().map(Source::direction).collect(java.util.stream.Collectors.toSet()).equals(Set.of("OUT","IN")),"이체 원문의 출금·입금 방향을 각각 확인하세요.");
        for(UUID rawId:ids) {
            var source=v.sources().stream().filter(s->s.id().equals(rawId)).findFirst().orElseThrow();
            var raw=money.notification(rawId);String provider=MoneyOrdinaryAdmission.PACKAGES.entrySet().stream().filter(e->e.getValue().equals(raw.sourcePackage())).map(Map.Entry::getKey).findFirst().orElse(null);
            if(provider!=null) {
                var sourceAccount=v.type()==TransactionType.TRANSFER&&"IN".equals(source.direction())?money.account(to):own;
                require(provider.equals(sourceAccount.provider()),"원문 금융기관과 해당 방향의 선택 계좌가 다릅니다.");
            }
            Object captured=raw.rawPayload().get("currency");require(captured==null||v.currency().equals(captured),"원문 통화를 변경할 수 없습니다.");
            for(var attempt:attempts(rawId))if(attempt.get("candidate")!=null){
                var parsed=json.readTree(attempt.get("candidate").toString());
                if(parsed.hasNonNull("currency"))require(v.currency().equals(parsed.get("currency").asString()),"보존된 분석 통화와 입력 통화가 다릅니다.");
                if(ids.size()==2&&parsed.hasNonNull("direction"))require(source.direction().equals(parsed.get("direction").asString()),"양쪽 이체 원문의 방향을 확인하세요.");
            }
        }
        var provenance=new LinkedHashMap<String,Object>();
        provenance.put("rule","OWNER_ASSERTED_MANUAL_V2");provenance.put("assertion",v);
        provenance.put("sourceEvidence",v.sources().stream().map(source->{
            var snapshot=new LinkedHashMap<String,Object>();snapshot.put("id",source.id());snapshot.put("version",source.version());snapshot.put("fingerprint",source.fingerprint());
            var parsed=attempts(source.id());snapshot.put("parseAttemptId",parsed.isEmpty()?null:parsed.getFirst().get("id"));return snapshot;
        }).toList());
        UUID fact;
        if("LINK_DUPLICATE".equals(v.action())) {
            require(ids.size()==1&&v.existingTransactionId()!=null,"연결할 기존 거래를 선택하세요.");
            var target=money.transaction(v.existingTransactionId());MoneyMeaningService.version(target.version(),v.existingTransactionVersion());
            require(!target.excluded()&&target.mergedInto()==null&&target.type()==v.type()&&target.amount().compareTo(v.amount())==0&&target.currency().equals(v.currency())&&Objects.equals(target.fromAccountId(),from)&&Objects.equals(target.toAccountId(),to),"금액·통화·유형·계좌가 같은 실제 기존 거래를 선택하세요.");
            require(Duration.between(target.occurredAt(),v.occurredAt()).abs().compareTo(Duration.ofSeconds(90))<=0,"기존 거래의 시각과 비교해 주세요.");
            if(v.type()==TransactionType.REFUND)require(Objects.equals(target.refundOf(),v.refundOf()),"기존 환불의 원 거래가 다릅니다.");
            if(Set.of(TransactionType.LOAN_PAYMENT,TransactionType.LOAN_RECEIPT).contains(v.type())) {
                require(v.loanId()!=null,"기존 거래의 실제 대출 관계를 선택하세요.");var loan=web.loan(v.loanId());MoneyMeaningService.version(loan.version(),v.loanVersion());
                require(Objects.equals(financial.detail(target.id()).get("loanId"),v.loanId()),"기존 거래의 대출 관계가 다릅니다.");
            }
            fact=target.id();link(fact,ids,provenance);
            db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),fact);
            db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",target.version()+1,owner(),fact,target.version());
        } else if(v.type()==TransactionType.LOAN_PAYMENT) {
            require("KRW".equals(v.currency()),"대출 관계의 기준 통화 KRW를 확인하세요.");
            require(v.principal()!=null&&v.interest()!=null&&v.fee()!=null,"원금·이자·수수료를 각각 입력하세요.");
            fact=financial.payment(null,new MoneyFinancialService.PaymentInput(v.loanId(),own.id(),v.amount(),v.principal(),v.interest(),v.fee(),v.occurredAt(),v.note(),null,v.loanVersion())).id();link(fact,ids,provenance);
        } else if(v.type()==TransactionType.LOAN_RECEIPT) {
            require("KRW".equals(v.currency())&&v.loanId()!=null,"KRW 대출 관계를 선택하세요.");var loan=web.loan(v.loanId());MoneyMeaningService.version(loan.version(),v.loanVersion());
            require("ACTIVE".equals(loan.status()),"진행 중인 대출을 선택하세요.");
            require(loan.startDate()==null||!v.occurredAt().atZone(ZoneId.of("Asia/Seoul")).toLocalDate().isBefore(loan.startDate()),"대출 시작일보다 앞선 입금입니다.");
            // Loan creation records the contract, not an additional draw. Receipt increases outstanding principal once.
            require(loan.originalPrincipal()==null||loan.remainingPrincipal().add(v.amount()).compareTo(loan.originalPrincipal())<=0,"입금 원금이 대출 약정 원금을 초과합니다. 대출 화면에서 기존 잔액을 확인하세요.");
            fact=UUID.randomUUID();db.update("insert into money_transactions(id,user_id,type,to_account_id,amount,currency,occurred_at,counterparty_text,memo,loan_id,principal,interest,fee) values(?,?,'LOAN_RECEIPT',?,?,'KRW',?,?,?,?,?,0,0)",fact,owner(),to,v.amount(),Timestamp.from(v.occurredAt()),v.counterparty(),v.note(),loan.id(),v.amount());
            db.update("update money_loans set remaining_principal=remaining_principal+?,version=version+1,updated_at=now() where user_id=? and id=?",v.amount(),owner(),loan.id());link(fact,ids,provenance);
        } else {
            if(v.type()==TransactionType.REFUND)validateRefund(v,to);
            var sources=ids.stream().map(raw->new TransactionSource(raw,null,SourceRelationship.PRIMARY,provenance)).toList();
            fact=money.recordReviewTransactionId(new TransactionInput(v.type(),from,to,v.amount(),v.currency(),v.occurredAt(),v.counterparty(),sources));
            if(v.type()==TransactionType.REFUND)db.update("update money_transactions set refund_of=?,category_id=(select category_id from money_transactions where user_id=? and id=?) where user_id=? and id=?",v.refundOf(),owner(),v.refundOf(),owner(),fact);
        }
        // Every review path is admission only, including repayment interest jobs created by the INSERT trigger.
        db.update("update money_classification_jobs set status='PROTECTED',result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=? and not requested and status='QUEUED'",json.writeValueAsString(Map.of("reason","REVIEW_ADMISSION_ONLY")),owner(),fact);
        if(!"LINK_DUPLICATE".equals(v.action()))db.update("update money_transactions set manual=false where user_id=? and id=?",owner(),fact);
        UUID event=UUID.randomUUID();
        for(UUID raw:ids) {
            money.finishProcessingVersion(raw,ProcessingState.PROCESSED,"USER_CONFIRMED");
            db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'MOVE_TO_BOOKKEEPING',cast(? as jsonb))",raw.equals(id)?event:UUID.randomUUID(),owner(),raw,json.writeValueAsString(Map.of("kind","RAW","transactionId",fact,"provenance",provenance,"after",Map.of("version",money.notification(raw).processingVersion(),"state","COMPLETED"))));
        }
        return Map.of("transactionId",fact,"eventId",event);
    }
    private void validateRefund(Confirmation v,UUID account) {
        require(v.refundOf()!=null,"실제 원 지출을 선택하세요.");var original=money.transaction(v.refundOf());MoneyMeaningService.version(original.version(),v.refundVersion());
        require(original.type()==TransactionType.EXPENSE&&!original.excluded()&&original.mergedInto()==null&&original.currency().equals(v.currency())&&account.equals(original.fromAccountId()),"원 지출의 소유권·통화·계좌를 확인하세요.");
        require(!v.occurredAt().isBefore(original.occurredAt()),"환불 시각은 원 지출 이후여야 합니다.");
        var refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and not excluded and merged_into is null",BigDecimal.class,owner(),original.id());
        require(refunded.add(v.amount()).compareTo(original.amount())<=0,"남은 환불 가능 금액을 초과합니다.");
    }
    private void link(UUID fact,List<UUID> ids,Map<String,Object> provenance) {
        for(UUID raw:ids)db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,relationship,evidence) values(?,?,?,'PRIMARY',cast(? as jsonb))",fact,owner(),raw,json.writeValueAsString(provenance));
    }
    public Map<String,Object> repair(UUID id,Repair input) {
        require(input!=null&&input.requestId()!=null,"원 요청 식별자가 필요합니다.");
        return commands.execute(owner(),input.requestId(),"OWNER_RELATIONSHIP_REPAIR_V2",Arrays.asList(id,input),()->{
            var t=money.transaction(id);MoneyMeaningService.version(t.version(),input.version());
            require(!t.excluded()&&t.mergedInto()==null,"현재 활성 금융 거래를 선택하세요.");
            var product=new MoneyProductService(db,users,money,json);
            var before=new LinkedHashMap<String,Object>();before.put("transaction",t);before.put("input",input);
            UUID result=id;
            switch(Objects.toString(input.action(),"")) {
                case "TRANSFER","UNRELATED" -> {
                    require(input.otherId()!=null&&!id.equals(input.otherId()),"반대편 실제 거래를 선택하세요.");var other=money.transaction(input.otherId());MoneyMeaningService.version(other.version(),input.otherVersion());
                    var expense=t.type()==TransactionType.EXPENSE?t:other;var income=t.type()==TransactionType.INCOME?t:other;
                    require(expense.type()==TransactionType.EXPENSE&&income.type()==TransactionType.INCOME&&!other.excluded()&&other.mergedInto()==null,"실제 지출·수입 관계를 선택하세요.");
                    require(expense.amount().compareTo(income.amount())==0&&expense.currency().equals(income.currency())&&Duration.between(expense.occurredAt(),income.occurredAt()).abs().compareTo(Duration.ofSeconds(MoneyReviewService.PAIR_WINDOW_SECONDS))<=0,"동일 금액·통화·시간 범위의 반대편 거래를 확인하세요.");
                    before.put("other",other);
                    if("TRANSFER".equals(input.action()))result=product.link(id,new MoneyProductService.Pair(other.id(),t.version(),other.version())).id();
                    else for(var pair:List.of(List.of(expense.id(),income.id()),List.of(income.id(),expense.id())))db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,'TRANSFER_PAIR_DISMISSED','{}'::jsonb,cast(? as jsonb))",UUID.randomUUID(),owner(),pair.getFirst(),json.writeValueAsString(Map.of("otherId",pair.getLast().toString())));
                }
                case "REFUND" -> {
                    require(t.type()==TransactionType.REFUND&&t.refundOf()==null&&input.otherId()!=null,"연결이 필요한 환불과 원 지출을 선택하세요.");
                    var original=money.transaction(input.otherId());MoneyMeaningService.version(original.version(),input.otherVersion());
                    require(original.type()==TransactionType.EXPENSE&&!original.excluded()&&original.mergedInto()==null&&original.currency().equals(t.currency())&&Objects.equals(original.fromAccountId(),t.toAccountId())&&!t.occurredAt().isBefore(original.occurredAt()),"환불 원 거래의 계좌·통화·시각이 다릅니다.");
                    var refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and not excluded",BigDecimal.class,owner(),original.id());require(refunded.add(t.amount()).compareTo(original.amount())<=0,"남은 환불 가능 금액을 초과합니다.");
                    db.update("insert into money_corrections(id,user_id,transaction_id,action,previous_value) values(?,?,?,'OWNER_REFUND_LINK',cast(? as jsonb))",UUID.randomUUID(),owner(),id,json.writeValueAsString(t));
                    db.update("update money_transactions set refund_of=?,category_id=?,version=version+1 where user_id=? and id=?",original.id(),original.categoryId(),owner(),id);
                }
                case "LOAN_PAYMENT" -> {
                    require(input.principal()!=null&&input.interest()!=null&&input.fee()!=null,"원금·이자·수수료를 각각 확인하세요.");
                    financial.payment(id,new MoneyFinancialService.PaymentInput(input.loanId(),t.fromAccountId(),t.amount(),input.principal(),input.interest(),input.fee(),t.occurredAt(),input.note(),t.version(),input.loanVersion()));
                }
                default -> throw new InvalidRequestException("금융 관계를 선택하세요.");
            }
            UUID event=UUID.randomUUID();db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'OWNER_FINANCIAL_REPAIR',cast(? as jsonb))",event,owner(),id,json.writeValueAsString(Map.of("before",before,"transactionId",result,"kind","TRANSACTION","after",Map.of("version",money.transaction(id).version()))));
            return Map.of("transactionId",result,"eventId",event);
        });
    }
}
