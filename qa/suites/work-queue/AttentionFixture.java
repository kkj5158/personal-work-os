import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Only a marked run-owned Attention schema is created/removed; public data/history is never changed. */
public class AttentionFixture {
 private static final List<String> TABLES=List.of("attention_operations","attention_items","attention_lanes","attention_queues","attention_credentials","attention_device_authorizations");
 public static void main(String[] args){try{if(args.length!=2||!Set.of("create","drop").contains(args[0])||!args[1].matches("qa_attention_[a-f0-9]{20}"))throw new IllegalStateException("FIXTURE_IDENTITY_REJECTED");String action=args[0],schema=args[1];String url=System.getenv("DEV_DB_URL");if(url==null||!url.startsWith("jdbc:postgresql://")||url.equals(System.getenv("PROD_DB_URL")))throw new IllegalStateException("DEV_ONLY_FIXTURE");Properties p=new Properties();p.setProperty("user",System.getenv("DEV_DB_USERNAME"));p.setProperty("password",System.getenv("DEV_DB_PASSWORD"));p.setProperty("connectTimeout","15");p.setProperty("socketTimeout","30");
 try(var c=DriverManager.getConnection(url,p)){c.setAutoCommit(false);try(var s=c.createStatement()){s.execute("set local lock_timeout='5s'");s.execute("set local statement_timeout='30s'");if(action.equals("create")){s.execute("create schema "+schema);s.execute("comment on schema "+schema+" is 'pos-central-qa-attention-owned'");s.execute("set local search_path="+schema+",public");s.execute(Files.readString(Path.of("src/main/resources/db/migration/V72__workflow_attention_queue.sql")));}else{
 try(var q=c.prepareStatement("select obj_description(oid,'pg_namespace') from pg_namespace where nspname=?")){q.setString(1,schema);try(var r=q.executeQuery()){if(!r.next()){System.out.println("QA_ATTENTION_SCHEMA_ABSENT");return;}if(!"pos-central-qa-attention-owned".equals(r.getString(1)))throw new IllegalStateException("SCHEMA_OWNERSHIP_MISMATCH");}}
 var actual=new HashSet<String>();try(var q=c.prepareStatement("select table_name from information_schema.tables where table_schema=?")){q.setString(1,schema);try(var r=q.executeQuery()){while(r.next())actual.add(r.getString(1));}}if(!actual.equals(new HashSet<>(TABLES)))throw new IllegalStateException("UNEXPECTED_OWNED_TABLE_INVENTORY");
 for(String table:TABLES)s.execute("drop table "+schema+"."+table+" restrict");s.execute("drop schema "+schema+" restrict");
 }c.commit();System.out.println("QA_ATTENTION_SCHEMA_"+action.toUpperCase()+"=PASS");}}
 }catch(Exception e){System.err.println("QA_ATTENTION_FIXTURE_BLOCKED="+(e instanceof IllegalStateException?e.getMessage():e.getClass().getSimpleName()));System.exit(1);}}
}
