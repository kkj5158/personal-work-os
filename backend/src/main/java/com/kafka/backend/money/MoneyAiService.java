package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyService.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Shared Web/Mobile owner-scoped recommendation and durable decision engine.
 * Suggestions never write financial facts. Explicit decisions reuse MONEY domain operations. */
@Service
@Transactional
public class MoneyAiService {
 private static final ObjectMapper DECIMAL_JSON=tools.jackson.databind.json.JsonMapper.builder().enable(tools.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
 private final JdbcTemplate db; private final CurrentUserProvider users; private final ObjectMapper json;
 private final MoneyReviewService review; private final MoneyWebService web; private final MoneyProductService product;
 private final MoneyService money; private final MoneyMeaningService meaning;
 public MoneyAiService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyReviewService review,MoneyWebService web,MoneyProductService product,MoneyService money,MoneyMeaningService meaning){this.db=db;this.users=users;this.json=json;this.review=review;this.web=web;this.product=product;this.money=money;this.meaning=meaning;}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 private Map<String,Object> object(Object value){return value==null?new LinkedHashMap<>():DECIMAL_JSON.readValue(value.toString(),Map.class);}
 private List<Map<String,Object>> rows(String sql,Object...args){var rows=db.queryForList(sql,args);for(var r:rows)r.replaceAll((k,v)->v instanceof Timestamp t?t.toInstant():v);return rows;}
 private static long number(Object x){return x instanceof Number n?n.longValue():Long.parseLong(x.toString());}
 private static void version(Object actual,Long expected){MoneyMeaningService.version(number(actual),expected);}
 private static UUID uuid(Object x){try{return UUID.fromString(x.toString());}catch(RuntimeException e){throw new InvalidRequestException("유효한 식별자를 입력하세요.");}}
 private UUID event(UUID subject,String kind,Map<String,Object> payload,String key){UUID id=UUID.randomUUID();db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload,idempotency_key,created_at) values(?,?,?,?,cast(? as jsonb),?,clock_timestamp())",id,owner(),subject,kind,json.writeValueAsString(payload),key);return id;}
 private List<Map<String,Object>> events(UUID subject,int limit){var args=new ArrayList<Object>(List.of(owner()));String filter="";if(subject!=null){filter=" and subject_id=?";args.add(subject);}args.add(limit);var result=rows("select id,subject_id as \"subjectId\",kind,payload::text,active,created_at as \"createdAt\" from money_ai_events where user_id=?"+filter+" order by created_at desc,id desc limit ?",args.toArray());result.forEach(e->e.put("payload",object(e.get("payload"))));return result;}
 private Map<String,Object> latest(UUID id){return events(id,1).stream().findFirst().orElse(null);}

