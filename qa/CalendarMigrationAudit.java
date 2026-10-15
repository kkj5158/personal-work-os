import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

/** Read-only Flyway validation of the Calendar V1 candidate. No migrate/repair/clean. */
class CalendarMigrationAudit {
 public static void main(String[] args) {
  try {
   String url=System.getenv("CALENDAR_DB_URL"), user=System.getenv("CALENDAR_DB_USER"), password=System.getenv("CALENDAR_DB_PASSWORD");
   if(url==null||!url.startsWith("jdbc:postgresql://")||user==null||password==null)throw new IllegalStateException("DB_ENV_REQUIRED");
   String expected=System.getenv("CALENDAR_DATABASE");
   if(!Set.of("pos_dev_final","pos_prod_final").contains(expected))throw new IllegalStateException("ACTIVE_DATABASE_REQUIRED");
   String readOnly=url+(url.contains("?")?"&":"?")+"options=-c%20default_transaction_read_only%3Don&connectTimeout=20&socketTimeout=60";
   Properties props=new Properties();props.setProperty("user",user);props.setProperty("password",password);props.setProperty("ApplicationName","pos-calendar-v1-read-only-audit");
   try(var c=DriverManager.getConnection(readOnly,props);var s=c.createStatement();var r=s.executeQuery("select current_database(),current_setting('transaction_read_only')")) {
    r.next();if(!expected.equals(r.getString(1))||!"on".equals(r.getString(2)))throw new IllegalStateException("DATABASE_IDENTITY_OR_READ_ONLY_MISMATCH");
   }
   var fw=Flyway.configure().dataSource(readOnly,user,password).locations("filesystem:"+System.getenv("CALENDAR_MIGRATIONS")).schemas("public").defaultSchema("public").createSchemas(false).cleanDisabled(true).baselineOnMigrate(false).outOfOrder(false).ignoreMigrationPatterns("*:pending").load();
   fw.validate();var info=fw.info();
   for(var m:info.all()) {String state=m.getState().name();if(state.contains("FAILED")||state.startsWith("FUTURE")||state.startsWith("MISSING"))throw new IllegalStateException("UNEXPECTED_MIGRATION_STATE");}
   var pending=info.pending();
   boolean applied="84".equals(info.current().getVersion().getVersion());
   if(applied ? pending.length!=0 : pending.length!=1||!"84".equals(pending[0].getVersion().getVersion())||!pending[0].getScript().equals("V84__money_calendar_work.sql"))throw new IllegalStateException("ONLY_CALENDAR_V84_EXPECTED");
   System.out.println("CALENDAR_FLYWAY_READ_ONLY_VALIDATE=PASS");
   System.out.println("CALENDAR_APPLIED_VERSION="+info.current().getVersion());
   System.out.println("CALENDAR_PENDING="+pending.length);
  }catch(Exception e){System.err.println("CALENDAR_MIGRATION_AUDIT_FAILED="+e.getClass().getSimpleName()+"; credentials and driver details withheld");System.exit(1);}
 }
}
