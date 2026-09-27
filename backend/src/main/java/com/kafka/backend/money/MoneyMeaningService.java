package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.money.MoneyService.*;

/** Owner-scoped meaning metadata. No operation here updates money_transactions. */
@Service
@Transactional
public class MoneyMeaningService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final ObjectMapper json;
 public MoneyMeaningService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){this.db=db;this.users=users;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
 static void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("값이 변경되었습니다. 새로고침 후 다시 확인하세요.");}
 @SuppressWarnings("unchecked") Map<String,Object> object(Object value){return value==null?new LinkedHashMap<>():json.readValue(value.toString(),Map.class);}
 void audit(UUID id,String action,Object previous,Object next){db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,?,cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner(),id,action,json.writeValueAsString(previous),json.writeValueAsString(next));}
 public record TrackingInput(List<UUID> expense,List<UUID> income,Long expectedVersion){}
 @Transactional(readOnly=true) public Map<String,Object> tracking(){
  var result=new LinkedHashMap<String,Object>();result.put("version",db.queryForObject("select coalesce((select version from money_tracking_settings where user_id=?),0)",Long.class,owner()));
  var rows=db.queryForList("select kind,account_id from money_tracking_accounts where user_id=? order by kind,slot",owner());
  for(var kind:List.of("EXPENSE","INCOME"))result.put(kind.toLowerCase(Locale.ROOT),rows.stream().filter(r->kind.equals(r.get("kind"))).map(r->r.get("account_id")).toList());return result;
 }
 public Map<String,Object> saveTracking(TrackingInput input){
  lock();require(input!=null,"Tracking required");var old=tracking();version(((Number)old.get("version")).longValue(),input.expectedVersion());
  for(var ids:Arrays.asList(input.expense(),input.income())){require(ids!=null&&ids.size()<=5&&new HashSet<>(ids).size()==ids.size(),"유형별 추적 계좌는 중복 없이 최대 5개입니다.");for(var id:ids)ownedAccount(id);}
  db.update("insert into money_tracking_settings(user_id,version) values(?,1) on conflict(user_id) do update set version=money_tracking_settings.version+1,updated_at=now()",owner());
  db.update("delete from money_tracking_accounts where user_id=?",owner());
  for(String kind:List.of("EXPENSE","INCOME")){var ids=kind.equals("EXPENSE")?input.expense():input.income();for(int i=0;i<ids.size();i++)db.update("insert into money_tracking_accounts(user_id,kind,slot,account_id) values(?,?,?,?)",owner(),kind,i+1,ids.get(i));}
  var next=tracking();audit(owner(),"TRACKING",old,next);return next;
 }
 void ownedAccount(UUID id){require(id!=null&&Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_accounts where user_id=? and id=? and not archived)",Boolean.class,owner(),id)),"활성 소유 계좌를 선택하세요.");}
 public record RuleInput(String name,List<MoneyRuleEngine.Condition> conditions,UUID categoryId,String titleDefault,String memoDefault,String status,Long expectedVersion){}
 public record RuleOrder(List<UUID> ids,Map<UUID,Long> versions){}
 private static final String RULE_SELECT="select id,name,merchant,category_id as \"categoryId\",title_default as \"titleDefault\",memo_default as \"memoDefault\",conditions::text,priority,status,origin,version,enabled from money_category_rules where user_id=?";
 @Transactional(readOnly=true) public List<Map<String,Object>> rules(){return db.queryForList(RULE_SELECT+" order by priority,id",owner()).stream().map(r->{
  r.put("legacy",r.get("conditions")==null);r.put("conditions",r.get("conditions")==null?List.of(new MoneyRuleEngine.Condition("type","EXACT","EXPENSE"),new MoneyRuleEngine.Condition("merchant","EXACT",Objects.toString(r.get("merchant"),""))):json.readValue(r.get("conditions").toString(),List.class));
  if(!Boolean.TRUE.equals(r.get("enabled"))&&"ACTIVE".equals(r.get("status")))r.put("status","PAUSED");return r;
 }).toList();}
 private Map<String,Object> rule(UUID id){return rules().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow(()->new ResourceNotFoundException("Rule not found"));}
 public Map<String,Object> saveRule(UUID id,RuleInput input){
  lock();require(input!=null,"Rule required");text(input.name(),120,true,"Rule name");require(input.conditions()!=null&&!input.conditions().isEmpty()&&input.conditions().size()<=8,"1–8 AND conditions required");
  require(Set.of("ACTIVE","PAUSED","INACTIVE").contains(Objects.toString(input.status(),"")),"Rule status required");
  for(var c:input.conditions()){
   require(c!=null&&Set.of("type","accountId","merchant","title").contains(c.field()),"Unsupported condition field");text(c.value(),500,true,"Condition");
   require(Set.of("EXACT","CONTAINS","STARTS_WITH").contains(c.operator()),"Unsupported string operator");
   if(Set.of("type","accountId").contains(c.field()))require(c.operator().equals("EXACT"),"Type/account require exact match");
   if(c.field().equals("type"))require(Set.of("EXPENSE","INCOME").contains(c.value()),"Rules classify expense/income meaning only");
   if(c.field().equals("accountId"))ownedAccount(uuid(c.value()));
  }
  text(input.titleDefault(),240,input.titleDefault()!=null,"Title default");text(input.memoDefault(),2000,false,"Memo default");
  require(input.categoryId()!=null||input.titleDefault()!=null||input.memoDefault()!=null,"At least one output required");
  if(input.categoryId()!=null){
   var cats=db.queryForList("select kind from money_categories where user_id=? and id=? and not archived",owner(),input.categoryId());require(!cats.isEmpty(),"Owned active category required");
   require(input.conditions().stream().anyMatch(c->c.field().equals("type")&&c.value().equals(cats.getFirst().get("kind"))),"Category rules require the matching income/expense type condition");
  }
  Map<String,Object> old=Map.of();if(id==null){id=UUID.randomUUID();db.update("insert into money_category_rules(id,user_id,priority) values(?,?,(select coalesce(max(priority),-1)+1 from money_category_rules where user_id=?))",id,owner(),owner());}
  else{old=rule(id);version(((Number)old.get("version")).longValue(),input.expectedVersion());}
  db.update("update money_category_rules set name=?,merchant=null,conditions=cast(? as jsonb),category_id=?,title_default=?,memo_default=?,status=?,enabled=?,version=version+1 where user_id=? and id=?",input.name().strip(),json.writeValueAsString(input.conditions()),input.categoryId(),input.titleDefault(),input.memoDefault(),input.status(),input.status().equals("ACTIVE"),owner(),id);
  var next=rule(id);audit(id,"RULE_SAVE",old,next);return next;
 }
 public List<Map<String,Object>> reorder(RuleOrder input){lock();require(input!=null&&input.ids()!=null&&input.versions()!=null,"Order and versions required");var old=rules();require(input.ids().size()==old.size()&&new HashSet<>(input.ids()).equals(new HashSet<>(old.stream().map(r->(UUID)r.get("id")).toList())),"Order must include every owned rule exactly once");
  for(var row:old)version(((Number)row.get("version")).longValue(),input.versions().get(row.get("id")));
  for(int i=0;i<input.ids().size();i++)db.update("update money_category_rules set priority=?,version=version+1 where user_id=? and id=?",i,owner(),input.ids().get(i));audit(owner(),"RULE_ORDER",old,input.ids());return rules();}
 private List<MoneyRuleEngine.Definition> definitions(){
  return db.query("select r.* from money_category_rules r left join money_categories c on c.id=r.category_id and c.user_id=r.user_id where r.user_id=? and r.conditions is not null and r.enabled and r.status='ACTIVE' and (r.category_id is null or not c.archived) order by r.priority,r.id",(r,n)->{
   var conditions=Arrays.asList(json.readValue(r.getString("conditions"),MoneyRuleEngine.Condition[].class));var outputs=new LinkedHashMap<String,Object>();
   if(r.getObject("category_id")!=null)outputs.put("categoryId",r.getObject("category_id").toString());if(r.getString("title_default")!=null)outputs.put("title",r.getString("title_default"));if(r.getString("memo_default")!=null)outputs.put("memo",r.getString("memo_default"));
   return new MoneyRuleEngine.Definition(r.getObject("id",UUID.class),r.getLong("version"),conditions,outputs);
  },owner());
 }
 private static final String FACTS="select t.id,t.version,t.type,coalesce(t.from_account_id,t.to_account_id)::text as \"accountId\",t.counterparty_text as merchant,t.title,t.memo,t.category_id::text as \"categoryId\",coalesce(b.overrides,'{}'::jsonb)::text as overrides,coalesce(b.version,0) as \"overrideVersion\",coalesce(p.version,0) as \"projectionVersion\",coalesce(p.defaults,'{}'::jsonb)::text as defaults from money_transactions t left join money_bookkeeping_overrides b on b.user_id=t.user_id and b.transaction_id=t.id left join money_rule_projections p on p.user_id=t.user_id and p.transaction_id=t.id where t.user_id=? and t.type in ('EXPENSE','INCOME') and not t.excluded and t.merged_into is null";
 void applyFuture(UUID id){var facts=db.queryForList(FACTS+" and t.id=?",owner(),id);if(facts.isEmpty())return;var result=MoneyRuleEngine.evaluate(facts.getFirst(),definitions());if(!result.defaults().isEmpty())persist(id,result,"RULE_FUTURE");}
 private void persist(UUID id,MoneyRuleEngine.Result result,String action){var old=db.queryForList("select defaults::text,evidence::text from money_rule_projections where user_id=? and transaction_id=?",owner(),id);db.update("insert into money_rule_projections(user_id,transaction_id,defaults,evidence,version) values(?,?,cast(? as jsonb),cast(? as jsonb),1) on conflict(user_id,transaction_id) do update set defaults=excluded.defaults,evidence=excluded.evidence,version=money_rule_projections.version+1,updated_at=now()",owner(),id,json.writeValueAsString(result.defaults()),json.writeValueAsString(result.evidence()));audit(id,action,old,result);}
 public record HistoryRequest(String from,String to,String fingerprint){}
 record Change(UUID id,long transactionVersion,long overrideVersion,long projectionVersion,MoneyRuleEngine.Result result){}
 private List<Change> changes(HistoryRequest input){require(input!=null,"Period required");var from=LocalDate.parse(input.from());var to=LocalDate.parse(input.to());require(!from.isAfter(to)&&java.time.temporal.ChronoUnit.DAYS.between(from,to)<=366,"Choose at most 367 days");
  var facts=db.queryForList(FACTS+" and t.occurred_at>=? and t.occurred_at<? order by t.id limit 10001",owner(),Timestamp.from(from.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()),Timestamp.from(to.plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));require(facts.size()<=10000,"Narrow the preview period (maximum 10,000 facts)");var rules=definitions();var result=new ArrayList<Change>();
  for(var fact:facts){var evaluated=MoneyRuleEngine.evaluate(fact,rules);var current=object(fact.get("defaults"));var overrides=object(fact.get("overrides"));
   boolean changed=evaluated.defaults().entrySet().stream().anyMatch(e->!overrides.containsKey(e.getKey())&&!Objects.equals(e.getValue(),current.getOrDefault(e.getKey(),fact.get(e.getKey()))));
   if(changed)result.add(new Change((UUID)fact.get("id"),((Number)fact.get("version")).longValue(),((Number)fact.get("overrideVersion")).longValue(),((Number)fact.get("projectionVersion")).longValue(),evaluated));
  }return result;
 }
 private String fingerprint(List<Change> changes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(changes).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 @Transactional(readOnly=true) public Map<String,Object> preview(HistoryRequest input){var changes=changes(input);return Map.of("count",changes.size(),"examples",changes.stream().limit(10).toList(),"fingerprint",fingerprint(changes),"scope","BOOKKEEPING_DEFAULTS_ONLY");}
 public Map<String,Object> applyHistory(HistoryRequest input){lock();var changes=changes(input);require(input.fingerprint()!=null&&input.fingerprint().equals(fingerprint(changes)),"미리보기 이후 값이 바뀌었습니다. 다시 미리보기 후 확인하세요.");for(var change:changes)persist(change.id(),change.result(),"RULE_HISTORY_CONFIRMED");return Map.of("applied",changes.size());}
 @Transactional(readOnly=true) public List<Map<String,Object>> history(UUID id){return db.queryForList("select action,previous_value::text as \"previousValue\",next_value::text as \"nextValue\",created_at as \"createdAt\" from money_meaning_audit where user_id=? and subject_id=? order by created_at,id",owner(),id);}
 static UUID uuid(String value){try{return UUID.fromString(value);}catch(RuntimeException e){throw new InvalidRequestException("Valid identifier required");}}
}
