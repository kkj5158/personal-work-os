package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import java.util.*;

/** One purchase-context evaluator for legacy automation and explicit recommendation sinks. */
@Service
public class MoneyClassificationEngine {
 private final JdbcTemplate db;private final ObjectMapper json;private final MoneyCommandService commands;
 public MoneyClassificationEngine(JdbcTemplate db,ObjectMapper json,MoneyCommandService commands){this.db=db;this.json=json;this.commands=commands;}
 public record Decision(UUID categoryId,String origin,Map<String,Object> evidence){}
 public List<Map<String,Object>> dictionary(UUID owner){return db.queryForList("select c.id,c.name,c.kind,c.parent_id as \"parentId\",c.version,c.icon_type as \"iconType\",c.icon_value as \"iconValue\" from money_categories c left join money_categories p on p.id=c.parent_id and p.user_id=c.user_id where c.user_id=? and not c.archived and not coalesce(p.archived,false) order by c.id",owner);}
 @SuppressWarnings("unchecked") public Decision evaluate(UUID owner,UUID id,Map<String,Object> book){
  String key=commands.fingerprint(MoneyClassificationContext.local(book));var dictionary=dictionary(owner);
  // Only each transaction's latest, still-current explicit event can contribute trust.
  var candidates=db.queryForList(MoneyWebService.BOOK_BASE+"""
   select s.transaction_id,s.category_id,s.event_id,s.version as reference_version,e.origin,e.created_at,e.evidence::text as event_evidence,b.*
   from money_classification_state s
   join money_classification_events e on e.user_id=s.user_id and e.id=s.event_id and e.active and e.origin in ('DIRECT','CONFIRMED')
   join effective b on b.id=s.transaction_id and b."categoryId"=s.category_id and not b.excluded
   join money_categories c on c.user_id=s.user_id and c.id=s.category_id and not c.archived and c.kind=b.type
   left join money_categories parent on parent.user_id=c.user_id and parent.id=c.parent_id
   where s.user_id=? and s.context_key=? and s.transaction_id<>? and not s.future_reference_excluded
    and not coalesce(parent.archived,false) and e.input_key=s.context_key
    and (e.next_value->>'transactionVersion')::bigint=b."transactionVersion"
    and (e.next_value->>'overrideVersion')::bigint=b.version
    and (e.next_value->>'projectionVersion')::bigint=b."projectionVersion"
   order by e.created_at desc,e.id desc
   """,owner,owner,key,id).stream().filter(row->key.equals(commands.fingerprint(referenceContext(row)))&&categoryCurrent(row,dictionary)).toList();
  var direct=candidates.stream().filter(r->"DIRECT".equals(r.get("origin"))).toList();
  if(MoneyClassificationContext.hasPurchaseMeaning(book)&&!direct.isEmpty()){
   var first=direct.getFirst();boolean ambiguous=direct.stream().anyMatch(r->Objects.equals(first.get("created_at"),r.get("created_at"))&&!Objects.equals(first.get("category_id"),r.get("category_id")));
   if(!ambiguous)return new Decision((UUID)first.get("category_id"),"DIRECT_REFERENCE",Map.of("reason","같은 계좌·거래처·유형·구매 맥락의 최신 유효 직접 수정","referenceEventId",first.get("event_id"),"referenceVersion",first.get("reference_version")));
  }
  var confirmed=candidates.stream().filter(r->"CONFIRMED".equals(r.get("origin"))).toList();
  var local=MoneyClassificationContext.local(book);boolean clear=MoneyClassificationContext.hasPurchaseMeaning(book)&&!Objects.toString(local.get("merchant"),"").isBlank();
  if(clear&&confirmed.stream().map(r->r.get("transaction_id")).distinct().count()>=3&&confirmed.stream().map(r->r.get("category_id")).distinct().count()==1)
   return new Decision((UUID)confirmed.getFirst().get("category_id"),"DIRECT_REFERENCE",Map.of("reason","동일 구매 맥락의 서로 다른 거래 3건 이상 일관된 사용자 확인","confirmationEventIds",confirmed.stream().map(r->r.get("event_id")).toList()));
  var meaning=new MoneyMeaningService(db,()->owner,json);var facts=new LinkedHashMap<>(book);facts.put("merchant",book.get("counterpartyText"));facts.put("accountId",Objects.toString(book.get("accountId"),""));
  boolean enabled=Boolean.TRUE.equals(db.queryForObject("select coalesce((select automatic_rules from money_ai_settings where user_id=?),false)",Boolean.class,owner));
  var rules=meaning.rules().stream().filter(r->"ACTIVE".equals(r.get("status"))&&r.get("categoryId")!=null&&dictionary.stream().anyMatch(c->c.get("id").equals(r.get("categoryId"))&&c.get("kind").equals(book.get("type"))))
   .filter(r->!"AI_APPROVED".equals(r.get("origin"))||enabled&&MoneyApprovedRuleGuard.current(db,json,owner,(UUID)r.get("id"),((Number)r.get("version")).longValue(),id))
   .filter(r->Arrays.stream(json.readValue(json.writeValueAsString(r.get("conditions")),MoneyRuleEngine.Condition[].class)).allMatch(c->MoneyRuleEngine.matches(facts,c))).toList();
  if(!rules.isEmpty()){var rule=rules.getFirst();return new Decision((UUID)rule.get("categoryId"),"APPROVED_RULE",Map.of("reason","현재 구매 입력과 일치하는 승인 규칙","ruleId",rule.get("id"),"ruleVersion",rule.get("version")));}
  return new Decision(null,"AI",Map.of());
 }
 @SuppressWarnings("unchecked") private Map<String,Object> referenceContext(Map<String,Object> row){var contextual=new LinkedHashMap<>(row);var evidence=json.readValue(row.get("event_evidence").toString(),Map.class);if(evidence.get("requestExplanation") instanceof String explanation)contextual.put("requestExplanation",explanation);return MoneyClassificationContext.local(contextual);}
 @SuppressWarnings("unchecked") private boolean categoryCurrent(Map<String,Object> row,List<Map<String,Object>> dictionary){
  var selected=dictionary.stream().filter(c->Objects.equals(c.get("id"),row.get("category_id"))).findFirst().orElse(null);if(selected==null)return false;
  var evidence=json.readValue(row.get("event_evidence").toString(),Map.class);var recorded=evidence.get("dictionary");
  var required=new ArrayList<Map<String,Object>>();required.add(selected);if(selected.get("parentId")!=null)dictionary.stream().filter(c->Objects.equals(c.get("id"),selected.get("parentId"))).findFirst().ifPresent(required::add);
  if(!(recorded instanceof List<?> versions))return required.stream().allMatch(c->((Number)c.get("version")).longValue()==0);
  return required.stream().allMatch(c->versions.stream().anyMatch(v->v instanceof Map<?,?> before&&c.get("id").toString().equals(Objects.toString(before.get("id")))&&((Number)c.get("version")).longValue()==((Number)before.get("version")).longValue()));
 }
 public boolean protectedV2(UUID owner,UUID id){return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_classification_drafts where user_id=? and transaction_id=? and status not in ('SAVED','EXCLUDED')) or exists(select 1 from money_recommendation_items i join money_recommendation_runs r on r.id=i.run_id and r.user_id=i.user_id where i.user_id=? and i.transaction_id=? and i.status in ('QUEUED','RUNNING','EXTERNAL_OUTCOME_UNKNOWN','BUDGET_WAIT') and r.status<>'PREVIEW_REQUIRED')",Boolean.class,owner,id,owner,id));}
}
