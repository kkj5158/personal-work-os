import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Run-owned synthetic Web fixture schema. All financial test data stays inside it. */
class WebFixture {
 static String ddl(String schema,String file)throws Exception{return Files.readString(Path.of("src/main/resources/db/migration",file)).replace("REFERENCES auth.users", "REFERENCES "+schema+".qa_fixture_users");}
 public static void main(String[] args)throws Exception {
  String action=args[0],schema=args[1];
  if(!schema.matches("qa_money_web_[a-f0-9]{20}")||!Set.of("create","drop").contains(action))throw new IllegalArgumentException("Fixture identity rejected");
  Properties p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("connectTimeout","15");p.setProperty("socketTimeout","30");
  try(Connection c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),p)){
   c.setAutoCommit(false);try(Statement s=c.createStatement()){
    s.execute("set local lock_timeout='5s'");s.execute("set local statement_timeout='30s'");
    if(action.equals("create")){
     s.execute("create schema "+schema);s.execute("comment on schema "+schema+" is 'pos-central-qa-money-web-owned'");s.execute("set local search_path="+schema+",public");
     s.execute("create table qa_fixture_users(id uuid primary key)");try(PreparedStatement insert=c.prepareStatement("insert into qa_fixture_users(id) values(?)")){insert.setObject(1,UUID.fromString(System.getenv("APP_DEV_USER_ID")));insert.executeUpdate();}
     for(String file:List.of("V50__money_core_ledger.sql","V54__money_processing_schedule.sql","V55__money_v1_product.sql","V56__money_bridge_credentials.sql","V58__money_web_v1_1.sql","V59__money_financial_core.sql"))s.execute(ddl(schema,file));
     var meaning=Path.of("src/main/resources/db/migration/V60__money_bookkeeping_review_rules.sql");if(Files.exists(meaning))s.execute(ddl(schema,"V60__money_bookkeeping_review_rules.sql"));s.execute(ddl(schema,"V62__money_category_hierarchy.sql"));s.execute(ddl(schema,"V65__money_mobile_funds.sql"));s.execute(ddl(schema,"V69__money_ai_personalization.sql"));s.execute(ddl(schema,"V71__money_web_revision.sql"));s.execute(ddl(schema,"V73__money_integrated_revision.sql"));
    }else{
     try(PreparedStatement q=c.prepareStatement("select obj_description(oid,'pg_namespace') from pg_namespace where nspname=?")){q.setString(1,schema);try(ResultSet r=q.executeQuery()){if(!r.next()){System.out.println("QA_WEB_SCHEMA_ABSENT");return;}if(!"pos-central-qa-money-web-owned".equals(r.getString(1)))throw new IllegalStateException("Schema ownership mismatch");}}
     // Explicit schema and table allowlist; foreign dependencies stop RESTRICT cleanup.
     for(String table:List.of("money_ai_history_items","money_ai_history_runs","money_ai_transaction_merchants","money_ai_rule_drafts","money_ai_conversations","money_classification_jobs","money_classification_state","money_classification_events","money_command_outcomes","money_overview_preferences","money_ai_events","money_ai_merchants","money_ai_lookups","money_ai_settings","money_mobile_settings","money_review_decisions","money_meaning_audit","money_rule_projections","money_tracking_accounts","money_tracking_settings","money_bookkeeping_overrides","money_corrections","money_category_rules","money_transaction_sources","money_parse_attempts","money_raw_notifications","money_transactions","money_balance_checkpoints","money_loans","money_categories","money_category_groups","money_accounts","money_bridge_enrollments","money_bridge_devices","qa_fixture_users"))s.execute("drop table if exists "+schema+"."+table+" restrict");
     s.execute("drop function if exists "+schema+".money_category_structural_guard() restrict");s.execute("drop function if exists "+schema+".money_category_group_identity_guard() restrict");s.execute("drop function if exists "+schema+".money_category_hierarchy_guard() restrict");s.execute("drop function if exists "+schema+".money_account_default_fund() restrict");
     s.execute("drop function if exists "+schema+".money_enqueue_classification() restrict");s.execute("drop schema "+schema+" restrict");
    }c.commit();System.out.println("QA_WEB_SCHEMA_"+action.toUpperCase()+"=PASS");
   }
  }
 }
}
