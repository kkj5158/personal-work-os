package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Isolated read-adapter scenario; root QA schedules this against the shared DB. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneySavingsReadPostgresTest {
 @Test void historicalBoundaryIsOwnerScopedAndFilterDoesNotChangeTotals()throws Exception{
  try(var c=MoneyPostgresIntegrationTest.connection()){c.setAutoCommit(false);try{
   var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));String schema="qa_savings_"+UUID.randomUUID().toString().replace("-","");db.execute("create schema "+schema);db.execute("set local search_path="+schema+",public");
   db.execute("create table money_accounts(id uuid,user_id uuid,display_name text)");
   db.execute("create table money_account_fund_group_history(user_id uuid,account_id uuid,fund_group text,effective_at timestamptz)");
   db.execute("create table money_transactions(id uuid,user_id uuid,type text,amount numeric,currency text,occurred_at timestamptz,from_account_id uuid,to_account_id uuid,title text,memo text,counterparty_text text,excluded boolean default false,merged_into uuid)");
   UUID owner=MoneyPostgresIntegrationTest.OWNER,other=UUID.randomUUID(),source=UUID.randomUUID(),destination=UUID.randomUUID(),second=UUID.randomUUID();
   for(var id:List.of(source,destination,second)){db.update("insert into money_accounts values(?,?,?)",id,owner,id.toString());db.update("insert into money_account_fund_group_history values(?,?,?,'-infinity')",owner,id,id.equals(source)?"LIVING":"SAVINGS");}
   // Account switches to general after two deposits. Current group must not rewrite October 1.
   db.update("insert into money_account_fund_group_history values(?,?,'OTHER','2026-10-02T00:00:00Z')",owner,destination);
   String insert="insert into money_transactions(id,user_id,type,amount,currency,occurred_at,from_account_id,to_account_id,title) values(?,?,'TRANSFER',?,'KRW',cast(? as timestamptz),?,?,?)";
   db.update(insert,UUID.randomUUID(),owner,500000,"2026-10-01T00:00:00Z",source,destination,"deposit");db.update(insert,UUID.randomUUID(),owner,300000,"2026-10-01T00:00:00Z",source,second,"second");db.update(insert,UUID.randomUUID(),owner,70000,"2026-10-03T00:00:00Z",source,destination,"general");
   db.update(insert,UUID.randomUUID(),owner,100000,"2026-10-01T02:00:00Z",second,source,"withdrawal");db.update(insert,UUID.randomUUID(),owner,900000,"2026-10-01T02:00:00Z",destination,second,"internal");
   db.update(insert,UUID.randomUUID(),other,999999,"2026-10-01T00:00:00Z",source,destination,"foreign");
   var service=new MoneySavingsReadService(db,()->owner);var all=service.read("2026-10-01","2026-10-31",null,null,50,0);var filtered=service.read("2026-10-01","2026-10-31",destination,null,50,0);
   assertThat(all.get("total")).isEqualTo(2);assertThat(filtered.get("total")).isEqualTo(1);assertThat(filtered.get("totals")).isEqualTo(all.get("totals"));var totals=(MoneySavingsReadService.Totals)all.get("totals");assertThat(totals.gross()).isEqualByComparingTo("800000");assertThat(totals.net()).isEqualByComparingTo("700000");
   assertThatThrownBy(()->service.read("2026-10-01","2026-10-31",UUID.randomUUID(),null,50,0)).hasMessageContaining("소유 계좌");
  }finally{c.rollback();}}
 }
}
