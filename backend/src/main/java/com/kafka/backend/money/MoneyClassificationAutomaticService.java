package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyService.*;

/** Durable per-transaction automation. Provider requests run outside DB transactions and never receive financial originals. */
@Service
public class MoneyClassificationAutomaticService {
 private final JdbcTemplate db;private final ObjectMapper json;private final MoneyCommandService commands;private final MoneyClassificationProvider provider;private final TransactionTemplate tx;
 public MoneyClassificationAutomaticService(JdbcTemplate db,ObjectMapper json,MoneyCommandService commands,MoneyClassificationProvider provider,PlatformTransactionManager manager){this.db=db;this.json=json;this.commands=commands;this.provider=provider;this.tx=new TransactionTemplate(manager);}
 private record Scope(UUID owner,MoneyService money,MoneyProductService product,MoneyWebService web,MoneyMeaningService meaning,MoneyClassificationService classification){}
 private record Input(Scope scope,UUID id,long jobVersion,Map<String,Object> book,Map<String,Object> state,Map<String,Object> context,String contextKey,List<Map<String,Object>> dictionary,UUID selected,String origin,Map<String,Object> evidence,String skip){}
 private Scope scope(UUID owner){var money=new MoneyService(db,()->owner,json);var product=new MoneyProductService(db,()->owner,money,json);var web=new MoneyWebService(db,()->owner,money,product,json);var meaning=new MoneyMeaningService(db,()->owner,json);var review=new MoneyReviewService(db,()->owner,web,product,meaning,json);return new Scope(owner,money,product,web,meaning,new MoneyClassificationService(db,()->owner,json,web,review,money,commands));}
 private void lock(UUID owner){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner);}
 private static long number(Object value){return value==null?0:((Number)value).longValue();}
 private static UUID category(Object value){return value==null?null:UUID.fromString(value.toString());}
 private Map<String,Object> object(Object value){return value==null?Map.of():json.readValue(value.toString(),Map.class);}
 private List<Map<String,Object>> dictionary(UUID owner){return db.queryForList("select c.id,c.name,c.kind,c.parent_id as \"parentId\",c.version from money_categories c left join money_categories p on p.id=c.parent_id and p.user_id=c.user_id where c.user_id=? and not c.archived and not coalesce(p.archived,false) order by c.id",owner);}
 public int runDue(){var jobs=db.queryForList("select user_id,transaction_id from money_classification_jobs where (status='QUEUED' and due_at<=now()) or (status='RUNNING' and due_at<now()) order by due_at,user_id,transaction_id limit 20");int count=0;for(var job:jobs){try{if(run((UUID)job.get("user_id"),(UUID)job.get("transaction_id"),false))count++;}catch(RuntimeException error){UUID owner=(UUID)job.get("user_id"),id=(UUID)job.get("transaction_id");tx.executeWithoutResult(status->{lock(owner);db.update("update money_classification_jobs set status='FAILED',result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=? and status='RUNNING'",json.writeValueAsString(Map.of("reason","INDEPENDENT_EXECUTION_FAILED")),owner,id);});}}return count;}
 public boolean run(UUID owner,UUID id,boolean explicit){
  Input input=tx.execute(status->prepare(scope(owner),id,explicit));if(input==null)return false;
  MoneyClassificationProvider.Result output;
  if(input.skip()!=null)output=new MoneyClassificationProvider.Result(null,input.skip(),"INTERNAL",null,null);
  else if(input.selected()!=null)output=new MoneyClassificationProvider.Result(input.selected(),Objects.toString(input.evidence().get("reason")),"INTERNAL",null,null);
  else output=provider.classify(MoneyClassificationContext.minimized(input.book(),input.dictionary().stream().filter(c->Objects.equals(c.get("kind"),input.book().get("type"))).map(c->{Map<String,Object> safe=new LinkedHashMap<>();for(String key:List.of("id","name","kind","parentId"))safe.put(key,c.get(key));return safe;}).toList()));
  var result=output;tx.executeWithoutResult(status->finish(input,result));return true;
 }
 @SuppressWarnings("unchecked") private Input prepare(Scope scope,UUID id,boolean explicit){
  lock(scope.owner());var jobs=db.queryForList("select version,status,requested,due_at,result::text from money_classification_jobs where user_id=? and transaction_id=? for update",scope.owner(),id);if(jobs.isEmpty())return null;
  explicit=explicit||Boolean.TRUE.equals(jobs.getFirst().get("requested"));
  if(!explicit&&"RUNNING".equals(jobs.getFirst().get("status"))&&((Timestamp)jobs.getFirst().get("due_at")).toInstant().isAfter(Instant.now()))return null;
  if(!explicit&&!"QUEUED".equals(jobs.getFirst().get("status"))&&!"RUNNING".equals(jobs.getFirst().get("status")))return null;
  long jobVersion=number(jobs.getFirst().get("version"))+1;db.update("update money_classification_jobs set version=?,status='RUNNING',requested=false,due_at=now()+interval '2 minutes',updated_at=now() where user_id=? and transaction_id=?",jobVersion,scope.owner(),id);
  Map<String,Object> book;try{book=scope.web().bookkeepingRow(id);}catch(ResourceNotFoundException error){job(scope.owner(),id,jobVersion,"PROTECTED",Map.of("reason","INELIGIBLE"));return null;}
  var request=object(jobs.getFirst().get("result"));if(explicit&&request.get("requestExplanation") instanceof String explanation)book.put("requestExplanation",explanation);
  var fact=scope.money().transaction(id);var state=scope.classification().state(id);var context=MoneyClassificationContext.local(book);String key=commands.fingerprint(context);var dict=dictionary(scope.owner());String skip=null;
  if(!Set.of(MoneyTypes.TransactionType.EXPENSE,MoneyTypes.TransactionType.INCOME).contains(fact.type())||fact.excluded()||fact.mergedInto()!=null||Boolean.TRUE.equals(book.get("excluded"))||!tracked(scope.owner(),book))skip="INELIGIBLE";
  else if(Boolean.TRUE.equals(state.get("directProtected"))||((Map<?,?>)book.get("source")).get("categoryId")!=null||((Map<?,?>)book.get("overrides")).containsKey("categoryId")&&(state.get("origin")==null||!Objects.equals(category(state.get("categoryId")),category(book.get("categoryId")))))skip="CURRENT_DIRECT_CHOICE";
  else if(!explicit&&Objects.equals(key,state.get("undoneInputKey")))skip="OWNER_UNDO";
  else if(!explicit&&state.get("lastInputKey")!=null){var previous=(Map<String,Object>)state.get("contextSummary");if(previous!=null&&Objects.equals(previous.get("accountId"),context.get("accountId"))&&Objects.equals(previous.get("type"),context.get("type"))&&Objects.equals(previous.get("merchant"),context.get("merchant"))&&Objects.equals(previous.get("identity"),context.get("identity"))&&MoneyClassificationContext.sameMeaning(Objects.toString(previous.get("purchase")),Objects.toString(context.get("purchase"))))skip="UNCHANGED_PURCHASE_CONTEXT";}
  var queue=db.queryForList(MoneyReviewService.QUEUE+"select reason from queue where id=? and kind='TRANSACTION'",scope.owner(),id);if(queue.stream().anyMatch(row->"POSSIBLE_INTERNAL_TRANSFER".equals(row.get("reason"))))skip="FINANCIAL_CONFIRMATION_REQUIRED";
  if(skip!=null)return new Input(scope,id,jobVersion,book,state,context,key,dict,null,null,Map.of(),skip);
  var references=db.queryForList(MoneyWebService.BOOK_BASE+"""
   select s.category_id,s.event_id,s.version,e.created_at from money_classification_state s
   join money_classification_events e on e.user_id=s.user_id and e.id=s.event_id and e.active and e.origin='DIRECT'
   join effective b on b.id=s.transaction_id and b."categoryId"=s.category_id and not b.excluded
   join money_categories c on c.user_id=s.user_id and c.id=s.category_id and not c.archived
   left join money_categories parent on parent.user_id=c.user_id and parent.id=c.parent_id
   where s.user_id=? and s.context_key=? and s.transaction_id<>? and s.origin='DIRECT' and not s.future_reference_excluded and not coalesce(parent.archived,false)
    and (e.next_value->>'transactionVersion')::bigint=b."transactionVersion" and (e.next_value->>'categoryId')::uuid=s.category_id
    and e.input_key=s.context_key
    and s.context_summary->>'purchase'=regexp_replace(lower(normalize(coalesce(b.title,''),NFKC)),'[^[:alnum:]]','','g')||'|'||regexp_replace(lower(normalize(coalesce(b.memo,''),NFKC)),'[^[:alnum:]]','','g')
   order by e.created_at desc,e.id desc limit 2
   """,scope.owner(),scope.owner(),key,id);
  boolean ambiguous=references.size()==2&&Objects.equals(references.get(0).get("created_at"),references.get(1).get("created_at"))&&!Objects.equals(references.get(0).get("category_id"),references.get(1).get("category_id"));
  if(!references.isEmpty()&&!ambiguous)return new Input(scope,id,jobVersion,book,state,context,key,dict,(UUID)references.getFirst().get("category_id"),"DIRECT_REFERENCE",Map.of("reason","같은 거래처·계좌·유형·구매 맥락의 최신 유효 직접 수정","referenceEventId",references.getFirst().get("event_id"),"referenceVersion",references.getFirst().get("version")),null);
  var facts=new LinkedHashMap<>(book);facts.put("merchant",book.get("counterpartyText"));facts.put("accountId",Objects.toString(book.get("accountId"),""));
  boolean enabled=Boolean.TRUE.equals(db.queryForObject("select coalesce((select automatic_rules from money_ai_settings where user_id=?),false)",Boolean.class,scope.owner()));
  var rules=scope.meaning().rules().stream().filter(r->"ACTIVE".equals(r.get("status"))&&r.get("categoryId")!=null&&dict.stream().anyMatch(c->c.get("id").equals(r.get("categoryId")))).filter(r->!"AI_APPROVED".equals(r.get("origin"))||enabled&&approvedCurrent(scope.owner(),r,id)).filter(r->Arrays.stream(json.readValue(json.writeValueAsString(r.get("conditions")),MoneyRuleEngine.Condition[].class)).allMatch(c->MoneyRuleEngine.matches(facts,c))).toList();
  if(!rules.isEmpty())return new Input(scope,id,jobVersion,book,state,context,key,dict,(UUID)rules.getFirst().get("categoryId"),"APPROVED_RULE",Map.of("reason","현재 입력과 일치하는 승인 규칙","ruleId",rules.getFirst().get("id"),"ruleVersion",rules.getFirst().get("version")),null);
  return new Input(scope,id,jobVersion,book,state,context,key,dict,null,"AI",Map.of(),null);
 }
 private boolean approvedCurrent(UUID owner,Map<String,Object> rule,UUID transaction){return MoneyApprovedRuleGuard.current(db,json,owner,(UUID)rule.get("id"),number(rule.get("version")),transaction);}
 private void finish(Input input,MoneyClassificationProvider.Result output){
  var scope=input.scope();lock(scope.owner());var jobs=db.queryForList("select version,status from money_classification_jobs where user_id=? and transaction_id=?",scope.owner(),input.id());if(jobs.isEmpty()||number(jobs.getFirst().get("version"))!=input.jobVersion()||!"RUNNING".equals(jobs.getFirst().get("status")))return;
  if(input.skip()!=null){
   job(scope.owner(),input.id(),input.jobVersion(),input.skip().equals("OWNER_UNDO")?"UNDONE":input.skip().equals("UNCHANGED_PURCHASE_CONTEXT")?"UNCHANGED":"PROTECTED",Map.of("reason",input.skip()));return;
  }
  Map<String,Object> current;try{current=scope.web().bookkeepingRow(input.id());}catch(ResourceNotFoundException error){job(scope.owner(),input.id(),input.jobVersion(),"PROTECTED",Map.of("reason","INELIGIBLE"));return;}
  var state=scope.classification().state(input.id());boolean stale=number(current.get("version"))!=number(input.book().get("version"))||number(current.get("transactionVersion"))!=number(input.book().get("transactionVersion"))||number(current.get("projectionVersion"))!=number(input.book().get("projectionVersion"))||number(state.get("version"))!=number(input.state().get("version"))||!commands.fingerprint(MoneyClassificationContext.local(current)).equals(input.contextKey())||!commands.fingerprint(dictionary(scope.owner())).equals(commands.fingerprint(input.dictionary()));
  if(stale){job(scope.owner(),input.id(),input.jobVersion(),"PROTECTED",Map.of("reason","LATEST_INPUT_CHANGED"));return;}
  if(Boolean.TRUE.equals(current.get("excluded"))||!tracked(scope.owner(),current)||!referenceCurrent(input)){job(scope.owner(),input.id(),input.jobVersion(),"PROTECTED",Map.of("reason","REFERENCE_OR_SCOPE_CHANGED"));return;}
  if(output.errorCode()!=null||output.categoryId()==null||input.dictionary().stream().noneMatch(c->c.get("id").equals(output.categoryId())&&c.get("kind").equals(current.get("type")))){job(scope.owner(),input.id(),input.jobVersion(),"FAILED",Map.of("reason",output.errorCode()==null?"NO_VALID_CATEGORY":output.errorCode(),"message",output.reason()));return;}
  var evidence=new LinkedHashMap<>(input.evidence());evidence.put("reason",output.reason());evidence.put("provider",Objects.toString(output.provider(),"INTERNAL"));evidence.put("model",Objects.toString(output.model(),""));evidence.put("minimizedInput",MoneyClassificationContext.minimized(current,List.of()));
  scope.classification().persist(input.id(),output.categoryId(),input.origin(),false,UUID.randomUUID(),current,evidence,true);
  // The override trigger queued this own result; settle that current job after atomic persistence.
  db.update("update money_classification_jobs set status='SUCCEEDED',input_key=?,result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=?",input.contextKey(),json.writeValueAsString(Map.of("categoryId",output.categoryId(),"origin",input.origin())),scope.owner(),input.id());
 }
 private void job(UUID owner,UUID id,long version,String status,Map<String,Object> result){db.update("update money_classification_jobs set status=?,result=cast(? as jsonb),updated_at=now() where user_id=? and transaction_id=? and version=?",status,json.writeValueAsString(result),owner,id,version);}
 private boolean tracked(UUID owner,Map<String,Object> book){return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_tracking_accounts t join money_accounts a on a.id=t.account_id and a.user_id=t.user_id where t.user_id=? and t.account_id=? and t.kind=? and not a.archived)",Boolean.class,owner,book.get("trackingAccountId"),book.get("type")));}
 private boolean referenceCurrent(Input input){
  if("DIRECT_REFERENCE".equals(input.origin()))return Boolean.TRUE.equals(db.queryForObject(MoneyWebService.BOOK_BASE+"select exists(select 1 from money_classification_state s join money_classification_events e on e.id=s.event_id and e.user_id=s.user_id join effective b on b.id=s.transaction_id and b.\"categoryId\"=s.category_id and not b.excluded where s.user_id=? and e.id=?::uuid and e.active and s.origin='DIRECT' and s.version=? and s.context_key=? and not s.future_reference_excluded and e.input_key=s.context_key and (e.next_value->>'transactionVersion')::bigint=b.\"transactionVersion\" and s.context_summary->>'purchase'=regexp_replace(lower(normalize(coalesce(b.title,''),NFKC)),'[^[:alnum:]]','','g')||'|'||regexp_replace(lower(normalize(coalesce(b.memo,''),NFKC)),'[^[:alnum:]]','','g'))",Boolean.class,input.scope().owner(),input.scope().owner(),input.evidence().get("referenceEventId"),input.evidence().get("referenceVersion"),input.contextKey()));
  if("APPROVED_RULE".equals(input.origin()))return input.scope().meaning().rules().stream().anyMatch(r->Objects.equals(r.get("id"),input.evidence().get("ruleId"))&&Objects.equals(r.get("version"),input.evidence().get("ruleVersion"))&&"ACTIVE".equals(r.get("status"))&&(!"AI_APPROVED".equals(r.get("origin"))||approvedCurrent(input.scope().owner(),r,input.id())));
  return true;
 }
}
