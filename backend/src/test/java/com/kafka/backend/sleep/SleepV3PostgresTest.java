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
}
