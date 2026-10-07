package com.kafka.backend.exercise;
import com.kafka.backend.common.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.flywaydb.core.Flyway;
import java.util.*;
/** Owned loopback DEV runtime. V74 is validated in a retained, isolated DEV schema before integration. */
@Configuration @EnableAutoConfiguration
@Import({ExerciseService.class,ExerciseController.class,DevSecurityConfig.class,DevCurrentUserProvider.class})
public class ExerciseDevRuntime {
 public static void main(String[] args){
  var ds=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var db=new JdbcTemplate(ds);String schema="orbit_exercise_v0_dev_20261007";
  db.execute("create schema if not exists "+schema);
  System.out.println("Public migration max="+db.queryForObject("select max(version::int) from public.flyway_schema_history where success and version ~ '^[0-9]+$'",Integer.class));
  var flyway=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("filesystem:src/main/resources/db/migration").target("74").baselineVersion("73").cleanDisabled(true).load();
  if(db.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name='flyway_schema_history'",Integer.class,schema)==0)flyway.baseline();flyway.migrate();flyway.validate();
  var app=new SpringApplication(ExerciseDevRuntime.class);app.setAdditionalProfiles("dev");String url=System.getenv("DEV_DB_URL");
  var props=Map.<String,Object>ofEntries(Map.entry("spring.datasource.url",url+(url.contains("?")?"&":"?")+"currentSchema="+schema),Map.entry("spring.datasource.username",System.getenv("DEV_DB_USERNAME")),Map.entry("spring.datasource.password",System.getenv("DEV_DB_PASSWORD")),Map.entry("spring.datasource.hikari.maximum-pool-size","2"),Map.entry("spring.flyway.enabled","false"),Map.entry("spring.jpa.hibernate.ddl-auto","none"),Map.entry("spring.profiles.active","dev"),Map.entry("app.dev-user-id",System.getenv("APP_DEV_USER_ID")),Map.entry("server.address","127.0.0.1"),Map.entry("server.port","8460"),Map.entry("server.ssl.enabled","true"),Map.entry("server.ssl.key-store-type","PKCS12"),Map.entry("server.ssl.key-store","file:D:/DEV_SPACE/body_calendar/.local-dev/dev-local.p12"),Map.entry("server.ssl.key-alias","orbit-dev-local"),Map.entry("server.ssl.key-store-password",System.getenv("ORBIT_DEV_TLS_PASSWORD")));
  app.addInitializers(c->c.getEnvironment().getPropertySources().addFirst(new MapPropertySource("ownedOrbitDev",props)));app.run(args);System.out.println("ORBIT DEV=https://localhost:8460 ; schema="+schema);
 }
}
