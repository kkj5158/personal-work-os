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
@Configuration @EnableAutoConfiguration
@Import({SleepService.class,SleepController.class,SleepRecoveryAdapter.class,SleepContextController.class,DevSecurityConfig.class,DevCurrentUserProvider.class})
public class SleepWebRuntime {
 static String migrations(){try{
  var dir=java.nio.file.Path.of("build/sleep-web-v78-migrations");java.nio.file.Files.createDirectories(dir);
  for(String name:List.of("V70__sleep_v0.sql","V76__sleep_recorder_revision.sql","V78__sleep_web_naps.sql"))java.nio.file.Files.copy(java.nio.file.Path.of("src/main/resources/db/migration",name),dir.resolve(name),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
  return "filesystem:"+dir.toAbsolutePath();
 }catch(Exception e){throw new IllegalStateException(e);}}
 public static void main(String[] args){
  String schema=System.getenv("SLEEP_WEB_QA_SCHEMA");if(schema==null||!schema.matches("sleep_web_qa_[0-9a-f]{32}"))throw new IllegalArgumentException("Owned schema required");
  var ds=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var db=new JdbcTemplate(ds);db.execute("create schema "+schema);
  var f=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations(migrations()).baselineVersion("69").cleanDisabled(true).load();f.baseline();f.migrate();f.validate();
  String url=System.getenv("DEV_DB_URL");var app=new SpringApplication(SleepWebRuntime.class);app.setAdditionalProfiles("dev");
  var props=Map.<String,Object>ofEntries(Map.entry("spring.datasource.url",url+(url.contains("?")?"&":"?")+"currentSchema="+schema),Map.entry("spring.datasource.username",System.getenv("DEV_DB_USERNAME")),Map.entry("spring.datasource.password",System.getenv("DEV_DB_PASSWORD")),Map.entry("spring.datasource.hikari.maximum-pool-size","2"),Map.entry("spring.datasource.hikari.minimum-idle","0"),Map.entry("spring.flyway.enabled","false"),Map.entry("spring.jpa.hibernate.ddl-auto","none"),Map.entry("app.dev-user-id",System.getenv("APP_DEV_USER_ID")),Map.entry("server.address","127.0.0.1"),Map.entry("server.port","8462"),Map.entry("app.dev-allowed-origins","http://localhost:13027,http://127.0.0.1:13027"));
  app.addInitializers(c->c.getEnvironment().getPropertySources().addFirst(new MapPropertySource("ownedSleepWeb",props)));app.run(args);
 }
}
