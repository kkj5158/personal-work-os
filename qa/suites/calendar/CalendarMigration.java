import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

/** Explicit DEV forward migration. Run under the shared QA lock; preflight/verify are read-only. */
public class CalendarMigration {
  private static void require(boolean ok,String message){if(!ok)throw new IllegalStateException(message);}
  public static void main(String[] args) throws Exception {
    String action=args[0],url=System.getenv("DEV_DB_URL"),user=System.getenv("DEV_DB_USERNAME"),password=System.getenv("DEV_DB_PASSWORD");
    require(Set.of("preflight","apply","verify").contains(action),"UNKNOWN_ACTION");
    require(url!=null&&url.startsWith("jdbc:postgresql://")&&!url.equals(System.getenv("PROD_DB_URL")),"DEV_DATABASE_REQUIRED");
    Path migrations=Path.of(System.getenv("QA_MIGRATIONS"));
    require(Files.exists(migrations.resolve("V75__calendar_creation_operations.sql")),"EXPECTED_CALENDAR_MIGRATION_REQUIRED");
    String readonly=url+(url.contains("?")?"&":"?")+"options=-c%20default_transaction_read_only%3Don&connectTimeout=15&socketTimeout=60";
    Flyway check=Flyway.configure().dataSource(readonly,user,password).locations("filesystem:"+migrations).schemas("public").defaultSchema("public").createSchemas(false).cleanDisabled(true).baselineOnMigrate(false).outOfOrder(false).ignoreMigrationPatterns("*:pending").load();
    check.validate();var info=check.info();
    require(Arrays.stream(info.all()).noneMatch(m->m.getState().name().startsWith("FUTURE")),"UNRECONCILED_FUTURE_MIGRATIONS");
    for(var item:info.applied())System.out.println("QA_CALENDAR_HISTORY="+item.getVersion()+"|"+item.getScript()+"|"+item.getChecksum()+"|"+item.getState());
    var pending=info.pending();
    if(action.equals("verify")){require(pending.length==0&&info.current()!=null&&info.current().getVersion().toString().equals("75"),"CALENDAR_MIGRATION_NOT_APPLIED");System.out.println("QA_CALENDAR_FLYWAY_VERIFY=PASS");return;}
    require(info.current()!=null&&info.current().getVersion().toString().equals("73"),"EXPECTED_BASELINE_V73_REQUIRED");
    require(pending.length==1&&pending[0].getVersion().toString().equals("75")&&pending[0].getScript().equals("V75__calendar_creation_operations.sql"),"EXACT_SINGLE_CALENDAR_MIGRATION_REQUIRED");
    System.out.println("QA_CALENDAR_PREFLIGHT=PASS");
    if(action.equals("apply")){
      require("true".equals(System.getenv("QA_SHARED_LOCK_HELD")),"ROOT_SHARED_QA_LOCK_REQUIRED");
      try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()){
        statement.setQueryTimeout(15);
        try(var acquired=statement.executeQuery("select pg_try_advisory_lock(hashtextextended('pos-central-qa-schema',0))")){acquired.next();require(acquired.getBoolean(1),"SHARED_SCHEMA_BUSY");}
        require(check.info().current().getVersion().toString().equals("73")&&check.info().pending().length==1,"MIGRATION_STATE_CHANGED");
        var result=Flyway.configure().dataSource(url,user,password).locations("filesystem:"+migrations).schemas("public").defaultSchema("public").createSchemas(false).cleanDisabled(true).baselineOnMigrate(false).outOfOrder(false).target("75").validateOnMigrate(true).load().migrate();
        require(result.migrationsExecuted==1,"UNEXPECTED_MIGRATION_COUNT");System.out.println("QA_CALENDAR_FORWARD_MIGRATION=V75");
      }
    }
  }
}
