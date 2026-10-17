package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import java.time.*;
import java.math.BigDecimal;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.require;
/** Explicit owner financial decisions; captured amount/currency/time and source identity remain authoritative. */
@Service
public class MoneyOwnerReviewService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyService money;private final MoneyCommandService commands;
 public MoneyOwnerReviewService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyService money,MoneyCommandService commands){this.db=db;this.users=users;this.json=json;this.money=money;this.commands=commands;}
 public record Decision(UUID requestId,String fingerprint,String action,UUID accountId,UUID otherAccountId,UUID existingTransactionId,Long accountVersion,Long otherAccountVersion,Long existingTransactionVersion){}
 private record Evidence(MoneyRawNotification raw,UUID attempt,ParsedCandidate candidate,String currency){}
 private UUID owner(){return users.getCurrentUserId();}
 private Evidence evidence(UUID id){
  var raw=money.notification(id);require(Set.of(ProcessingState.REVIEW_REQUIRED,ProcessingState.FAILED).contains(raw.state()),"이미 처리된 알림입니다. 원래 금융 이력을 확인하세요.");
  var rows=db.queryForList("select id,candidate::text,status,parser_key,parser_version from money_parse_attempts where user_id=? and raw_event_id=? order by created_at desc,id desc limit 1",owner(),id);
  require(rows.size()==1&&rows.getFirst().get("candidate")!=null&&!"FAILED".equals(rows.getFirst().get("status")),"확인 가능한 금융 분석 근거가 필요합니다.");
  var row=rows.getFirst();var tree=json.readTree(row.get("candidate").toString());String currency=raw.rawPayload().get("currency") instanceof String s?s:null;
  if(tree.hasNonNull("currency")){String parsed=tree.get("currency").asString();require(currency==null||currency.equals(parsed),"원문과 분석 통화가 다릅니다.");currency=parsed;}
  if(tree instanceof ObjectNode node)node.remove("currency");var candidate=json.treeToValue(tree,ParsedCandidate.class);
  require(candidate!=null&&id.equals(candidate.rawEventId())&&candidate.provider()!=null&&candidate.amount()!=null&&candidate.amount().signum()>0&&candidate.occurredAt()!=null&&candidate.postedAt()!=null&&candidate.timeSource()!=null&&candidate.direction()!=null,"원래 금액·방향·시각을 확인해 주세요.");
  require(MoneyOrdinaryAdmission.domestic(candidate)&&Objects.equals(MoneyOrdinaryAdmission.PACKAGES.get(candidate.provider()),raw.sourcePackage())&&Objects.equals(candidate.provider().toLowerCase(Locale.ROOT)+"-push",row.get("parser_key"))&&"1.0.0".equals(row.get("parser_version")),"지원되는 금융 원문 분석 근거가 필요합니다.");
  if(currency==null)currency=MoneyOrdinaryAdmission.currency(candidate);require(currency!=null&&currency.matches("[A-Z]{3}"),"원본 통화가 확인되지 않았습니다.");
  if(candidate.evidence()!=null&&candidate.evidence().get("currency")!=null)require(currency.equals(candidate.evidence().get("currency")),"원문과 분석 통화가 다릅니다.");
  require(!Objects.toString(candidate.notificationSubtype(),"").matches(".*(REFUND|LOAN|REPAYMENT).*"),"환불·대출은 기존 전용 금융 확인으로 처리하세요.");
  return new Evidence(raw,(UUID)row.get("id"),candidate,currency);
 }
 private Map<String,Object> graph(Evidence e){var c=e.candidate();var from=java.sql.Timestamp.from(c.occurredAt().minusSeconds(90));var to=java.sql.Timestamp.from(c.occurredAt().plusSeconds(90));
  var facts=db.queryForList("select id,version,type,from_account_id,to_account_id,amount,currency,occurred_at from money_transactions where user_id=? and not excluded and merged_into is null and occurred_at between ? and ? order by occurred_at,id limit 501",owner(),from,to);
  var raws=db.queryForList("select r.id,r.processing_version,p.id as parse_id,p.candidate::text from money_raw_notifications r join lateral(select id,candidate,status from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id order by created_at desc,id desc limit 1) p on true where r.user_id=? and p.status='PARSED' and (p.candidate->>'occurredAt')::timestamptz between ? and ? and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id) order by r.id limit 501",owner(),from,to);
  require(facts.size()<=500&&raws.size()<=500,"관련 금융 근거가 많아 범위를 좁혀 확인해야 합니다.");return Map.of("facts",facts,"raws",raws);
 }
 private String fingerprint(Evidence e){return commands.fingerprint(Arrays.asList(e.raw().id(),e.raw().processingVersion(),e.attempt(),e.candidate(),e.currency(),graph(e)));}
 @Transactional(readOnly=true) public Map<String,Object> context(UUID id){
  var e=evidence(id);var c=e.candidate();var result=new LinkedHashMap<String,Object>();result.put("fingerprint",fingerprint(e));result.put("amount",c.amount());result.put("currency",e.currency());result.put("occurredAt",c.occurredAt());result.put("direction",c.direction());result.put("counterparty",c.counterpartyText());
  result.put("duplicates",db.queryForList("select id,version,type,title,counterparty_text as merchant,from_account_id as \"fromAccountId\",to_account_id as \"toAccountId\" from money_transactions where user_id=? and not excluded and merged_into is null and amount=? and currency=? and occurred_at between ? and ? order by occurred_at,id limit 501",owner(),c.amount(),e.currency(),java.sql.Timestamp.from(c.occurredAt().minusSeconds(90)),java.sql.Timestamp.from(c.occurredAt().plusSeconds(90))));return result;
 }
 public Map<String,Object> decide(UUID id,Decision input){
  require(input!=null&&input.fingerprint()!=null,"원래 금융 근거와 요청 ID가 필요합니다.");
  return commands.execute(owner(),input.requestId(),"OWNER_REVIEW_FINANCIAL",Arrays.asList(id,input),()->{
   db.queryForList("select id from money_raw_notifications where user_id=? and id=? for update",owner(),id);var e=evidence(id);if(!Objects.equals(fingerprint(e),input.fingerprint()))throw new OptimisticLockConflictException("표시 이후 원문 분석 또는 버전이 바뀌었습니다.");
   var c=e.candidate();require(input.accountId()!=null,"소유 계좌를 선택하세요.");var account=money.account(input.accountId());MoneyMeaningService.version(account.version(),input.accountVersion());require(!account.archived(),"활성 소유 계좌를 선택하세요.");require(Objects.equals(account.provider(),c.provider()),"원문 금융기관과 같은 소유 계좌를 선택하세요.");UUID transaction;
   var provenance=Map.<String,Object>of("rule","OWNER_ASSERTED_REVIEW","action",Objects.toString(input.action(),""),"sourceFingerprint",input.fingerprint(),"requestId",input.requestId());
   if("LINK_DUPLICATE".equals(input.action())){
    require(input.existingTransactionId()!=null,"연결할 기존 거래를 선택하세요.");var target=money.transaction(input.existingTransactionId());MoneyMeaningService.version(target.version(),input.existingTransactionVersion());
    require(!target.excluded()&&target.mergedInto()==null&&target.amount().compareTo(c.amount())==0&&target.currency().equals(e.currency())&&Duration.between(target.occurredAt(),c.occurredAt()).abs().compareTo(Duration.ofSeconds(90))<=0,"기존 거래의 금액·통화·시각 근거가 다릅니다.");
    require(input.accountId().equals(c.direction()==Direction.OUT?target.fromAccountId():target.toAccountId()),"원래 방향의 소유 계좌가 기존 거래와 다릅니다.");
    require(target.sources().size()<100,"출처가 많은 거래는 개별 금융 확인이 필요합니다.");db.queryForList("select id from money_raw_notifications where user_id=? and id=? for update",owner(),id);
    require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?)",Boolean.class,owner(),id)),"이미 다른 금융 거래에 연결된 원문입니다.");
    db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,'PRIMARY',cast(? as jsonb))",target.id(),owner(),id,e.attempt(),json.writeValueAsString(provenance));db.update("update money_transactions set version=version+1 where user_id=? and id=?",owner(),target.id());db.update("update money_review_decisions set transaction_version=? where user_id=? and transaction_id=? and transaction_version=?",target.version()+1,owner(),target.id(),target.version());transaction=target.id();
   }else{
    require(Set.of("REGISTER","TRANSFER").contains(Objects.toString(input.action(),"")),"직접 금융 처리 유형을 확인하세요.");
    UUID from=c.direction()==Direction.OUT?input.accountId():null,to=c.direction()==Direction.IN?input.accountId():null;TransactionType type=c.direction()==Direction.OUT?TransactionType.EXPENSE:TransactionType.INCOME;
    if("TRANSFER".equals(input.action())){require(input.otherAccountId()!=null&&!input.accountId().equals(input.otherAccountId())&&!money.account(input.otherAccountId()).archived(),"다른 활성 소유 계좌를 선택하세요.");MoneyMeaningService.version(money.account(input.otherAccountId()).version(),input.otherAccountVersion());if(c.direction()==Direction.OUT)to=input.otherAccountId();else from=input.otherAccountId();type=TransactionType.TRANSFER;}
    transaction=money.recordTransactionId(new TransactionInput(type,from,to,c.amount(),e.currency(),c.occurredAt(),c.counterpartyText(),List.of(new TransactionSource(id,e.attempt(),SourceRelationship.PRIMARY,provenance))));
   }
   long processing=money.finishProcessingVersion(id,ProcessingState.PROCESSED,"USER_CONFIRMED");UUID event=UUID.randomUUID();
   db.update("update money_classification_jobs set status='PROTECTED',result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=? and not requested and status='QUEUED'",json.writeValueAsString(Map.of("reason","REVIEW_ADMISSION_ONLY")),owner(),transaction);
   db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'MOVE_TO_BOOKKEEPING',cast(? as jsonb))",event,owner(),id,json.writeValueAsString(Map.of("kind","RAW","transactionId",transaction,"provenance",provenance,"after",Map.of("version",processing,"state","COMPLETED"))));
   return Map.of("transactionId",transaction,"transaction",money.transaction(transaction),"eventId",event);
  });
 }
}
