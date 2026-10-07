package com.kafka.backend.exercise;

import java.sql.*;

/** Read-only DEV recovery evidence. Never applies/repairs migrations or changes rows. */
public final class ExerciseDevState {
 public static void main(String[] args)throws Exception{
  String url=System.getenv("DEV_DB_URL");
  if(url==null||!url.startsWith("jdbc:postgresql://")||url.equals(System.getenv("PROD_DB_URL")))throw new IllegalStateException("Authorized DEV required");
  try(var c=DriverManager.getConnection(url,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"))){
   c.setAutoCommit(false);c.setReadOnly(true);
   try(var s=c.createStatement()){
    s.setQueryTimeout(15);
    for(String schema:new String[]{"public","orbit_exercise_v0_dev_20261007"}){
     try(var r=s.executeQuery("select version,script,checksum,success from "+schema+".flyway_schema_history where version in ('73','74','75','76','77') order by installed_rank")){
      while(r.next())System.out.println("MIGRATION "+schema+" "+r.getString(1)+" "+r.getString(2)+" checksum="+r.getString(3)+" success="+r.getBoolean(4));
     }
    }
    try(var r=s.executeQuery("select table_schema,count(*) from information_schema.tables where table_name in ('exercise_documents','exercise_mutations','exercise_audit') group by table_schema order by table_schema")){while(r.next())System.out.println("EXERCISE_TABLES "+r.getString(1)+" "+r.getInt(2));}
    for(String table:new String[]{"exercise_documents","exercise_mutations","exercise_audit"})try(var r=s.executeQuery("select count(*) from orbit_exercise_v0_dev_20261007."+table)){r.next();System.out.println("ISOLATED_COUNT "+table+" "+r.getLong(1));}
   }
   c.rollback();System.out.println("DEV_READ_ONLY_SNAPSHOT=PASS");
  }
 }
}