 @Transactional(readOnly=true)
 public Map<String,Object> workbench(String state,String type,String search,UUID accountId,int limit,int offset){
  page(limit,offset);require(Set.of("PENDING","DEFERRED","COMPLETED").contains(state),"검토 상태를 확인하세요.");text(search,200,false,"검색");require(type==null||Set.of("CLASSIFICATION","TRANSFER","NOISE").contains(type),"검토 유형을 확인하세요.");
  var result=new ArrayList<Map<String,Object>>();
  if(state.equals("COMPLETED")){
   String base="""
    with latest as (select distinct on(subject_id) * from money_ai_events where user_id=? order by subject_id,created_at desc,id desc), completed as (
     select e.subject_id id,coalesce(e.payload->>'kind','TRANSACTION') kind,'COMPLETED' state,e.kind reason,
      case when e.kind='TRANSFER_CONFIRM' then 'TRANSFER' when e.kind='NON_TRANSACTION' or e.payload->>'kind'='RAW' then 'NOISE' else 'CLASSIFICATION' end as "reviewType",
      coalesce(t.occurred_at,r.posted_at) as "occurredAt",case when jsonb_exists(b.overrides,'title') then b.overrides->>'title' else coalesce(p.defaults->>'title',t.title,r.title) end title,
      case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else coalesce(t.counterparty_text,r.source_package) end merchant,
      t.amount,coalesce(t.from_account_id,t.to_account_id) as "accountId",t.category_id as "categoryId",t.memo,t.type,
      coalesce(t.version,r.processing_version) version,coalesce(b.version,0) as "overrideVersion",coalesce(p.version,0) as "projectionVersion",coalesce(t.excluded,false) excluded
     from latest e left join money_transactions t on t.user_id=e.user_id and t.id=e.subject_id and e.payload->>'kind'='TRANSACTION'
     left join money_raw_notifications r on r.user_id=e.user_id and r.id=e.subject_id and e.payload->>'kind'='RAW'
     left join money_bookkeeping_overrides b on b.user_id=e.user_id and b.transaction_id=t.id and b.slot=0
     left join money_rule_projections p on p.user_id=e.user_id and p.transaction_id=t.id
     where e.active and (e.kind in ('CONFIRM','NON_TRANSACTION','TRANSFER_CONFIRM') or e.kind='UNDO' and e.payload->>'restoredDecision'='true') and (t.id is not null or r.id is not null)
      and (e.kind='TRANSFER_CONFIRM' and t.type='TRANSFER' or e.kind='NON_TRANSACTION' and (e.payload->'after'->>'version')::bigint=coalesce(t.version,r.processing_version)
       or e.kind in ('CONFIRM','UNDO') and (e.payload->'after'->>'transactionVersion')::bigint=t.version and (e.payload->'after'->>'overrideVersion')::bigint=coalesce(b.version,0) and (e.payload->'after'->>'projectionVersion')::bigint=coalesce(p.version,0))
    )
    """;
   var args=new ArrayList<Object>(List.of(owner()));String filter=" from completed where true";
   if(type!=null){filter+=" and \"reviewType\"=?";args.add(type);}if(accountId!=null){filter+=" and \"accountId\"=?";args.add(accountId);}if(search!=null&&!search.isBlank()){filter+=" and position(lower(?) in lower(coalesce(title,'')||' '||coalesce(merchant,'')))>0";args.add(search.strip());}
   long total=db.queryForObject(base+"select count(*)"+filter,Long.class,args.toArray());args.add(limit);args.add(offset);var queued=rows(base+"select *"+filter+" order by \"occurredAt\" desc,id limit ? offset ?",args.toArray());var context=context(queued);for(var row:queued)result.add(enrich(row,false,context));return Map.of("items",result,"total",total,"bounded",false);
  } else {
   String base=MoneyReviewService.QUEUE+"""
    , ai_queue as (select q.*,case
     when a.active and a.kind in ('DEFER','REOPEN') and
      (case when q.kind='RAW' then (a.payload->'after'->>'version')::bigint=q.version else
       (a.payload->'after'->>'transactionVersion')::bigint=q.version and
       (a.payload->'after'->>'overrideVersion')::bigint=q."overrideVersion" and
       (a.payload->'after'->>'projectionVersion')::bigint=q."projectionVersion" end)
     then case when a.kind='DEFER' then 'DEFERRED' else 'PENDING' end else q.state end as "aiState",
     case when q."transferPartnerId" is not null then 'TRANSFER' when q.kind='RAW' and q.lane='FORMAT' then 'NOISE' else 'CLASSIFICATION' end as "reviewType"
     from queue q left join lateral(select active,kind,payload from money_ai_events a where a.user_id=? and a.subject_id=q.id order by created_at desc,id desc limit 1) a on true)
    """;
   var args=new ArrayList<Object>(List.of(owner(),owner(),state));String filter=" from ai_queue where \"aiState\"=?";
   if(type!=null){filter+=" and \"reviewType\"=?";args.add(type);}if(accountId!=null){filter+=" and \"accountId\"=?";args.add(accountId);}if(search!=null&&!search.isBlank()){filter+=" and position(lower(?) in lower(coalesce(title,'')||' '||coalesce(merchant,'')))>0";args.add(search.strip());}
   long total=db.queryForObject(base+"select count(*)"+filter,Long.class,args.toArray());args.add(limit);args.add(offset);
   var queued=rows(base+"select *"+filter+" order by \"occurredAt\",id limit ? offset ?",args.toArray());
   var context=context(queued);for(var row:queued){try{row.put("state",row.get("aiState"));result.add(enrich(row,false,context));}catch(ResourceNotFoundException ignored){/* existing MONEY statistics visibility rules are preserved */}}
   return Map.of("items",result,"total",total,"bounded",false);
  }
 }
 @Transactional(readOnly=true) public Map<String,Object> item(UUID id,String kind,boolean detail){
  require(Set.of("TRANSACTION","RAW").contains(kind),"기록 유형을 확인하세요.");
  var found=rows(MoneyReviewService.QUEUE+"select * from queue where id=? and kind=?",owner(),id,kind);
  Map<String,Object> row;
  if(!found.isEmpty())row=found.getFirst();
  else if(kind.equals("TRANSACTION")){var tx=money.transaction(id);if(tx.excluded()||tx.type()==TransactionType.TRANSFER){row=new LinkedHashMap<>();row.put("id",id);row.put("title",tx.title());row.put("memo",tx.memo());row.put("categoryId",tx.categoryId());row.put("amount",tx.amount());row.put("type",tx.type().name());row.put("accountId",tx.fromAccountId()!=null?tx.fromAccountId():tx.toAccountId());row.put("occurredAt",tx.occurredAt());row.put("excluded",tx.excluded());}else{row=new LinkedHashMap<>(web.bookkeepingRow(id));row.put("overrideVersion",row.get("version"));}row.put("version",tx.version());row.put("merchant",row.containsKey("counterpartyText")?row.get("counterpartyText"):tx.counterpartyText());row.put("kind",kind);row.put("state","COMPLETED");row.put("reason","CATEGORY_CONFIRMED");}
  else{var raw=money.notification(id);row=new LinkedHashMap<>();row.put("id",id);row.put("kind",kind);row.put("title",raw.title());row.put("merchant",raw.sourcePackage());row.put("version",raw.processingVersion());row.put("occurredAt",raw.postedAt());row.put("state",raw.state()==ProcessingState.PROCESSED?"COMPLETED":"PENDING");row.put("reason",raw.processingReason());row.put("noiseSuspected",true);}
  return enrich(row,detail);
 }
 private record Context(Map<UUID,Map<String,Object>> books,List<Map<String,Object>> identities,List<Map<String,Object>> history,List<Map<String,Object>> external,List<Map<String,Object>> rules,Map<UUID,Map<String,Object>> latest,Set<UUID> activeCategories,List<Map<String,Object>> categoryNames){}
 /** Page-sized batch reads: database round trips do not grow with the number of review rows. */
 private Context context(List<Map<String,Object>> page){
  var ids=page.stream().map(r->(UUID)r.get("id")).toArray(UUID[]::new);var descriptors=page.stream().map(r->Objects.toString(r.get("merchant"),"").toLowerCase(Locale.ROOT)).distinct().toArray(String[]::new);
  var books=new HashMap<UUID,Map<String,Object>>();var latest=new HashMap<UUID,Map<String,Object>>();if(page.isEmpty())return new Context(books,List.of(),List.of(),List.of(),List.of(),latest,Set.of(),List.of());
  for(var book:rows(MoneyWebService.BOOK_BASE+"select * from effective where id=any(?)",owner(),ids)){for(String field:List.of("overrides","source","ruleDefaults","ruleEvidence"))book.put(field,object(book.get(field)));books.put((UUID)book.get("id"),book);}
  var identities=rows("select id,descriptor,name,region,aliases::text,evidence::text,version from money_ai_merchants where user_id=? and (lower(descriptor)=any(?) or exists(select 1 from jsonb_array_elements_text(aliases) a where lower(a)=any(?)))",owner(),descriptors,descriptors);identities.forEach(this::decodeMerchant);
  var history=rows("""
   with relevant as (
    select d.transaction_id as id,d.displayed->>'categoryId' as "categoryId",d.completed_at as "completedAt",lower(case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end) merchant,t.type,
     row_number() over(partition by lower(case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end),t.type order by d.completed_at desc) position
    from money_review_decisions d join money_transactions t on t.id=d.transaction_id and t.user_id=d.user_id
    left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id and b.slot=0
    left join money_rule_projections p on p.user_id=t.user_id and p.transaction_id=t.id
    join money_categories c on c.user_id=d.user_id and c.id=(d.displayed->>'categoryId')::uuid and not c.archived
    left join money_categories parent on parent.id=c.parent_id and parent.user_id=c.user_id
    where d.user_id=? and lower(case when jsonb_exists(b.overrides,'counterpartyText') then b.overrides->>'counterpartyText' else t.counterparty_text end)=any(?) and not t.excluded and t.merged_into is null
     and d.transaction_version=t.version and d.override_version=coalesce(b.version,0) and d.projection_version=coalesce(p.version,0) and not coalesce(parent.archived,false)
   ) select * from relevant where position<=21 order by "completedAt" desc
   """,owner(),descriptors);
  var external=rows("select * from (select id,query,status,result::text,error_code as \"errorCode\",created_at as \"createdAt\",row_number() over(partition by query order by created_at desc) position from money_ai_lookups where user_id=? and lower(split_part(query,' | ',1))=any(?)) x where position<=5 order by \"createdAt\" desc,id desc",owner(),descriptors);external.forEach(r->r.put("result",object(r.get("result"))));
  for(var e:rows("select distinct on(subject_id) id,subject_id as \"subjectId\",kind,payload::text,active,created_at as \"createdAt\" from money_ai_events where user_id=? and subject_id=any(?) order by subject_id,created_at desc,id desc",owner(),ids)){e.put("payload",object(e.get("payload")));latest.put((UUID)e.get("subjectId"),e);}
  var categoryNames=rows("select c.id,c.name,c.kind from money_categories c left join money_categories p on p.id=c.parent_id and p.user_id=c.user_id where c.user_id=? and not c.archived and not coalesce(p.archived,false)",owner());var activeCategories=new HashSet<>(categoryNames.stream().map(c->(UUID)c.get("id")).toList());return new Context(books,identities,history,external,meaning.rules(),latest,activeCategories,categoryNames);
 }
 private Map<String,Object> enrich(Map<String,Object> row,boolean detail){return enrich(row,detail,context(List.of(row)));}
 private Map<String,Object> enrich(Map<String,Object> row,boolean detail,Context context){
  UUID id=(UUID)row.get("id");String kind=Objects.toString(row.get("kind"));
  var book=context.books().getOrDefault(id,Map.of());if(!book.isEmpty()){for(String field:List.of("title","memo","categoryId","amount","type","accountId"))row.put(field,book.get(field));row.put("merchant",book.get("counterpartyText"));}
  String merchant=Objects.toString(row.get("merchant"),"");Map<String,Object> current=new LinkedHashMap<>();for(String k:List.of("title","memo","categoryId","amount","type","accountId"))current.put(k,row.get(k));current.put("merchant",merchant);
  if(!book.isEmpty()){row.put("transactionVersion",book.get("transactionVersion"));row.put("overrideVersion",book.get("version"));row.put("projectionVersion",book.get("projectionVersion"));}
  String reviewType=row.containsKey("reviewType")?Objects.toString(row.get("reviewType")):row.get("transferPartnerId")!=null||"POSSIBLE_INTERNAL_TRANSFER".equals(row.get("reason"))?"TRANSFER":Boolean.TRUE.equals(row.get("noiseSuspected"))||kind.equals("RAW")&&"FORMAT".equals(row.get("lane"))?"NOISE":"CLASSIFICATION";
  row.put("reviewType",reviewType);row.put("current",current);
  var identity=context.identities().stream().filter(r->merchant.equalsIgnoreCase(r.get("descriptor").toString())||((List<?>)r.get("aliases")).stream().anyMatch(a->merchant.equalsIgnoreCase(a.toString()))).toList();
  var history=merchant.isBlank()||intermediary(merchant)?List.<Map<String,Object>>of():context.history().stream().filter(r->!id.equals(r.get("id"))&&merchant.equalsIgnoreCase(r.get("merchant").toString())&&Objects.equals(row.get("type"),r.get("type"))).limit(20).toList();
  var facts=new LinkedHashMap<>(current);facts.put("accountId",Objects.toString(current.get("accountId"),""));
  var applicable=context.rules().stream().filter(r->"ACTIVE".equals(r.get("status"))&&(r.get("categoryId")==null||context.activeCategories().contains(r.get("categoryId")))).filter(r->{var conditions=json.readValue(json.writeValueAsString(r.get("conditions")),MoneyRuleEngine.Condition[].class);return Arrays.stream(conditions).allMatch(c->MoneyRuleEngine.matches(facts,c));}).toList();
  Map<String,Object> proposal=new LinkedHashMap<>();proposal.put("categoryId",null);proposal.put("basis","NONE");proposal.put("reason","확정 이력이나 적용 가능한 규칙이 부족하여 제안 없음");
  boolean overrideCategory=!book.isEmpty()&&((Map<?,?>)book.get("overrides")).containsKey("categoryId");
  var categoryRule=applicable.stream().filter(r->r.get("categoryId")!=null).findFirst();if(!overrideCategory&&categoryRule.isPresent()){proposal.put("categoryId",categoryRule.get().get("categoryId"));proposal.put("basis","EXPLICIT_RULE");proposal.put("reason","현재 거래에 적용 가능한 승인된 규칙");}
  else if(!overrideCategory&&!history.isEmpty()&&history.stream().map(r->r.get("categoryId")).distinct().count()==1){proposal.put("categoryId",history.getFirst().get("categoryId"));proposal.put("basis","CONFIRMED_HISTORY");proposal.put("reason","같은 거래처·거래 유형의 유효한 확정 이력 "+history.size()+"건");}
  if(overrideCategory)proposal.put("reason","기존 사용자 분류를 보존합니다.");
  var external=context.external().stream().filter(r->merchant.equalsIgnoreCase(r.get("query").toString().split(" \\| ",2)[0])).toList();
  if(!overrideCategory&&history.isEmpty()&&"NONE".equals(proposal.get("basis"))&&!intermediary(merchant)&&Set.of("EXPENSE","INCOME").contains(Objects.toString(row.get("type")))){
   var successful=external.stream().filter(r->"SUCCEEDED".equals(r.get("status"))).findFirst();if(successful.isPresent()){var lookup=successful.get();var result=(Map<String,Object>)lookup.get("result");UUID category=externalCategory(result,Objects.toString(row.get("type")),context.categoryNames());if(category!=null){proposal.put("categoryId",category);proposal.put("basis","EXTERNAL_EVIDENCE");proposal.put("reason","실제 검색 출처의 후보 업종이 현재 활성 카테고리 한 개와 정확히 일치합니다. 거래처·지점은 미확정이며 사용자 확인이 필요합니다.");proposal.put("lookupId",lookup.get("id"));proposal.put("retrievedAt",result.get("retrievedAt"));proposal.put("uncertainty",result.get("uncertainty"));}}
  }
  var evidence=new LinkedHashMap<String,Object>();evidence.put("summary",proposal.get("reason"));evidence.put("confirmedDecisions",history);evidence.put("rules",applicable);evidence.put("external",external);evidence.put("merchantIdentity",identity.isEmpty()?null:identity.getFirst());
  row.put("proposal",proposal);row.put("evidence",evidence);var event=context.latest().get(id);if(event!=null){row.put("eventId",event.get("id"));var payload=(Map<String,Object>)event.get("payload");var after=(Map<String,Object>)payload.get("after");boolean currentEvent=after==null||versionsMatch(row,after,kind);if(Boolean.TRUE.equals(event.get("active"))&&currentEvent){if("DEFER".equals(event.get("kind")))row.put("state","DEFERRED");if(Set.of("CONFIRM","NON_TRANSACTION").contains(event.get("kind")))row.put("state","COMPLETED");if("REOPEN".equals(event.get("kind")))row.put("state","PENDING");}row.put("canUndo",currentEvent&&Boolean.TRUE.equals(event.get("active"))&&Set.of("CONFIRM","NON_TRANSACTION","DEFER").contains(event.get("kind")));}
  if(detail){row.put("history",events(id,50));row.put("rawSources",kind.equals("RAW")?List.of(money.notification(id)):money.transaction(id).sources().stream().map(s->money.notification(s.rawEventId())).toList());}
  if(row.get("candidate")!=null&&!(row.get("candidate") instanceof Map))row.put("candidate",object(row.get("candidate")));return row;
 }
 static boolean intermediary(String descriptor){String d=descriptor.replaceAll("[\\s·_-]","").toLowerCase(Locale.ROOT);return Set.of("네이버페이","naverpay","카카오페이","kakaopay","토스페이","tosspay","쿠팡","coupang","11번가","g마켓","옥션").contains(d);}
 /** A lookup may support a review proposal only; labels, amounts and rules remain untouched. */
 static UUID externalCategory(Map<String,Object> result,String kind,List<Map<String,Object>> categories){
  if(!Boolean.TRUE.equals(result.get("available"))||!(result.get("candidates") instanceof List<?> candidates)||candidates.isEmpty()||!(result.get("sources") instanceof List<?> sources)||sources.isEmpty())return null;
  try{if(Instant.parse(Objects.toString(result.get("retrievedAt"),"")).isBefore(Instant.now().minus(Duration.ofHours(24))))return null;}catch(RuntimeException e){return null;}
  var urls=new HashSet<String>();for(Object value:sources)if(value instanceof Map<?,?> source&&source.get("url") instanceof String url)urls.add(url);
  String industry=null;for(Object value:candidates){if(!(value instanceof Map<?,?> candidate)||!(candidate.get("name") instanceof String candidateName)||candidateName.isBlank()||!(candidate.get("industry") instanceof String label)||label.isBlank()||!(candidate.get("sourceUrls") instanceof List<?> refs)||refs.isEmpty())return null;
   if(refs.stream().anyMatch(ref->!(ref instanceof String)||!urls.contains(ref)))return null;String exact=label.strip();if(industry==null)industry=exact;else if(!industry.equals(exact))return null;
  }
  String exact=industry;var matching=categories.stream().filter(c->kind.equals(c.get("kind"))&&exact.equals(c.get("name"))).toList();return matching.size()==1?(UUID)matching.getFirst().get("id"):null;
 }
 private static boolean versionsMatch(Map<String,Object> row,Map<String,Object> after,String kind){for(String key:kind.equals("RAW")||after.containsKey("version")&&!after.containsKey("transactionVersion")?List.of("version"):List.of("transactionVersion","overrideVersion","projectionVersion"))if(after.get(key)!=null&&(row.get(key)==null||number(row.get(key))!=number(after.get(key))))return false;return true;}

