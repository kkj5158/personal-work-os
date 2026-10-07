package com.kafka.backend.exercise;

import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

/** Explicit, root-serialized, additive DEV reconciliation. Never used by application startup. */
public final class ExerciseDevMigration {
 private static void require(boolean v,String code){if(!v)throw new IllegalStateException(code);}
 private static String env(String k){String v=System.getenv(k);require(v!=null&&!v.isBlank(),"ENV_REQUIRED_"+k);return v;}
 private static String readOnly(String url){return url+(url.contains("?")?"&":"?")+"options=-c%20default_transaction_read_only%3Don&connectTimeout=15&socketTimeout=60";}
 private static Flyway flyway(String url){return Flyway.configure().dataSource(url,env("DEV_DB_USERNAME"),env("DEV_DB_PASSWORD")).schemas("public").defaultSchema("public").locations("filesystem:src/main/resources/db/migration").createSchemas(false).baselineOnMigrate(false).cleanDisabled(true).outOfOrder(false).target("77").ignoreMigrationPatterns("*:pending").load();}
 private static void check(Flyway f,boolean applied)throws Exception{
  f.validate();var info=f.info();require(info.current()!=null&&(applied ? "77" : "76").equals(info.current().getVersion().getVersion()),"EXACT_V76_DEV_HEAD_REQUIRED");
  for(var m:info.all()){String s=m.getState().name();require(!s.contains("FAILED")&&!s.startsWith("MISSING")&&!s.startsWith("FUTURE"),"UNEXPECTED_HISTORY_STATE");}
  var v77=Arrays.stream(info.all()).filter(m->m.getVersion()!=null&&"77".equals(m.getVersion().getVersion())).findFirst().orElseThrow();
  require("V77__exercise_v0.sql".equals(v77.getScript())&&Objects.equals(v77.getChecksum(),-1186329994),"IMMUTABLE_V77_CHECKSUM_REQUIRED");
  require(info.pending().length==(applied?0:1),"ONLY_V77_PENDING_REQUIRED");
  require(applied?v77.getInstalledOn()!=null:v77.getInstalledOn()==null,"V77_APPLIED_STATE_MISMATCH");
  System.out.println("ORBIT_DEV_V77="+v77.getState()+" checksum="+v77.getChecksum());
 }
 public static void main(String[] args){try{
  String mode=env("ORBIT_MIGRATION_MODE");require(Set.of("preflight","migrate","verify").contains(mode),"MODE_REQUIRED");
  String url=env("DEV_DB_URL");require(url.startsWith("jdbc:postgresql://")&&!url.equals(System.getenv("PROD_DB_URL")),"AUTHORIZED_DEV_REQUIRED");
  var uri=java.net.URI.create(url.substring(5));require(uri.getUserInfo()==null,"URL_CREDENTIALS_REJECTED");
  String query=Objects.toString(uri.getRawQuery(),"");for(String part:query.split("&")){var pair=part.split("=",2);String key=java.net.URLDecoder.decode(pair[0],java.nio.charset.StandardCharsets.UTF_8);String value=pair.length==2?java.net.URLDecoder.decode(pair[1],java.nio.charset.StandardCharsets.UTF_8):"";require(!Set.of("user","password").contains(key.toLowerCase(Locale.ROOT)),"URL_CREDENTIALS_REJECTED");if(key.equalsIgnoreCase("currentSchema"))require(value.equals("public"),"PUBLIC_SCHEMA_REQUIRED");}
  if(mode.equals("verify")){check(flyway(readOnly(url)),true);System.out.println("ORBIT_DEV_MIGRATION_VERIFY=PASS");return;}
  check(flyway(readOnly(url)),false);
  try(var c=DriverManager.getConnection(readOnly(url),env("DEV_DB_USERNAME"),env("DEV_DB_PASSWORD"));var s=c.createStatement();var r=s.executeQuery("select count(*) from information_schema.tables where table_schema='public' and table_name in ('exercise_documents','exercise_mutations','exercise_audit')")){r.next();require(r.getInt(1)==0,"EXERCISE_TABLES_ALREADY_EXIST");}
  if(mode.equals("preflight")){System.out.println("ORBIT_DEV_MIGRATION_PREFLIGHT=PASS");return;}
  require("true".equals(System.getenv("QA_SHARED_LOCK_HELD")),"SHARED_QA_LOCK_REQUIRED");
  try(var c=DriverManager.getConnection(url,env("DEV_DB_USERNAME"),env("DEV_DB_PASSWORD"));var s=c.createStatement()){
   s.setQueryTimeout(15);try(var r=s.executeQuery("select pg_try_advisory_lock(hashtextextended('pos-central-qa-schema',0))")){r.next();require(r.getBoolean(1),"SCHEMA_MIGRATION_BUSY");}
   check(flyway(readOnly(url)),false);var result=flyway(url).migrate();require(result.migrationsExecuted==1,"EXACTLY_ONE_V77_REQUIRED");
  }
  check(flyway(readOnly(url)),true);System.out.println("ORBIT_DEV_MIGRATION_MIGRATE=PASS");
 }catch(Exception e){System.err.println("ORBIT_DEV_MIGRATION_BLOCKED="+(e instanceof IllegalStateException?e.getMessage():e.getClass().getSimpleName())+"; use redacted diagnostics");System.exit(1);}}
}
