import java.sql.*;
import java.util.*;
/** Read-only DEV migration registry audit. No private content or connection values in output. */
class SleepCalendarDevAudit {
 public static void main(String[] args) throws Exception {
  var p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("connectTimeout","15");p.setProperty("socketTimeout","30");
  try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),p)){
   c.setReadOnly(true);c.setAutoCommit(false);
   try(var s=c.createStatement();var r=s.executeQuery("select version,script,checksum,success from public.flyway_schema_history where version is not null order by installed_rank")){
    while(r.next())System.out.println("MIGRATION "+r.getString(1)+" "+r.getString(2)+" checksum="+r.getString(3)+" success="+r.getBoolean(4));
   }
   c.rollback();System.out.println("READ_ONLY_DEV_AUDIT_COMPLETE");
  }
 }
}
