package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.util.*;

/** Revalidates owner permission and the precise identity used by an AI rule approval. */
final class MoneyApprovedRuleGuard {
 private MoneyApprovedRuleGuard(){}
 static boolean current(JdbcTemplate db,ObjectMapper json,UUID owner,UUID ruleId,long version,UUID transactionId){
  var rules=db.queryForList("select origin from money_category_rules where user_id=? and id=? and version=? and enabled and status='ACTIVE'",owner,ruleId,version);
  if(rules.isEmpty())return false;
  if(!"AI_APPROVED".equals(rules.getFirst().get("origin")))return true;
  if(!Boolean.TRUE.equals(db.queryForObject("select coalesce((select automatic_rules from money_ai_settings where user_id=?),false)",Boolean.class,owner)))return false;
  var approvals=db.queryForList("select payload::text from money_ai_events where user_id=? and subject_id=? and kind in('MERCHANT_RULE_APPROVED','WORKSPACE_RULE_APPROVED') and active order by created_at desc,id desc limit 1",owner,ruleId);
  if(approvals.isEmpty())return false;
  var approval=json.readValue(approvals.getFirst().get("payload").toString(),Map.class);
  if(approval.get("identities") instanceof List<?> identities){
   if(!(approval.get("rule") instanceof Map<?,?> source)||!(source.get("version") instanceof Number rv)||rv.longValue()!=version)return false;
   for(Object item:identities){if(!(item instanceof Map<?,?> identity)||!(identity.get("version") instanceof Number expected))return false;UUID id=UUID.fromString(identity.get("id").toString());var current=db.queryForList("select version from money_ai_merchants where user_id=? and id=?",owner,id);if(current.isEmpty()||((Number)current.getFirst().get("version")).longValue()!=expected.longValue())return false;}
   if(!identities.isEmpty()){var links=db.queryForList("select merchant_id from money_ai_transaction_merchants where user_id=? and transaction_id=?",owner,transactionId);if(!links.isEmpty()&&identities.stream().noneMatch(item->Objects.equals(((Map<?,?>)item).get("id").toString(),Objects.toString(links.getFirst().get("merchant_id"),""))))return false;}
   return true;
  }
  if(!(approval.get("merchantVersion") instanceof Number expected))return false;
  if(!(approval.get("rule") instanceof Map<?,?> source)||!(source.get("version") instanceof Number rv)||rv.longValue()!=version)return false;
  UUID merchant=UUID.fromString(Objects.toString(approval.get("merchantId")));
  var identities=db.queryForList("select descriptor,version from money_ai_merchants where user_id=? and id=?",owner,merchant);
  if(identities.isEmpty()||((Number)identities.getFirst().get("version")).longValue()!=expected.longValue())return false;
  var links=db.queryForList("select merchant_id from money_ai_transaction_merchants where user_id=? and transaction_id=?",owner,transactionId);
  return links.isEmpty()||Objects.equals(links.getFirst().get("merchant_id"),merchant);
 }
}
