package com.kafka.backend.sleep;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.flywaydb.core.Flyway;
import java.util.*;
import static com.kafka.backend.sleep.SleepService.*;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches="jdbc:postgresql://127.0.0.1:55449/.*")
class SleepV3PostgresTest extends SleepPostgresTest {
 @BeforeAll static void goalsMigration(){Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations(SleepV3DevRuntime.migrations()).cleanDisabled(true).load().migrate();}
 @Test void pairedCorrectionOneEventOneReceiptAndExactReplay(){rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var input=action("CORRECT_SESSION",id,1,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:42:00Z","wakeAt","2026-10-02T22:20:00Z")));var receipt=s.action(input);assertThat(s.action(input)).isEqualTo(receipt);assertThat(s.session(id)).containsEntry("revision",2).containsEntry("bedtimeIntentAt","2026-10-02T14:42:00Z").containsEntry("wakeAt","2026-10-02T22:20:00Z");assertThat((List<?>)s.events(id,null,100).get("items")).hasSize(2);});}
 @Test void invalidPairNeverPartiallyChangesBedtime(){rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var before=s.session(id);assertThatThrownBy(()->s.action(action("CORRECT_SESSION",id,1,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T15:00:00Z","wakeAt","2026-10-02T13:00:00Z"))))).isInstanceOf(SleepError.class);assertThat(s.session(id)).isEqualTo(before);});}
 @Test void goalRevisionReplayAndOwnerIsolationPreserveFactsAndReminders(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var before=s.session(id);var settings=s.settings();String context=s.contextRevision();
  var service=new SleepGuidanceService(s);service.enabled=true;var input=map("operationId",UUID.randomUUID().toString(),"expectedRevision",0,"enabled",true,"timezone","Asia/Seoul","preferredWake","07:00","wakeWindowStart","07:00","wakeWindowEnd","07:30","desiredOpportunityMinutes",450);
  var saved=service.saveGoal(input);assertThat(service.saveGoal(input)).isEqualTo(saved);assertThat(s.session(id)).isEqualTo(before);assertThat(s.settings()).isEqualTo(settings);assertThat(s.contextRevision()).isEqualTo(context);
  var other=new SleepGuidanceService(new SleepService(db,UUID::randomUUID,()->time));other.enabled=true;assertThat(other.goal()).containsEntry("revision",0);
  var conflicting=new LinkedHashMap<>(input);conflicting.put("operationId",UUID.randomUUID().toString());assertThatThrownBy(()->service.saveGoal(conflicting)).isInstanceOf(SleepError.class);
  var reset=service.saveGoal(map("operationId",UUID.randomUUID().toString(),"expectedRevision",1,"enabled",false));assertThat(reset).containsEntry("enabled",false).containsEntry("revision",2);assertThat(s.settings()).isEqualTo(settings);assertThat(s.session(id)).isEqualTo(before);
 });}
 @Test void featureOffHasNoDatabaseDependency(){var service=new SleepGuidanceService(sleep);assertThatThrownBy(service::goal).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.status).isEqualTo(404));}
 @Test void additiveGoalMigrationPreservesPopulatedV78Tables(){
  String owned="sleep_v3_upgrade_"+UUID.randomUUID().toString().replace("-","");
  var base=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var root=new org.springframework.jdbc.core.JdbcTemplate(base);root.execute("create schema "+owned);
  try{
   var old=Flyway.configure().dataSource(base).schemas(owned).defaultSchema(owned).locations(SleepV3DevRuntime.migrations()).baselineVersion("69").target("78").cleanDisabled(true).load();old.baseline();old.migrate();
   var isolated=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DEV_DB_URL")+"?currentSchema="+owned,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var jdbc=new org.springframework.jdbc.core.JdbcTemplate(isolated);
   var transaction=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(isolated));var service=new SleepService(jdbc,()->owner,()->time);
   transaction.executeWithoutResult(st->{service.saveSettings(Map.of("expectedRevision",0),"Asia/Seoul");service.action(bed(UUID.randomUUID(),"2026-10-02T14:40:00Z"));});
   var before=new LinkedHashMap<String,List<Map<String,Object>>>();for(String table:List.of("sleep_settings","sleep_cycles","sleep_sessions","sleep_events","sleep_receipts","sleep_context_revisions"))before.put(table,jdbc.queryForList("select * from "+table));
   var upgrade=Flyway.configure().dataSource(base).schemas(owned).defaultSchema(owned).locations(SleepV3DevRuntime.migrations()).cleanDisabled(true).load();upgrade.migrate();upgrade.validate();
   for(var entry:before.entrySet())assertThat(jdbc.queryForList("select * from "+entry.getKey())).isEqualTo(entry.getValue());assertThat(jdbc.queryForObject("select count(*) from sleep_goals",Long.class)).isZero();
  }finally{if(owned.matches("sleep_v3_upgrade_[0-9a-f]{32}"))root.execute("drop schema "+owned+" cascade");}
 }
}
