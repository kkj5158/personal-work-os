package com.kafka.backend.sleep;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Production already has V96/V97: replay that order against a disposable schema. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class SleepReleaseOrderPostgresTest {
 @Test void additiveSleepMigrationsAfterCalendar97PreserveFactsAndExistingHistory() throws Exception {
  var source=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
  var db=new JdbcTemplate(source);var schema="sleep_release_"+UUID.randomUUID().toString().replace("-","");
  Path directory=Files.createTempDirectory("sleep-release-migrations-");
  try {
   try(var files=Files.list(Path.of("src/main/resources/db/migration"))) {
    for(var file:files.filter(p->p.toString().endsWith(".sql")).toList()) if(!file.getFileName().toString().matches("V(90|95)__.*")) Files.copy(file,directory.resolve(file.getFileName()));
   }
   var f=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("filesystem:"+directory).cleanDisabled(true).load();f.migrate();
   var history=db.queryForList("select installed_rank,version,checksum,success from "+schema+".flyway_schema_history order by installed_rank");
   var owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var id=UUID.randomUUID();
   db.update("insert into "+schema+".sleep_cycles(owner_id,cycle_id,expected_wake_date,timezone,settings_revision,document) values(?, 'release-fixture','2026-10-23','Asia/Seoul',1,'{}')",owner);
   db.update("insert into "+schema+".sleep_sessions(id,owner_id,cycle_id,status,expected_wake_date,revision,document) values(?,?,'release-fixture','INCOMPLETE','2026-10-23',3,'{\"releaseFixture\":\"confirmed\"}')",id,owner);
   var before=db.queryForMap("select row_to_json(s)::text as original from "+schema+".sleep_sessions s where id=?",id);
   for(var name:List.of("V90__sleep_optional_goals.sql","V95__sleep_auto_sync_annotations.sql")) Files.copy(Path.of("src/main/resources/db/migration",name),directory.resolve(name));
   var next=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("filesystem:"+directory).outOfOrder(true).cleanDisabled(true).load();
   assertThat(next.migrate().migrationsExecuted).isEqualTo(2);next.validate();
   assertThat(db.queryForMap("select row_to_json(s)::text as original from "+schema+".sleep_sessions s where id=?",id)).isEqualTo(before);
   assertThat(db.queryForList("select installed_rank,version,checksum,success from "+schema+".flyway_schema_history where version is null or version not in ('90','95') order by installed_rank")).isEqualTo(history);
   assertThat(next.migrate().migrationsExecuted).isZero();
  } finally {
   db.execute("drop schema if exists "+schema+" cascade");
   try(var files=Files.walk(directory)){for(var file:files.sorted(Comparator.reverseOrder()).toList())Files.delete(file);}
  }
 }
}