 public record Decision(UUID id,String kind,String action,Long transactionVersion,Long overrideVersion,Long projectionVersion,Long version,Map<String,Object> overrides,String reason){}
 public Map<String,Object> decide(Decision input){
  lock();require(input!=null&&input.id()!=null&&Set.of("RAW","TRANSACTION").contains(Objects.toString(input.kind(),"")),"검토할 기록을 선택하세요.");text(input.reason(),1000,false,"사유");
  String action=Objects.toString(input.action(),"");require(Set.of("CONFIRM","DEFER","REOPEN","NON_TRANSACTION","REVIEW_TRANSACTION").contains(action),"결정을 확인하세요.");
  Map<String,Object> before=item(input.id(),input.kind(),false),payload=new LinkedHashMap<>();payload.put("kind",input.kind());payload.put("before",before);payload.put("reason",input.reason());
  if(input.kind().equals("RAW")){
   version(before.get("version"),input.version());
   switch(action){case "DEFER"->web.deferReview(input.id(),input.version());case "REOPEN","REVIEW_TRANSACTION"->{var raw=money.notification(input.id());if(raw.state()==ProcessingState.PROCESSED)product.restoreNotification(input.id(),input.version());else db.update("update money_raw_notifications set review_deferred=false,processing_version=processing_version+1 where user_id=? and id=?",owner(),input.id());action="REOPEN";}case "NON_TRANSACTION"->review.ignore(new MoneyReviewService.RawSelections(List.of(new MoneyReviewService.RawSelection(input.id(),input.version()))));default->throw new InvalidRequestException("미등록 알림은 기존 거래 검토에서 계좌·금액을 확인하여 등록하세요.");}
  }else{
   var book=web.bookkeepingRow(input.id());version(book.get("transactionVersion"),input.transactionVersion());version(book.get("version"),input.overrideVersion());version(book.get("projectionVersion"),input.projectionVersion());
   if(action.equals("CONFIRM")){var prior=rows("select displayed::text,completed_at as \"completedAt\" from money_review_decisions where user_id=? and transaction_id=?",owner(),input.id());payload.put("beforeDecision",prior.isEmpty()?null:prior.getFirst());payload.put("previousConfirmedEventIds",rows("select id from money_ai_events where user_id=? and subject_id=? and kind='CONFIRM' and active",owner(),input.id()).stream().map(r->r.get("id")).toList());db.update("update money_ai_events set active=false where user_id=? and subject_id=? and kind='CONFIRM' and active",owner(),input.id());}
   switch(action){case "CONFIRM"->{review.complete(new MoneyReviewService.Complete(List.of(new MoneyReviewService.Completion(input.id(),input.transactionVersion(),input.overrideVersion(),input.projectionVersion(),input.overrides()))));payload.put("beforeOverrides",book.get("overrides"));}case "DEFER"->{}case "REOPEN","REVIEW_TRANSACTION"->action="REOPEN";case "NON_TRANSACTION"->{var t=money.transaction(input.id());require(Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(t.type()),"이체·환불·대출은 전용 금융 수정 화면에서 확인하세요.");product.save(t.id(),new MoneyProductService.Entry(t.type(),t.fromAccountId(),t.toAccountId(),t.amount(),t.occurredAt(),t.counterpartyText(),t.categoryId(),t.memo(),true,t.refundOf(),t.version(),t.title()));payload.put("beforeFact",t);}default->throw new InvalidRequestException("결정을 확인하세요.");}
  }
  Map<String,Object> after;if(action.equals("NON_TRANSACTION")&&input.kind().equals("TRANSACTION")){after=new LinkedHashMap<>(Map.of("version",money.transaction(input.id()).version()));}else after=item(input.id(),input.kind(),false);
  payload.put("after",after);UUID eventId=event(input.id(),action,payload,null);meaning.audit(input.id(),"AI_"+action,before,after);
  if(action.equals("NON_TRANSACTION")&&input.kind().equals("TRANSACTION"))return Map.of("eventId",eventId,"item",after);
  return Map.of("eventId",eventId,"item",item(input.id(),input.kind(),false));
 }
 public Map<String,Object> undo(UUID id){
  lock();var matches=rows("select id,subject_id as \"subjectId\",kind,payload::text,active,created_at as \"createdAt\" from money_ai_events where user_id=? and id=?",owner(),id);if(matches.isEmpty())throw new ResourceNotFoundException("결정 이력을 찾을 수 없습니다.");var event=matches.getFirst();event.put("payload",object(event.get("payload")));require(Boolean.TRUE.equals(event.get("active")),"이미 취소된 결정입니다.");UUID subject=(UUID)event.get("subjectId");var last=latest(subject);require(id.equals(last.get("id")),"이후 결정이 있어 취소할 수 없습니다.");var payload=(Map<String,Object>)event.get("payload");var after=(Map<String,Object>)payload.get("after");String kind=Objects.toString(payload.get("kind"));String action=Objects.toString(event.get("kind"));
  if(kind.equals("RAW")){var raw=money.notification(subject);version(raw.processingVersion(),number(after.get("version")));if(action.equals("NON_TRANSACTION"))product.restoreNotification(subject,raw.processingVersion());else if(action.equals("DEFER")){var before=(Map<String,Object>)payload.get("before");db.update("update money_raw_notifications set review_deferred=?,processing_version=processing_version+1 where user_id=? and id=?","DEFERRED".equals(before.get("state")),owner(),subject);}else throw new InvalidRequestException("이 결정은 취소할 수 없습니다.");}
  else if(action.equals("CONFIRM")){var book=web.bookkeepingRow(subject);version(book.get("transactionVersion"),number(after.get("transactionVersion")));version(book.get("version"),number(after.get("overrideVersion")));version(book.get("projectionVersion"),number(after.get("projectionVersion")));var restored=web.saveBookkeeping(subject,new MoneyWebTypes.BookkeepingEdit(number(book.get("version")),number(book.get("transactionVersion")),(Map<String,Object>)payload.get("beforeOverrides"),number(book.get("projectionVersion"))));
   var beforeDecision=(Map<String,Object>)payload.get("beforeDecision");if(beforeDecision==null)db.update("delete from money_review_decisions where user_id=? and transaction_id=?",owner(),subject);else db.update("update money_review_decisions set transaction_version=?,override_version=?,projection_version=?,displayed=cast(? as jsonb),completed_at=? where user_id=? and transaction_id=?",restored.get("transactionVersion"),restored.get("version"),restored.get("projectionVersion"),json.writeValueAsString(restored),Timestamp.from(Instant.parse(beforeDecision.get("completedAt").toString())),owner(),subject);
   var priorEvents=(List<Object>)payload.get("previousConfirmedEventIds");if(priorEvents!=null)for(Object prior:priorEvents)db.update("update money_ai_events set active=true where user_id=? and id=?",owner(),uuid(prior));
  }
  else if(action.equals("NON_TRANSACTION")){var fact=json.readValue(json.writeValueAsString(payload.get("beforeFact")),MoneyTransaction.class);var now=money.transaction(subject);version(now.version(),number(after.get("version")));product.save(subject,new MoneyProductService.Entry(fact.type(),fact.fromAccountId(),fact.toAccountId(),fact.amount(),fact.occurredAt(),fact.counterpartyText(),fact.categoryId(),fact.memo(),fact.excluded(),fact.refundOf(),now.version(),fact.title()));}
  else if(action.equals("DEFER")){var book=web.bookkeepingRow(subject);version(book.get("transactionVersion"),number(after.get("transactionVersion")));version(book.get("version"),number(after.get("overrideVersion")));version(book.get("projectionVersion"),number(after.get("projectionVersion")));}else throw new InvalidRequestException("이 결정은 취소할 수 없습니다.");
  db.update("update money_ai_events set active=false where user_id=? and id=?",owner(),id);var undoPayload=new LinkedHashMap<String,Object>();undoPayload.put("reversedEventId",id);undoPayload.put("kind",kind);boolean restoredDecision=action.equals("CONFIRM")&&payload.get("beforeDecision")!=null;undoPayload.put("restoredDecision",restoredDecision);if(restoredDecision)undoPayload.put("after",item(subject,kind,false));event(subject,"UNDO",undoPayload,null);meaning.audit(subject,"AI_UNDO",event,Map.of("reversedEventId",id));return Map.of("undone",true);
 }

