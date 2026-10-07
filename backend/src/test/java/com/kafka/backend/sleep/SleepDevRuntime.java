package com.kafka.backend.sleep;
import com.kafka.backend.common.*;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import com.kafka.backend.orbit.SleepContextController;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.flywaydb.core.Flyway;
import java.util.*;

/** Owned, loopback DEV harness using real services/security/JDBC in an isolated retained schema. */
@Configuration @EnableAutoConfiguration
@Import({SleepService.class,SleepController.class,SleepRecoveryAdapter.class,SleepContextController.class,DevSecurityConfig.class,DevCurrentUserProvider.class})
public class SleepDevRuntime {
 static String migrations(){try{
  var dir=java.nio.file.Path.of("build/sleep-recorder-v76-migrations");java.nio.file.Files.createDirectories(dir);
  for(String name:List.of("V70__sleep_v0.sql","V76__sleep_recorder_revision.sql"))java.nio.file.Files.copy(java.nio.file.Path.of("src/main/resources/db/migration",name),dir.resolve(name),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
  return "filesystem:"+dir.toAbsolutePath();
 }catch(Exception e){throw new IllegalStateException(e);}}
 public static void main(String[] args){
  var ds=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
  var db=new JdbcTemplate(ds);String schema="sleep_recorder_dev_20261007_v76";
  db.execute("create schema if not exists "+schema);
  System.out.println("Public applied migration max="+db.queryForObject("select max(version::int) from public.flyway_schema_history where success and version ~ '^[0-9]+$'",Integer.class));
  var flyway=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations(migrations()).target("76").baselineVersion("69").cleanDisabled(true).load();
  if(db.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name='flyway_schema_history'",Integer.class,schema)==0)flyway.baseline();
  flyway.migrate();flyway.validate();
  var app=new SpringApplication(SleepDevRuntime.class);
  app.setAdditionalProfiles("dev");
  String url=System.getenv("DEV_DB_URL");var isolatedProperties=Map.<String,Object>ofEntries(
   Map.entry("spring.datasource.url",url+(url.contains("?")?"&":"?")+"currentSchema="+schema),
   Map.entry("spring.datasource.username",System.getenv("DEV_DB_USERNAME")),Map.entry("spring.datasource.password",System.getenv("DEV_DB_PASSWORD")),
   Map.entry("spring.datasource.hikari.maximum-pool-size","2"),Map.entry("spring.datasource.hikari.minimum-idle","0"),
   Map.entry("spring.flyway.enabled","false"),Map.entry("spring.jpa.hibernate.ddl-auto","none"),
   Map.entry("spring.profiles.active","dev"),Map.entry("app.dev-user-id",System.getenv("APP_DEV_USER_ID")),
   Map.entry("server.address","127.0.0.1"),Map.entry("server.port","8451"),Map.entry("spring.jmx.enabled","false"),
   Map.entry("server.ssl.enabled","true"),Map.entry("server.ssl.key-store-type","PKCS12"),
   Map.entry("server.ssl.key-store","file:D:/DEV_SPACE/sleep-app/.local-dev/dev-local.p12"),
   Map.entry("server.ssl.key-alias","money-dev-local"),Map.entry("server.ssl.key-store-password",System.getenv("SLEEP_DEV_TLS_PASSWORD")));
  app.addInitializers(context -> context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("ownedSleepDev",isolatedProperties)));
  app.run(args);System.out.println("SLEEP DEV=https://localhost:8451 ; schema="+schema+" ; fixed DEV owner, no production data");
 }
}
