package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import java.math.BigDecimal;
import java.util.*;

/** The registered facility limit never substitutes for drawn principal.
 * No schema-dependent query runs on historical test/clone schemas without this additive feature.
 */
final class MoneyOverdraftSemantics {
 private MoneyOverdraftSemantics(){}
 static List<Map<String,Object>> read(JdbcTemplate db,UUID owner,MoneyProductService product){
  return read(db,owner,product,Map.of());
 }
 static List<Map<String,Object>> read(JdbcTemplate db,UUID owner,MoneyProductService product,Map<UUID,MoneyProductService.Balance> balances){
  if(!Boolean.TRUE.equals(db.queryForObject("select to_regclass('money_overdraft_facilities') is not null",Boolean.class)))return List.of();
  var rows=db.queryForList("select f.id,f.loan_id,f.account_id,f.facility_limit,f.version,l.remaining_principal as registered_principal from money_overdraft_facilities f join money_loans l on l.user_id=f.user_id and l.id=f.loan_id where f.user_id=? and f.active and not l.deleted order by f.id",owner);
  for(var r:rows){UUID account=(UUID)r.get("account_id");var b=balances.containsKey(account)?balances.get(account):product.balance(account);r.put("bankBalance",b.amount());r.put("asOf",b.asOf());r.put("usedPrincipal",b.asOf()==null?null:b.amount().negate().max(BigDecimal.ZERO));r.put("basis","BANK_BALANCE_UTILIZATION_FACILITY_LIMIT_SEPARATE");r.put("unknown",b.asOf()==null);}
  return rows;
 }
 static BigDecimal debt(BigDecimal registered,List<Map<String,Object>> facilities){
  BigDecimal result=registered;
  for(var f:facilities)if(f.get("usedPrincipal")==null)return null;else if(f.get("usedPrincipal") instanceof BigDecimal used)result=result.subtract((BigDecimal)f.get("registered_principal")).add(used);
  return result;
 }
}