 public record TransferInput(UUID expenseId,UUID incomeId,Long expenseVersion,Long incomeVersion,String idempotencyKey){}
 @Transactional(readOnly=true) public Map<String,Object> transfers(){
  var pairs=rows("""
   select e.id as "expenseId",i.id as "incomeId" from money_transactions e join money_transactions i on i.user_id=e.user_id
    and i.type='INCOME' and not i.excluded and i.merged_into is null and i.amount=e.amount and i.currency=e.currency and i.to_account_id<>e.from_account_id
    and abs(extract(epoch from i.occurred_at-e.occurred_at))<=600
   join money_accounts a on a.id=e.from_account_id and a.user_id=e.user_id and not a.archived
   join money_accounts b on b.id=i.to_account_id and b.user_id=i.user_id and not b.archived
   where e.user_id=? and e.type='EXPENSE' and not e.excluded and e.merged_into is null
    and not exists(select 1 from money_transactions r where r.user_id=e.user_id and r.refund_of in(e.id,i.id))
    and not exists(select 1 from money_meaning_audit d where d.user_id=e.user_id and d.subject_id=e.id and d.action='TRANSFER_PAIR_DISMISSED' and d.next_value->>'otherId'=i.id::text)
    and not exists(select 1 from money_ai_events d where d.user_id=e.user_id and d.subject_id in(e.id,i.id) and d.kind='DEFER' and d.active
      and (d.payload->'after'->>'transactionVersion')::bigint=(case when d.subject_id=e.id then e.version else i.version end)
      and (d.payload->'after'->>'overrideVersion')::bigint=coalesce((select version from money_bookkeeping_overrides b where b.user_id=d.user_id and b.transaction_id=d.subject_id and b.slot=0),0)
      and (d.payload->'after'->>'projectionVersion')::bigint=coalesce((select version from money_rule_projections p where p.user_id=d.user_id and p.transaction_id=d.subject_id),0)
      and not exists(select 1 from money_ai_events newer where newer.user_id=d.user_id and newer.subject_id=d.subject_id and newer.created_at>d.created_at))
   order by e.occurred_at desc limit 100
   """,owner());
  var result=pairs.stream().map(p->{var e=money.transaction((UUID)p.get("expenseId"));var i=money.transaction((UUID)p.get("incomeId"));var evidence=new LinkedHashMap<String,Object>();evidence.put("equalAmount",true);evidence.put("sameCurrency",true);evidence.put("differentOwnedAccounts",true);evidence.put("secondsApart",Math.abs(Duration.between(e.occurredAt(),i.occurredAt()).toSeconds()));evidence.put("identifierMatch",!Objects.toString(e.counterpartyText(),"").isBlank()&&Objects.equals(e.counterpartyText(),i.counterpartyText()));evidence.put("sourceEvidence",!e.sources().isEmpty()&&!i.sources().isEmpty());evidence.put("summary","금액·통화·소유 계좌·시각을 비교한 후보입니다. 식별자와 양쪽 원문을 확인한 후 승인하세요.");return Map.<String,Object>of("expense",e,"income",i,"evidence",evidence,"requiresApproval",true);}).toList();return Map.of("items",result);
 }
 public Map<String,Object> confirmTransfer(TransferInput input){
  lock();require(input!=null&&input.expenseId()!=null&&input.incomeId()!=null,"이체 후보를 선택하세요.");text(input.idempotencyKey(),100,true,"중복 방지 키");var replay=rows("select payload::text from money_ai_events where user_id=? and idempotency_key=? and kind='TRANSFER_CONFIRM'",owner(),input.idempotencyKey());if(!replay.isEmpty()){var payload=object(replay.getFirst().get("payload"));require(input.expenseId().toString().equals(Objects.toString(payload.get("expenseId")))&&input.incomeId().toString().equals(Objects.toString(payload.get("incomeId"))),"동일 키에 다른 이체가 요청되었습니다.");return payload;}
  var e=money.transaction(input.expenseId());var i=money.transaction(input.incomeId());require(e.type()==TransactionType.EXPENSE&&i.type()==TransactionType.INCOME&&e.mergedInto()==null&&i.mergedInto()==null&&Duration.between(e.occurredAt(),i.occurredAt()).abs().compareTo(Duration.ofSeconds(600))<=0,"호환되지 않는 이체 후보입니다.");meaning.ownedAccount(e.fromAccountId());meaning.ownedAccount(i.toAccountId());var linked=product.link(e.id(),new MoneyProductService.Pair(i.id(),input.expenseVersion(),input.incomeVersion()));var payload=new LinkedHashMap<String,Object>();payload.put("expenseId",e.id());payload.put("incomeId",i.id());payload.put("transaction",linked);payload.put("kind","TRANSACTION");event(e.id(),"TRANSFER_CONFIRM",payload,input.idempotencyKey());return payload;
 }
 public Map<String,Object> unrelated(MoneyReviewService.PairDismissal input){lock();var result=review.dismissPair(input);event(input.expenseId(),"TRANSFER_UNRELATED",Map.of("kind","TRANSACTION","incomeId",input.incomeId()),null);return result;}

