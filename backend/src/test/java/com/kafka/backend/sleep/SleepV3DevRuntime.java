package com.kafka.backend.sleep;
import com.kafka.backend.common.*;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.flywaydb.core.Flyway;
import java.util.*;
import java.nio.file.*;

/** Task-owned local synthetic cluster only. Never connects to shared DEV/PROD. */
@Configuration @EnableAutoConfiguration
@Import({SleepService.class,SleepController.class,SleepRecoveryAdapter.class,SleepGuidanceService.class,SleepGuidanceController.class,DevSecurityConfig.class,DevCurrentUserProvider.class})
public class SleepV3DevRuntime {
 static String requiredEnv(String name){String value=System.getenv(name);if(value==null||value.isBlank())throw new IllegalStateException(name+" is required for the owned QA runtime");return value;}
 static String migrations(){try{var dir=Path.of("build/sleep-v3-migrations-v90");Files.createDirectories(dir);for(String name:List.of("V70__sleep_v0.sql","V76__sleep_recorder_revision.sql","V78__sleep_web_naps.sql","V90__sleep_optional_goals.sql"))Files.copy(Path.of("src/main/resources/db/migration",name),dir.resolve(name),StandardCopyOption.REPLACE_EXISTING);return "filesystem:"+dir.toAbsolutePath();}catch(Exception e){throw new IllegalStateException(e);}}
 public static void main(String[] args)throws Exception {
  String url=System.getenv("DEV_DB_URL");if(!"jdbc:postgresql://127.0.0.1:55449/postgres".equals(url))throw new IllegalStateException("Owned loopback cluster required");
  String schema="sleep_v3_desktop_runtime_20261017";var ds=new DriverManagerDataSource(url,System.getenv("DEV_DB_USERNAME"),"");var db=new JdbcTemplate(ds);db.execute("create schema if not exists "+schema);
  var f=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations(migrations()).baselineVersion("69").cleanDisabled(true).load();f.baseline();f.migrate();f.validate();
  var app=new SpringApplication(SleepV3DevRuntime.class);app.setAdditionalProfiles("dev");
  var props=Map.<String,Object>ofEntries(Map.entry("spring.datasource.url",url+"?currentSchema="+schema),Map.entry("spring.datasource.username",System.getenv("DEV_DB_USERNAME")),Map.entry("spring.datasource.password",""),Map.entry("spring.datasource.hikari.maximum-pool-size","2"),Map.entry("spring.datasource.hikari.minimum-idle","0"),Map.entry("spring.flyway.enabled","false"),Map.entry("spring.jpa.hibernate.ddl-auto","none"),Map.entry("app.dev-user-id",System.getenv("APP_DEV_USER_ID")),Map.entry("server.address","127.0.0.1"),Map.entry("server.port","8451"),Map.entry("app.sleep.guidance.enabled","true"),Map.entry("server.ssl.enabled","true"),Map.entry("server.ssl.key-store-type","PKCS12"),Map.entry("server.ssl.key-store",Path.of(requiredEnv("SLEEP_QA_TLS_STORE")).toUri().toString()),Map.entry("server.ssl.key-alias",requiredEnv("SLEEP_QA_TLS_ALIAS")),Map.entry("server.ssl.key-store-password",requiredEnv("SLEEP_QA_TLS_PASSWORD")));
  app.addInitializers(c->c.getEnvironment().getPropertySources().addFirst(new MapPropertySource("ownedSleepV3",props)));app.run(args);
 }
}
