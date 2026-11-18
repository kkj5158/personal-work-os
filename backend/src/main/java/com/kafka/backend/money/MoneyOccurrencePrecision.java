package com.kafka.backend.money;

import java.sql.*;
import java.time.*;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** DAY stores an ordering boundary, never an asserted bank second. Old test/client schemas stay compatible. */
final class MoneyOccurrencePrecision {
 private MoneyOccurrencePrecision(){}
 static String read(ResultSet row)throws SQLException{
  var meta=row.getMetaData();for(int i=1;i<=meta.getColumnCount();i++)if(meta.getColumnLabel(i).equalsIgnoreCase("occurrence_precision"))return row.getString(i);
  return "SECOND";
 }
 static String destination(ResultSet row)throws SQLException{var meta=row.getMetaData();for(int i=1;i<=meta.getColumnCount();i++)if(meta.getColumnLabel(i).equalsIgnoreCase("transfer_destination_status"))return row.getString(i);return null;}
 static Instant endOfDay(Instant lower){return lower.atZone(ZoneId.of("Asia/Seoul")).toLocalDate().plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant().minusNanos(1000);}
 static boolean uncertain(JdbcTemplate db,UUID owner,UUID account,Instant start,Instant cutoff){
  if(!cutoff.isBefore(endOfDay(cutoff)))return false;
  boolean available=Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='money_transactions' and column_name='occurrence_precision')",Boolean.class));
  if(!available)return false;
  var day=cutoff.atZone(ZoneId.of("Asia/Seoul")).toLocalDate();Instant lower=day.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),upper=endOfDay(lower);
  return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transactions t where t.user_id=? and not t.excluded and t.merged_into is null and (t.from_account_id=? or t.to_account_id=?) and (t.occurrence_precision='DAY' or exists(select 1 from money_statement_effects e join money_statement_rows r on r.user_id=e.user_id and r.id=e.row_id where e.user_id=t.user_id and e.transaction_id=t.id and e.account_id=? and r.time_precision='DAY')) and t.occurred_at>=? and t.occurred_at<=? and t.occurred_at>?)",Boolean.class,owner,account,account,account,Timestamp.from(lower),Timestamp.from(upper),Timestamp.from(start)));
 }
}
