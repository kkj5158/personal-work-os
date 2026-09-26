import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Run-owned synthetic Web fixture schema. All financial test data stays inside it. */
class WebFixture {
 public static void main(String[] args)throws Exception {
  String action=args[0],schema=args[1];
  if(!schema.matches("qa_money_web_[a-f0-9]{20}")||!Set.of("create","drop").contains(action))throw new IllegalArgumentException("Fixture identity rejected");
  Properties p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("connectTimeout","15");p.setProperty("socketTimeout","30");
  try(Connection c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),p)){
   c.setAutoCommit(false);try(Statement s=c.createStatement()){
    s.execute("set local lock_timeout='5s'");s.execute("set local statement_timeout='30s'");
    if(action.equals("create")){
     s.execute("create schema "+schema);s.execute("comment on schema "+schema+" is 'pos-central-qa-money-web-owned'");s.execute("set local search_path="+schema+",public");
     for(String file:List.of("V50__money_core_ledger.sql","V54__money_processing_schedule.sql","V55__money_v1_product.sql","V56__money_bridge_credentials.sql","V58__money_web_v1_1.sql"))s.execute(Files.readString(Path.of("src/main/resources/db/migration",file)));
    }else{
     try(PreparedStatement q=c.prepareStatement("select obj_description(oid,'pg_namespace') from pg_namespace where nspname=?")){q.setString(1,schema);try(ResultSet r=q.executeQuery()){if(!r.next()){System.out.println("QA_WEB_SCHEMA_ABSENT");return;}if(!"pos-central-qa-money-web-owned".equals(r.getString(1)))throw new IllegalStateException("Schema ownership mismatch");}}
     // Explicit schema and table allowlist; foreign dependencies stop RESTRICT cleanup.
     for(String table:List.of("money_bookkeeping_overrides","money_loans","money_corrections","money_balance_checkpoints","money_category_rules","money_transaction_sources","money_parse_attempts","money_raw_notifications","money_transactions","money_categories","money_accounts","money_bridge_enrollments","money_bridge_devices"))s.execute("drop table if exists "+schema+"."+table+" restrict");
     s.execute("drop schema "+schema+" restrict");
    }c.commit();System.out.println("QA_WEB_SCHEMA_"+action.toUpperCase()+"=PASS");
   }
  }
 }
}
