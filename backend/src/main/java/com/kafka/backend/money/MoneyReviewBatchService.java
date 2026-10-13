package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static com.kafka.backend.money.MoneyService.*;

/** Durable fixed-scope snapshots and per-command outcomes. Financial posting reuses the guarded ledger boundary. */
@Service
public class MoneyReviewBatchService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyAiService ai;
 private final MoneyService money; private final ObjectMapper json; private final TransactionTemplate tx;
 public MoneyReviewBatchService(JdbcTemplate db,CurrentUserProvider users,MoneyAiService ai,MoneyService money,ObjectMapper json,PlatformTransactionManager manager){
  this.db=db;this.users=users;this.ai=ai;this.money=money;this.json=json;tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
 }
 public record Target(UUID id,String kind){}
 public record Preview(String scope,List<Target> items,String state,String type,String search,UUID accountId,String reason,String action){}
 public record Execute(UUID previewId,UUID requestId){}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 private Map<String,Object> read(String key){var rows=db.queryForList("select payload::text from money_ai_events where user_id=? and idempotency_key=?",owner(),key);return rows.isEmpty()?null:json.readValue(rows.getFirst().get("payload").toString(),Map.class);}
 private void write(UUID subject,String kind,String key,Map<String,Object> payload){db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload,idempotency_key) values(?,?,?,?,cast(? as jsonb),?)",UUID.randomUUID(),owner(),subject,kind,json.writeValueAsString(payload),key);}
 private static long n(Object x){return x instanceof Number v?v.longValue():Long.parseLong(Objects.toString(x,"0"));}
 private static UUID id(Object x){return UUID.fromString(x.toString());}
 private static boolean pending(Map<String,Object> row){return Set.of("PENDING","DEFERRED").contains(row.get("state"));}
 /** Existing noise gate is necessary but insufficient for bulk dismissal of financial exceptions. */
 boolean clearable(Map<String,Object> row){
  if(!"RAW".equals(row.get("kind"))||!pending(row)||!"FORMAT".equals(row.get("lane"))||row.get("amount")!=null||row.get("accountId")!=null||row.get("transferPartnerId")!=null||n(row.get("transferCandidates"))>0)return false;
  UUID subject=id(row.get("id"));var raw=money.notification(subject);
  if(!MoneyReviewInformationGate.unambiguous(raw))return false;
  // Parsed financial evidence and ledger links always require the original financial workflow.
  return db.queryForObject("select not exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?) and not exists(select 1 from money_parse_attempts where user_id=? and raw_event_id=? and (amount is not null or direction is not null or candidate->>'fromAccountId' is not null or candidate->>'toAccountId' is not null or nullif(candidate->>'sourceAccountHint','') is not null or nullif(candidate->>'destinationAccountHint','') is not null or candidate->>'postBalance' is not null or coalesce(candidate->'accountSuffixHints','[]'::jsonb)<>'[]'::jsonb))",Boolean.class,owner(),subject,owner(),subject);
 }
 private String exclusion(Map<String,Object> row,String action){
  if(action.equals("MOVE_TO_BOOKKEEPING"))return pending(row)&&"RAW".equals(row.get("kind"))&&Boolean.TRUE.equals(row.get("moveToBookkeepingEligible"))?null:Objects.toString(row.get("moveToBookkeepingBlockReason"),"필수 금융 근거를 확인하세요.");
  if(action.equals("NON_TRANSACTION"))return clearable(row)?null:"금융 가능성·금액·계좌·중복·이체 근거가 있는 알림은 개별 금융 확인이 필요합니다.";
  if(action.equals("DEFER"))return pending(row)?null:"이미 처리된 항목은 보류할 수 없습니다.";
  return "DEFERRED".equals(row.get("state"))?null:"보류된 항목만 다시 검토할 수 있습니다.";
 }
 public Map<String,Object> preview(Preview input){
  require(input!=null&&Set.of("SELECTED","FILTER").contains(Objects.toString(input.scope(),"")),"선택 범위를 확인하세요.");
  require(Set.of("MOVE_TO_BOOKKEEPING","NON_TRANSACTION","DEFER","REOPEN").contains(Objects.toString(input.action(),"")),"지원되는 처리 유형을 선택하세요.");
  return tx.execute(status->{lock();var rows=new ArrayList<Map<String,Object>>();
   if(input.scope().equals("FILTER")){
    for(int offset=0;;offset+=50){var page=ai.workbench(Objects.toString(input.state(),"PENDING"),input.type(),input.search(),input.accountId(),50,offset,input.reason());var items=(List<Map<String,Object>>)page.get("items");rows.addAll(items);if(offset+50>=n(page.get("total")))break;require(rows.size()<10000,"일괄 범위가 큽니다. 필터를 좁혀 다시 선택하세요.");}
   }else{require(input.items()!=null&&!input.items().isEmpty()&&input.items().size()<=10000,"처리할 항목을 선택하세요.");var keys=new HashSet<String>();for(var target:input.items()){require(target!=null&&target.id()!=null&&Set.of("RAW","TRANSACTION").contains(target.kind())&&keys.add(target.kind()+target.id()),"중복되거나 유효하지 않은 선택입니다.");rows.add(ai.item(target.id(),target.kind(),false));}}
   UUID previewId=UUID.randomUUID();var items=new ArrayList<Map<String,Object>>();
   for(var row:rows){var entry=new LinkedHashMap<String,Object>();for(String k:List.of("id","kind","occurredAt","merchant","title","amount","currency","effectiveCurrency","accountId","type","reason","state","version","transactionVersion","overrideVersion","projectionVersion","admissionParseAttemptId","admissionFingerprint"))entry.put(k,row.get(k));
    String reason=exclusion(row,input.action());entry.put("eligible",reason==null);entry.put("exclusionReason",reason);entry.put("nextAction",reason==null?"실행 전 근거와 처리 범위를 확인하세요.":pending(row)?"계좌 설정 또는 금융 근거를 확인하세요.":"처리 이력과 최신 상태를 확인하세요.");entry.put("financialImpact",input.action().equals("MOVE_TO_BOOKKEEPING")&&reason==null?"원래 금액·시각·소유 계좌로 수입 또는 지출 1건을 등록합니다. 분류는 미분류일 수 있습니다.":"금융 거래 등록 없음");entry.put("commandGroup",input.action()+":"+row.get("kind"));items.add(entry);}
   long eligible=items.stream().filter(r->Boolean.TRUE.equals(r.get("eligible"))).count();var result=new LinkedHashMap<String,Object>();result.put("previewId",previewId);result.put("scope",input.scope());result.put("action",input.action());result.put("selectedCount",items.size());result.put("eligibleCount",eligible);result.put("excludedCount",items.size()-eligible);result.put("items",items);result.put("groups",items.stream().filter(r->Boolean.TRUE.equals(r.get("eligible"))).collect(java.util.stream.Collectors.groupingBy(r->r.get("commandGroup"),java.util.stream.Collectors.counting())));write(previewId,"REVIEW_BATCH_PREVIEW","review-preview:"+previewId,result);return result;
  });
 }
 public Map<String,Object> execute(Execute input){
  require(input!=null&&input.previewId()!=null&&input.requestId()!=null,"원래 미리보기와 요청 ID가 필요합니다.");
  Map<String,Object> preview=tx.execute(status->{lock();var p=read("review-preview:"+input.previewId());if(p==null)throw new ResourceNotFoundException("미리보기를 찾을 수 없습니다.");var start=read("review-start:"+input.requestId());if(start!=null)require(input.previewId().toString().equals(start.get("previewId").toString()),"같은 요청 ID의 처리 범위가 변경되었습니다.");else write(input.previewId(),"REVIEW_BATCH_START","review-start:"+input.requestId(),Map.of("previewId",input.previewId(),"requestId",input.requestId()));return p;});
  for(var item:(List<Map<String,Object>>)preview.get("items")){if(!Boolean.TRUE.equals(item.get("eligible")))continue;String key="review-result:"+input.requestId()+":"+item.get("id");
   try{tx.execute(status->{lock();if(read(key)!=null)return null;UUID subject=id(item.get("id"));String kind=item.get("kind").toString();var current=ai.item(subject,kind,false);String action=preview.get("action").toString();require(exclusion(current,action)==null,"처리 적격성이 변경되었습니다. 새 미리보기가 필요합니다.");
    if(action.equals("MOVE_TO_BOOKKEEPING")){
     MoneyMeaningService.version(n(current.get("version")),n(item.get("version")));
     var assessed=new MoneyReviewAdmission(db,users,json,money).assess(List.of(subject)).get(subject);require(assessed!=null&&assessed.eligible(),"금융 근거가 변경되었습니다. 다시 확인하세요.");
     if(!Objects.equals(Objects.toString(assessed.parseAttemptId(),""),Objects.toString(item.get("admissionParseAttemptId"),"")))throw new OptimisticLockConflictException("분석 근거가 변경되었습니다. 새 미리보기가 필요합니다.");
     if(!Objects.equals(new MoneyReviewAdmission(db,users,json,money).fingerprint(assessed),item.get("admissionFingerprint")))throw new OptimisticLockConflictException("금액·시각·소유 계좌가 변경되었습니다. 새 미리보기가 필요합니다.");
     var fact=money.recordTransaction(assessed.transaction());money.finishProcessing(subject,MoneyTypes.ProcessingState.PROCESSED,"USER_CONFIRMED");UUID event=UUID.randomUUID();
     db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'MOVE_TO_BOOKKEEPING',cast(? as jsonb))",event,owner(),subject,json.writeValueAsString(Map.of("kind","RAW","before",current,"transactionId",fact.id(),"after",Map.of("version",money.notification(subject).processingVersion(),"state","COMPLETED"))));
     write(input.previewId(),"REVIEW_BATCH_RESULT",key,Map.of("id",subject,"kind",kind,"status","SAVED","eventId",event,"transactionId",fact.id(),"canUndo",false));
    }else{var result=ai.decide(new MoneyAiService.Decision(subject,kind,action,n(item.get("transactionVersion")),n(item.get("overrideVersion")),n(item.get("projectionVersion")),n(item.get("version")),Map.of(),null));write(input.previewId(),"REVIEW_BATCH_RESULT",key,Map.of("id",subject,"kind",kind,"status","SAVED","eventId",result.get("eventId"),"canUndo",Boolean.TRUE.equals(((Map<String,Object>)result.get("item")).get("canUndo"))));}return null;});}
   catch(RuntimeException error){tx.execute(status->{lock();if(read(key)==null)write(input.previewId(),"REVIEW_BATCH_RESULT",key,Map.of("id",item.get("id"),"kind",item.get("kind"),"status",error instanceof OptimisticLockConflictException?"CONFLICT":"FAILED","message",error instanceof InvalidRequestException||error instanceof OptimisticLockConflictException?Objects.toString(error.getMessage(),"최신 상태를 확인하세요."):"처리하지 못했습니다. 원래 요청 결과를 확인하세요."));return null;});}
  }return outcome(input.requestId());
 }
 public Map<String,Object> outcome(UUID requestId){return tx.execute(status->{var start=read("review-start:"+requestId);if(start==null)throw new ResourceNotFoundException("요청 결과를 찾을 수 없습니다. 같은 요청 ID를 보존하세요.");var preview=read("review-preview:"+start.get("previewId"));var results=new HashMap<String,Map<String,Object>>();for(var stored:db.queryForList("select payload::text from money_ai_events where user_id=? and kind='REVIEW_BATCH_RESULT' and idempotency_key like ?",owner(),"review-result:"+requestId+":%")){var payload=json.readValue(stored.get("payload").toString(),Map.class);results.put(payload.get("id").toString(),payload);}var items=new ArrayList<Map<String,Object>>();for(var row:(List<Map<String,Object>>)preview.get("items")){if(!Boolean.TRUE.equals(row.get("eligible")))continue;var result=results.get(row.get("id").toString());items.add(result==null?Map.of("id",row.get("id"),"kind",row.get("kind"),"status","UNKNOWN","message","아직 결과가 확인되지 않았습니다. 원래 요청 결과를 다시 조회하세요."):result);}return Map.of("requestId",requestId,"items",items,"completed",items.stream().allMatch(r->!"UNKNOWN".equals(r.get("status"))));});}
}
