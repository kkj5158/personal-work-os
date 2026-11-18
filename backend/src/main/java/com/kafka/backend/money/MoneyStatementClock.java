package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;

/** Append-only, account-specific bank clock. The transaction and Android source clocks stay immutable. */
final class MoneyStatementClock {
 private MoneyStatementClock(){}
 static boolean link(JdbcTemplate db,ObjectMapper json,UUID owner,UUID transaction,Map<String,Object> row,UUID request){
  if(!"SECOND".equals(row.get("time_precision")))return false;
  UUID account=(UUID)row.get("account_id");Instant bank=((java.sql.Timestamp)row.get("occurred_at")).toInstant();
  var old=db.queryForObject("select "+MoneyProductService.effectiveAt("?::uuid")+" from money_transactions t where t.user_id=? and t.id=?",java.sql.Timestamp.class,account,owner,transaction);
  if(old!=null&&old.toInstant().equals(bank))return false;
  db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?,'BANK_ACCOUNT_CLOCK',cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner,transaction,json.writeValueAsString(Map.of("accountId",account,"bankOccurredAt",old.toInstant())),json.writeValueAsString(Map.of("accountId",account,"bankOccurredAt",bank,"rowId",row.get("id"),"requestId",request,"clock","BANK_STATEMENT_SECOND")));
  return true;
 }
}
