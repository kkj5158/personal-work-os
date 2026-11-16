package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import java.time.Instant;
import java.math.BigDecimal;
import static com.kafka.backend.money.MoneyService.require;

/** Statement evidence stays binding through existing canonical edit/link/undo paths. */
final class MoneyStatementProtection {
 private MoneyStatementProtection(){}
 static boolean installed(JdbcTemplate db){return Boolean.TRUE.equals(db.queryForObject("select to_regclass('money_statement_effects') is not null",Boolean.class));}
 static void unchanged(JdbcTemplate db,UUID owner,MoneyTypes.MoneyTransaction old,BigDecimal amount,Instant at,UUID from,UUID to){
  if(old==null||!installed(db))return;
  var evidence=db.queryForList("select r.account_id,r.direction,r.amount,r.occurred_at from money_statement_effects e join money_statement_rows r on r.user_id=e.user_id and r.id=e.row_id where e.user_id=? and e.transaction_id=?",owner,old.id());
  for(var row:evidence){require(amount!=null&&old.amount().compareTo(amount)==0&&old.occurredAt().equals(at)&&row.get("account_id").equals("OUT".equals(row.get("direction"))?from:to),"STATEMENT_CASH_IDENTITY_IMMUTABLE_USE_RECONCILIATION");}
 }
 static List<Map<String,Object>> sources(JdbcTemplate db,UUID owner,UUID transaction){if(!installed(db))return List.of();return db.queryForList("select r.id as \"rowId\",r.statement_id as \"statementId\",r.row_number as \"bankRow\",r.source_page as \"sourcePage\",r.account_id as \"accountId\",r.occurred_at as \"occurredAt\",r.direction,r.amount,r.balance_after as \"balanceAfter\",s.fingerprint,\'SOURCE_STATEMENT\' as \"sourceKind\" from money_statement_effects e join money_statement_rows r on r.user_id=e.user_id and r.id=e.row_id join money_bank_statements s on s.user_id=r.user_id and s.id=r.statement_id where e.user_id=? and e.transaction_id=? order by r.occurred_at,r.id",owner,transaction);}
 static void merge(JdbcTemplate db,UUID owner,UUID from,UUID to){if(installed(db))db.update("update money_statement_effects set transaction_id=? where user_id=? and transaction_id=?",to,owner,from);}
 static void split(JdbcTemplate db,UUID owner,UUID original,UUID receiving,UUID account){if(installed(db))db.update("update money_statement_effects set transaction_id=? where user_id=? and transaction_id=? and account_id=?",receiving,owner,original,account);}
}
