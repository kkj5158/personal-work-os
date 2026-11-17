import java.sql.*;import java.util.*;
/** Read-only evidence; credential verifiers and owner IDs never leave this process. */
public class WorkQueuePrivatePreflight {
 public static void main(String[] args)throws Exception{
  var p=new Properties();p.setProperty("user",System.getenv("QA_WQ_DB_USER"));p.setProperty("password",System.getenv("QA_WQ_DB_PASSWORD"));
  String url=System.getenv("QA_WQ_DB_URL");if(url==null||!url.startsWith("jdbc:postgresql://"))throw new IllegalStateException("POSTGRES_REQUIRED");
  try(var c=DriverManager.getConnection(url+(url.contains("?")?"&":"?")+"connectTimeout=15&socketTimeout=30",p)){
   c.setReadOnly(true);c.setAutoCommit(false);
   try{
    String owner=System.getenv("QA_WQ_OWNER");
    String[] exclusions=System.getenv().getOrDefault("QA_WQ_EXCLUDE_IDS","").isEmpty()?new String[0]:System.getenv("QA_WQ_EXCLUDE_IDS").split(",");
    String baselinePath=System.getenv("QA_WQ_BASELINE_FILE");String[] baseline=null;
    if(baselinePath!=null){var file=java.nio.file.Path.of(baselinePath);if(java.nio.file.Files.exists(file)){baseline=java.nio.file.Files.readAllLines(file).toArray(String[]::new);}else{var ids=new ArrayList<String>();try(var q=c.prepareStatement("select id from attention_items where user_id=cast(? as uuid) and not(id=any(cast(? as uuid[]))) order by id")){q.setString(1,owner);q.setArray(2,c.createArrayOf("uuid",exclusions));try(var r=q.executeQuery()){while(r.next())ids.add(r.getString(1));}}java.nio.file.Files.write(file,ids,java.nio.file.StandardOpenOption.CREATE_NEW);baseline=ids.toArray(String[]::new);}System.out.println("BASELINE_IDS|"+baseline.length);}
    try(var q=c.prepareStatement("select status,count(*) from attention_items where user_id=cast(? as uuid) group by status order by status")){q.setString(1,owner);try(var r=q.executeQuery()){while(r.next())System.out.println("COUNT|"+r.getString(1)+"|"+r.getLong(2));}}
    try(var q=c.prepareStatement("select count(*),md5(coalesce(string_agg(jsonb_build_object('id',id,'sourceKey',source_key,'createdAt',created_at,'action',action,'memo',memo,'source',source,'projectId',project_id,'workTaskId',work_task_id)::text,'' order by id),'')) from attention_items where user_id=cast(? as uuid) and "+(baseline==null?"not(id=any(cast(? as uuid[])))":"id=any(cast(? as uuid[]))"))){q.setString(1,owner);q.setArray(2,c.createArrayOf("uuid",baseline==null?exclusions:baseline));try(var r=q.executeQuery()){r.next();System.out.println("PRESERVATION|"+r.getLong(1)+"|"+r.getString(2));}}
    try(var q=c.prepareStatement("select version,checksum,success from flyway_schema_history where version is not null order by installed_rank desc limit 4");var r=q.executeQuery()){while(r.next())System.out.println("MIGRATION|"+r.getString(1)+"|"+r.getInt(2)+"|"+r.getBoolean(3));}
    String[] labels=System.getenv("QA_WQ_KEY_LABELS").split("\\|"),hashes=System.getenv("QA_WQ_KEY_HASHES").split("\\|");
    for(int i=0;i<labels.length;i++){
     try(var q=c.prepareStatement("select id,kind,namespace,expires_at,revoked_at from attention_credentials where user_id=cast(? as uuid) and token_hash=?")){
      q.setString(1,owner);q.setString(2,hashes[i]);try(var r=q.executeQuery()){if(r.next()){String kind=r.getString(2),ns=r.getString(3);if(!kind.matches("[A-Z_]+")||ns!=null&&!ns.matches("[a-z0-9-]+"))throw new IllegalStateException("INVALID_METADATA");System.out.println("KEY_MATCH|"+labels[i]+"|"+r.getObject(1)+"|"+kind+"|"+ns+"|"+r.getTimestamp(4)+"|"+(r.getTimestamp(5)!=null));if(r.next())throw new IllegalStateException("KEY_NOT_UNIQUE");}else System.out.println("KEY_MATCH|"+labels[i]+"|NOT_FOUND");}
     }
    }
   }finally{c.rollback();}
  }
 }
}
