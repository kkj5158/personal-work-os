package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static com.kafka.backend.money.MoneyService.*;

/** Approved category operations share the existing owner lock and metadata model. */
@Service @Transactional
public class MoneyAiCategoryService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final ObjectMapper json;private final MoneyMeaningService meaning;
 public MoneyAiCategoryService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json,MoneyMeaningService meaning){this.db=db;this.users=users;this.json=json;this.meaning=meaning;}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 private MoneyCategories categories(){return new MoneyCategories(db,owner(),json);}
 public record Merge(UUID targetId,String fingerprint,boolean confirmed){}
 public record Defer(String action,UUID targetId,String reason){}
 @Transactional(readOnly=true) public Map<String,Object> proposals(){
  var all=categories().list();var proposals=new ArrayList<Map<String,Object>>();
  var usage=new HashMap<UUID,long[]>();
  db.query("select category_id,count(*) from (select category_id,id from money_transactions where user_id=? and category_id is not null union select (overrides->>'categoryId')::uuid,transaction_id from money_bookkeeping_overrides where user_id=? and overrides->>'categoryId' is not null union select (defaults->>'categoryId')::uuid,transaction_id from money_rule_projections where user_id=? and defaults->>'categoryId' is not null union select (displayed->>'categoryId')::uuid,transaction_id from money_review_decisions where user_id=? and displayed->>'categoryId' is not null) refs group by category_id",r->{usage.computeIfAbsent(r.getObject(1,UUID.class),k->new long[2])[0]=r.getLong(2);},owner(),owner(),owner(),owner());
  db.query("select category_id,count(*) from money_category_rules where user_id=? and category_id is not null group by category_id",r->{usage.computeIfAbsent(r.getObject(1,UUID.class),k->new long[2])[1]=r.getLong(2);},owner());
  var deferred=db.queryForList("select subject_id,payload->>'action' action,payload->>'targetId' target from money_ai_events where user_id=? and kind='CATEGORY_DEFER' and active",owner());
  for(var source:all){if(source.effectiveArchived())continue;var used=usage.getOrDefault(source.id(),new long[2]);long children=all.stream().filter(c->source.id().equals(c.parentId())).count();
   // Deterministic evidence proposals are explicitly labelled; no fabricated model evaluation.
   for(var target:all){if(source.id().compareTo(target.id())<=0||target.effectiveArchived()||!source.kind().equals(target.kind())||!Objects.equals(source.parentId(),target.parentId()))continue;
    String a=normalize(source.name()),b=normalize(target.name());if(!a.equals(b)&&!(a.length()>=2&&b.length()>=2&&(a.contains(b)||b.contains(a))))continue;
    if(children>0||all.stream().anyMatch(c->target.id().equals(c.parentId())))continue;
    if(deferred.stream().anyMatch(d->source.id().equals(d.get("subject_id"))&&"MERGE".equals(d.get("action"))&&target.id().toString().equals(d.get("target"))))continue;
    proposals.add(Map.of("id",source.id()+":"+target.id(),"action","MERGE","sourceId",source.id(),"targetId",target.id(),"reason","실제 분류 이름이 유사합니다. 사용 기록과 전체 참조를 확인한 뒤 병합 여부를 결정하세요.","records",used[0],"basis","CATEGORY_USAGE_HEURISTIC"));
   }
   if(used[0]==0&&used[1]==0&&children==0&&!source.seeded()&&deferred.stream().noneMatch(d->source.id().equals(d.get("subject_id"))&&"DEACTIVATE".equals(d.get("action"))))proposals.add(Map.of("id",source.id()+":unused","action","DEACTIVATE","sourceId",source.id(),"reason","거래·규칙·하위 분류 참조가 없는 직접 만든 분류입니다. 비활성 여부를 검토하세요.","records",0,"basis","CATEGORY_USAGE_HEURISTIC"));
  }
  var history=db.queryForList("select subject_id as \"subjectId\",action,previous_value::text as \"previousValue\",next_value::text as \"nextValue\",created_at as \"createdAt\" from money_meaning_audit where user_id=? and action like 'CATEGORY_%' order by created_at desc,id desc limit 50",owner());
  return Map.of("proposals",proposals.stream().limit(50).toList(),"history",history,"basis","실제 분류 사용량에 근거한 검토 제안 · 자동 구조 변경 없음");
 }
 static String normalize(String name){return name.toLowerCase(Locale.ROOT).replaceAll("[\\s·/\\-]","");}
 @Transactional(readOnly=true) public Map<String,Object> preview(UUID from,UUID to){
  var source=categories().get(from);var target=categories().get(to);
  require(!from.equals(to)&&source.kind().equals(target.kind())&&!target.effectiveArchived()&&!source.effectiveArchived(),"활성 동일 유형 분류를 선택하세요.");
  require(Objects.equals(source.parentId(),target.parentId())&&categories().impact(from).children()==0&&categories().impact(to).children()==0,"전체 병합은 같은 위치의 하위 분류가 없는 분류끼리 가능합니다. 상위 구조는 먼저 확인하세요.");
  var refs=new LinkedHashMap<String,Object>();
  refs.put("facts",db.queryForList("select id,version from money_transactions where user_id=? and category_id=? order by id",owner(),from));
  refs.put("overrides",db.queryForList("select transaction_id,version from money_bookkeeping_overrides where user_id=? and overrides->>'categoryId'=? order by transaction_id",owner(),from.toString()));
  refs.put("projections",db.queryForList("select transaction_id,version from money_rule_projections where user_id=? and defaults->>'categoryId'=? order by transaction_id",owner(),from.toString()));
  refs.put("decisions",db.queryForList("select transaction_id,transaction_version,override_version,projection_version,completed_at from money_review_decisions where user_id=? and displayed->>'categoryId'=? order by transaction_id",owner(),from.toString()));
  refs.put("rules",db.queryForList("select id,version from money_category_rules where user_id=? and category_id=? order by id",owner(),from));
  refs.put("personalization",db.queryForList("select transaction_id,version,event_id from money_classification_state where user_id=? and category_id=? order by transaction_id",owner(),from));
  refs.put("drafts",db.queryForList("select id,version from money_ai_rule_drafts where user_id=? and status='OPEN' and rule_input->>'categoryId'=? order by id",owner(),from.toString()));
  var transactions=db.queryForList("select id,title,type,category_id as \"categoryId\" from money_transactions where user_id=? and id in (select id from money_transactions where user_id=? and category_id=? union select transaction_id from money_bookkeeping_overrides where user_id=? and overrides->>'categoryId'=? union select transaction_id from money_rule_projections where user_id=? and defaults->>'categoryId'=? union select transaction_id from money_review_decisions where user_id=? and displayed->>'categoryId'=?) order by occurred_at desc,id",owner(),owner(),from,owner(),from.toString(),owner(),from.toString(),owner(),from.toString());
  String fingerprint=hash(Map.of("source",source,"target",target,"references",refs));
  var result=new LinkedHashMap<String,Object>();result.put("source",source);result.put("target",target);result.put("fingerprint",fingerprint);result.put("transactions",transactions);result.put("count",transactions.size());result.put("references",refs.entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,e->((List<?>)e.getValue()).size())));result.put("scope","ALL_LIVE_CATEGORY_REFERENCES");result.put("before",List.of(source,target));result.put("after",Map.of("survivor",target,"archivedSource",source.id()));return result;
 }
 private String hash(Object value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 public Map<String,Object> merge(UUID from,Merge input){
  lock();require(input!=null&&input.confirmed()&&input.targetId()!=null,"미리보기와 명시적 병합 승인이 필요합니다.");var before=preview(from,input.targetId());
  require(Objects.equals(input.fingerprint(),before.get("fingerprint")),"분류 또는 참조가 변경되었습니다. 다시 미리보기 하세요.");UUID to=input.targetId();
  // Complete live-reference migration in one transaction. Financial amounts/routes/times are untouched.
  db.update("update money_transactions set category_id=?,version=version+1 where user_id=? and category_id=?",to,owner(),from);
  db.update("update money_bookkeeping_overrides set overrides=jsonb_set(overrides,'{categoryId}',to_jsonb(?::text)),version=version+1,updated_at=now() where user_id=? and overrides->>'categoryId'=?",to.toString(),owner(),from.toString());
  db.update("update money_rule_projections set defaults=jsonb_set(defaults,'{categoryId}',to_jsonb(?::text)),version=version+1,updated_at=now() where user_id=? and defaults->>'categoryId'=?",to.toString(),owner(),from.toString());
  db.update("update money_category_rules set category_id=?,version=version+1 where user_id=? and category_id=?",to,owner(),from);
  for(Object value:(List<?>)before.get("transactions")){
   UUID affected=(UUID)((Map<?,?>)value).get("id");
   db.update("update money_review_decisions d set displayed=case when d.displayed->>'categoryId'=? then jsonb_set(d.displayed,'{categoryId}',to_jsonb(?::text)) else d.displayed end,transaction_version=t.version,override_version=coalesce(b.version,0),projection_version=coalesce(p.version,0) from money_transactions t left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id left join money_rule_projections p on p.user_id=t.user_id and p.transaction_id=t.id where d.user_id=? and t.user_id=d.user_id and t.id=d.transaction_id and t.id=?",from.toString(),to.toString(),owner(),affected);
  }
  db.update("update money_classification_state set category_id=?,version=version+1,decision_version=decision_version+1,updated_at=now() where user_id=? and category_id=?",to,owner(),from);
  db.update("update money_ai_rule_drafts set rule_input=jsonb_set(rule_input,'{categoryId}',to_jsonb(?::text)),version=version+1,updated_at=now() where user_id=? and status='OPEN' and rule_input->>'categoryId'=?",to.toString(),owner(),from.toString());
  // Audit snapshots remain immutable; the structural operation invalidates prior learning references.
  db.update("update money_categories set archived=true,version=version+1 where user_id=? and id=?",owner(),from);
  meaning.audit(from,"CATEGORY_MERGE",before,Map.of("survivor",to,"scope","ALL_LIVE_CATEGORY_REFERENCES","count",before.get("count")));
  return Map.of("merged",true,"count",before.get("count"),"survivorId",to);
 }
 public Map<String,Object> defer(UUID id,Defer input){lock();categories().get(id);require(input!=null&&Set.of("MERGE","DEACTIVATE").contains(input.action()),"제안 유형을 확인하세요.");text(input.reason(),1000,false,"보류 사유");var data=new LinkedHashMap<String,Object>();data.put("action",input.action());data.put("targetId",input.targetId());data.put("reason",input.reason());UUID event=UUID.randomUUID();db.update("insert into money_ai_events(id,user_id,subject_id,kind,payload) values(?,?,?,'CATEGORY_DEFER',cast(? as jsonb))",event,owner(),id,json.writeValueAsString(data));meaning.audit(id,"CATEGORY_PROPOSAL_DEFER",Map.of(),data);return Map.of("eventId",event);}
}
