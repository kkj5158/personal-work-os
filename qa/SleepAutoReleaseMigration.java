import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

/** Exact additive V90/V95 release only. Credentials are process environment, never output. */
class SleepAutoReleaseMigration {
 public static void main(String[] args) throws Exception {
  String mode=args[0];if(!Set.of("preflight","migrate","verify").contains(mode))throw new IllegalArgumentException("mode");
  String url=System.getenv("SLEEP_RELEASE_JDBC"),user=System.getenv("SLEEP_RELEASE_USER"),password=System.getenv("SLEEP_RELEASE_PASSWORD");
  var f=Flyway.configure().dataSource(url,user,password).locations("filesystem:"+args[1]).outOfOrder(true).cleanDisabled(true).ignoreMigrationPatterns("*:pending").load();
  f.validate();
  var pending=Arrays.stream(f.info().pending()).map(i->i.getVersion().toString()).collect(java.util.stream.Collectors.toSet());
  System.out.println("EXISTING_HISTORY_VALIDATED pending="+new TreeSet<>(pending));
  if(mode.equals("migrate")) {
   if(!pending.equals(Set.of("90","95")))throw new IllegalStateException("Unexpected pending migration set");
   var result=f.migrate();if(result.migrationsExecuted!=2)throw new IllegalStateException("Unexpected migration count");
   System.out.println("ADDITIVE_SLEEP_MIGRATIONS_APPLIED=2");
  } else if(mode.equals("preflight")&&!pending.equals(Set.of("90","95")))throw new IllegalStateException("Unexpected pending migration set");
  if(!mode.equals("preflight")){
   f.validate();if(f.info().pending().length!=0)throw new IllegalStateException("Pending migrations remain");
   System.out.println("FINAL_HISTORY_VALIDATED_PENDING=0");
  }
 }
}