 private void decodeMerchant(Map<String,Object> row){row.put("aliases",json.readValue(Objects.toString(row.get("aliases"),"[]"),List.class));row.put("evidence",object(row.get("evidence")));}
 @Transactional(readOnly=true) public Map<String,Object> merchants(){var identities=rows("select id,descriptor,name,region,aliases::text,evidence::text,version from money_ai_merchants where user_id=? order by name,id",owner());identities.forEach(this::decodeMerchant);var unresolved=rows("select counterparty_text as descriptor,count(*) count from money_transactions t where user_id=? and counterparty_text is not null and not excluded and merged_into is null and not exists(select 1 from money_ai_merchants m where m.user_id=t.user_id and lower(m.descriptor)=lower(t.counterparty_text)) group by counterparty_text order by count(*) desc limit 100",owner());return Map.of("items",identities,"unresolved",unresolved);}
 public record MerchantInput(UUID id,String descriptor,String name,String region,List<String> aliases,Long expectedVersion){}
 public Map<String,Object> merchant(MerchantInput input){lock();require(input!=null,"거래처 정보가 필요합니다.");text(input.descriptor(),500,true,"거래처 설명");text(input.name(),160,true,"거래처 이름");text(input.region(),120,false,"지역");require(!intermediary(input.descriptor()),"결제 중개사 전체를 하나의 거래처로 연결할 수 없습니다. 구체적인 거래처 설명을 입력하세요.");require(input.aliases()!=null&&input.aliases().size()<=20,"별칭은 최대 20개입니다.");input.aliases().forEach(a->{text(a,500,true,"별칭");require(!intermediary(a),"결제 중개사 전체를 별칭으로 지정할 수 없습니다.");});UUID id=input.id();var labels=new ArrayList<String>();labels.add(input.descriptor().strip().toLowerCase(Locale.ROOT));for(String alias:input.aliases())labels.add(alias.strip().toLowerCase(Locale.ROOT));require(new HashSet<>(labels).size()==labels.size(),"거래처 설명과 별칭이 중복됩니다.");require(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_ai_merchants where user_id=? and (?::uuid is null or id<>?::uuid) and (lower(descriptor)=any(?) or exists(select 1 from jsonb_array_elements_text(aliases) a where lower(a)=any(?))))",Boolean.class,owner(),id,id,labels.toArray(new String[0]),labels.toArray(new String[0]))),"다른 거래처에 연결된 설명·별칭입니다. 먼저 기존 연결을 확인하세요.");if(id!=null){var existing=rows("select version from money_ai_merchants where user_id=? and id=?",owner(),id);if(existing.isEmpty())throw new ResourceNotFoundException("거래처를 찾을 수 없습니다.");version(existing.getFirst().get("version"),input.expectedVersion());db.update("update money_ai_merchants set descriptor=?,name=?,region=?,aliases=cast(? as jsonb),version=version+1 where user_id=? and id=?",input.descriptor().strip(),input.name().strip(),input.region(),json.writeValueAsString(input.aliases()),owner(),id);}else{id=UUID.randomUUID();db.update("insert into money_ai_merchants(id,user_id,descriptor,name,region,aliases,evidence,version) values(?,?,?,?,?,cast(? as jsonb),cast(? as jsonb),1)",id,owner(),input.descriptor().strip(),input.name().strip(),input.region(),json.writeValueAsString(input.aliases()),json.writeValueAsString(Map.of("origin","OWNER_CONFIRMED","confirmedAt",Instant.now())));}
  event(id,"MERCHANT_LINK",Map.of("descriptor",input.descriptor(),"name",input.name(),"scope","IDENTITY_ONLY"),null);var result=rows("select id,descriptor,name,region,aliases::text,evidence::text,version from money_ai_merchants where user_id=? and id=?",owner(),id).getFirst();decodeMerchant(result);return result;}
 @Transactional(readOnly=true) public Map<String,Object> settings(){var values=rows("select version,automatic_rules as \"automaticRules\",external_lookup as \"externalLookup\" from money_ai_settings where user_id=?",owner());return values.isEmpty()?Map.of("version",0L,"automaticRules",false,"externalLookup",false):values.getFirst();}
 public record SettingsInput(Long expectedVersion,Boolean automaticRules,Boolean externalLookup){}
 public Map<String,Object> settings(SettingsInput input){lock();require(input!=null&&input.externalLookup()!=null&&input.automaticRules()!=null,"설정을 확인하세요.");version(settings().get("version"),input.expectedVersion());db.update("insert into money_ai_settings(user_id,version,automatic_rules,external_lookup) values(?,1,?,?) on conflict(user_id) do update set version=money_ai_settings.version+1,automatic_rules=excluded.automatic_rules,external_lookup=excluded.external_lookup",owner(),input.automaticRules(),input.externalLookup());event(owner(),"SETTINGS",Map.of("externalLookup",input.externalLookup(),"automaticRules",input.automaticRules(),"scope","EXPLICIT_IDENTITY_TYPE_ACCOUNT_RULES_ONLY"),null);return settings();}
 public record MerchantRule(UUID merchantId,UUID ruleId,MoneyMeaningService.RuleInput rule){}
 public Map<String,Object> merchantRule(MerchantRule input){
  lock();require(input!=null&&input.merchantId()!=null&&input.rule()!=null,"확정된 거래처와 규칙을 선택하세요.");var identities=rows("select descriptor,name from money_ai_merchants where user_id=? and id=?",owner(),input.merchantId());if(identities.isEmpty())throw new ResourceNotFoundException("확정된 거래처를 찾을 수 없습니다.");String descriptor=identities.getFirst().get("descriptor").toString();var conditions=input.rule().conditions();require(conditions!=null,"적용 조건이 필요합니다.");
  require(conditions.stream().anyMatch(c->"merchant".equals(c.field())&&"EXACT".equals(c.operator())&&descriptor.equalsIgnoreCase(c.value())),"확정한 거래처 설명과 정확히 일치하는 조건이 필요합니다.");
  require(conditions.stream().anyMatch(c->"type".equals(c.field())&&"EXACT".equals(c.operator())),"수입·지출 유형 조건이 필요합니다.");require(conditions.stream().anyMatch(c->"accountId".equals(c.field())&&"EXACT".equals(c.operator())),"자동 분류할 소유 계좌 조건이 필요합니다.");
  String mixed=(descriptor+" "+identities.getFirst().get("name")).toLowerCase(Locale.ROOT);if(List.of("쿠팡","coupang","네이버","naver","11번가","g마켓","옥션","마트","백화점","market").stream().anyMatch(mixed::contains))require(conditions.stream().anyMatch(c->"title".equals(c.field())),"다양한 상품을 파는 거래처는 품목을 구분하는 제목 조건이 필요합니다.");
  var saved=meaning.saveRule(input.ruleId(),input.rule());UUID id=(UUID)saved.get("id");db.update("update money_category_rules set origin='AI_APPROVED' where user_id=? and id=?",owner(),id);event(id,"MERCHANT_RULE_APPROVED",Map.of("merchantId",input.merchantId(),"scope","FUTURE_ONLY","rule",saved),null);saved.put("origin","AI_APPROVED");return saved;
 }
 @Transactional(readOnly=true) public Map<String,Object> operations(){var counts=rows("select count(*) filter(where kind='CONFIRM' and active) confirmed,count(*) filter(where kind='DEFER' and active and not exists(select 1 from money_ai_events later where later.user_id=money_ai_events.user_id and later.subject_id=money_ai_events.subject_id and later.created_at>money_ai_events.created_at)) deferred,count(*) filter(where kind='UNDO') reversed from money_ai_events where user_id=?",owner()).getFirst();var lookupCounts=rows("select count(*) lookups,count(*) filter(where error_code is not null) as \"lookupErrors\" from money_ai_lookups where user_id=?",owner()).getFirst();counts.putAll(lookupCounts);var lookups=rows("select id,query,status,result::text,error_code as \"errorCode\",created_at as \"createdAt\" from money_ai_lookups where user_id=? order by created_at desc limit 50",owner());lookups.forEach(l->l.put("result",object(l.get("result"))));return Map.of("events",events(null,100),"rules",meaning.rules(),"lookups",lookups,"metrics",counts,"settings",settings(),"learningMode","CONFIRMED_HISTORY_RETRIEVAL");}
}
