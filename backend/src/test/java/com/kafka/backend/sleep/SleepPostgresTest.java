package com.kafka.backend.sleep;
import com.kafka.backend.ops.SleepRecoveryAdapter;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.flywaydb.core.Flyway;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

/** Fresh schema, authentic DEV credentials, actual Flyway migration. No public data writes. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class SleepPostgresTest {
 static String schema;static JdbcTemplate db;static UUID owner;static DriverManagerDataSource ds;static TransactionTemplate tx;
 static Instant time=Instant.parse("2026-10-03T12:00:00Z");
 SleepService sleep;
 @BeforeAll static void schema() {
  schema="sleep_qa_"+UUID.randomUUID().toString().replace("-","");
  ds=new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
  db=new JdbcTemplate(ds);db.execute("create schema "+schema);
  owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));
  var flyway=Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("filesystem:src/main/resources/db/migration")
   .target("70").ignoreMigrationPatterns("*:ignored").baselineVersion("69").cleanDisabled(true).load();
  flyway.baseline();flyway.migrate();flyway.validate();
  String url=System.getenv("DEV_DB_URL");ds=new DriverManagerDataSource(url+(url.contains("?")?"&":"?")+"currentSchema="+schema,System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));
  db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
 }
 @AfterAll static void cleanup(){if(db!=null&&schema!=null&&schema.matches("sleep_qa_[0-9a-f]{32}"))db.execute("drop schema "+schema+" cascade");}
 @BeforeEach void prepare(){sleep=new SleepService(db,()->owner,()->time);}
 Map<String,Object> action(String type,UUID id,Object revision,String at,Map<String,Object> payload){
  return SleepService.map("operationId",UUID.randomUUID().toString(),"actionType",type,"sessionId",id.toString(),"expectedRevision",revision,
   "capturedAt",at,"timezone","Asia/Seoul","offsetMinutes",540,"deviceId","test","entryPoint","HOME","payload",payload);
 }
 Map<String,Object> bed(UUID id,String at){return action("CAPTURE_BEDTIME",id,0,at,Map.of("bedtimeIntentAt",at));}
 void rollback(java.util.function.Consumer<SleepService> test){tx.executeWithoutResult(st->{test.accept(sleep);st.setRollbackOnly();});}
 @Test void repeatTapAndReplayAreDistinct(){
  rollback(s->{UUID id=UUID.randomUUID();var a=bed(id,"2026-10-02T14:40:00Z");var first=s.action(a);
   for(int i=0;i<10;i++)assertThat(s.action(a)).isEqualTo(first);
   var repeat=action("CAPTURE_BEDTIME",id,1,"2026-10-02T15:05:00Z",Map.of());s.action(repeat);
   assertThat(s.session(id)).containsEntry("id",id.toString()).containsEntry("revision",2);
   assertThat((List<?>)s.events(id,null,100).get("items")).hasSize(2);
   var reuse=new LinkedHashMap<>(a);reuse.put("payload",Map.of("bedtimeIntentAt","2026-10-02T15:06:00Z"));
   assertThatThrownBy(()->s.action(reuse)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("IDEMPOTENCY_KEY_REUSED"));
  });
 }
 @Test void wakeDateIntervalAndCorrectionAudit(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T22:00:00Z",Map.of()));
   assertThat(s.session(id)).containsEntry("logicalWakeDate","2026-10-03").containsEntry("intervalMinutes",440.0);
   s.action(action("CORRECT_SESSION",id,2,"2026-10-02T22:30:00Z",Map.of("fields",Map.of("wakeAt","2026-10-02T21:50:00Z"))));
   assertThat(s.session(id)).containsEntry("corrected",true).containsEntry("wakeRecordedAt","2026-10-02T22:00:00Z").containsEntry("intervalMinutes",430.0);
  });
 }
 @Test void unknownRemainsNullAndRecollectionCloses(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(action("CAPTURE_WAKE",id,0,"2026-10-02T22:00:00Z",Map.of("createWakeOnly",true)));
   assertThat(s.session(id)).containsEntry("status","INCOMPLETE").containsEntry("intervalMinutes",null);
   s.action(action("MARK_TIME_UNKNOWN",id,1,"2026-10-02T22:01:00Z",Map.of("endpoint","bedtime")));
   assertThat(s.session(id)).containsEntry("bedtimeIntentAt",null);
   s.action(action("CORRECT_SESSION",id,2,"2026-10-02T22:02:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:40:00Z"))));
   assertThat(s.session(id)).containsEntry("status","CLOSED").containsEntry("intervalMinutes",440.0);
  });
 }
 @Test void undoAddsInverseAndLaterRevisionConflicts(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var second=s.action(action("CAPTURE_BEDTIME",id,1,"2026-10-02T15:05:00Z",Map.of()));
   s.action(action("UNDO_EVENT",id,2,"2026-10-02T15:05:02Z",Map.of("targetEventId",second.get("eventId"))));
   assertThat(s.session(id)).containsEntry("bedtimeIntentAt","2026-10-02T14:40:00Z").containsEntry("revision",3);
   assertThatThrownBy(()->s.action(action("UNDO_EVENT",id,3,"2026-10-02T15:05:03Z",Map.of("targetEventId",second.get("eventId"))))).isInstanceOf(SleepError.class);
  });
 }
 @Test void staleReadNeverClosesAndExplicitAtomicTransition(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-01T14:40:00Z"));assertThat(s.today("Asia/Seoul")).containsEntry("staleOpen",true);
   assertThat(s.session(id)).containsEntry("wakeAt",null).containsEntry("status","OPEN");
   UUID next=UUID.randomUUID();s.action(action("START_NEW_AFTER_UNRESOLVED",next,0,"2026-10-03T11:00:00Z",Map.of("priorSessionId",id.toString(),"priorExpectedRevision",1,"bedtimeIntentAt","2026-10-03T11:00:00Z")));
   assertThat(s.session(id)).containsEntry("status","INCOMPLETE").containsEntry("wakeAt",null);
   assertThat(s.active()).containsEntry("id",next.toString());
  });
 }
 @Test void invalidTimeAndOverlapPreserveOriginal(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));
   assertThatThrownBy(()->s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T14:00:00Z",Map.of()))).isInstanceOf(SleepError.class);
   assertThat(s.session(id)).containsEntry("revision",1).containsEntry("wakeAt",null);
   s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T22:00:00Z",Map.of()));
   assertThatThrownBy(()->s.action(action("CAPTURE_WAKE",UUID.randomUUID(),0,"2026-10-02T22:30:00Z",Map.of("createWakeOnly",true)))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("LOGICAL_DAY_COLLISION"));
  });
 }
 @Test void excludeRestorePreservesHistoryAndInvalidatesContext(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T22:00:00Z",Map.of()));
   var old=s.contextRevision();s.action(action("EXCLUDE_SESSION",id,2,"2026-10-02T22:10:00Z",Map.of("reason","alternate")));
   assertThat(s.metrics(7,"Asia/Seoul",time)).containsEntry("completeCount",0);assertThat(s.contextRevision()).isNotEqualTo(old);
   s.action(action("RESTORE_SESSION",id,3,"2026-10-02T22:11:00Z",Map.of()));assertThat(s.metrics(7,"Asia/Seoul",time)).containsEntry("completeCount",1);
   assertThat((List<?>)s.events(id,null,100).get("items")).hasSize(4);
  });
 }
 @Test void ownerIsolationAndNoRequestOwnerTrust(){
  rollback(s->{UUID id=UUID.randomUUID();var a=bed(id,"2026-10-02T14:40:00Z");a.put("ownerId",UUID.randomUUID().toString());s.action(a);
   var other=new SleepService(db,UUID::randomUUID,()->time);
   assertThatThrownBy(()->other.session(id)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.status).isEqualTo(404));
   assertThat(other.active()).isNull();assertThat(other.history(null,null,null,30,true).get("items")).isEqualTo(List.of());
  });
 }
 @Test void getTodayAndMetricsPerformNoWrites(){
  rollback(s->{long before=db.queryForObject("select count(*) from sleep_cycles",Long.class);
   s.today("Asia/Seoul");s.metrics(7,"Asia/Seoul",time);s.context("Asia/Seoul",time);
   assertThat(db.queryForObject("select count(*) from sleep_cycles",Long.class)).isEqualTo(before);
  });
 }
 @Test void disabledAlertsKeepCyclesAndPendingAcrossSettingsChange(){
  rollback(s->{s.saveSettings(Map.of("expectedRevision",0),"Asia/Seoul");var c=SleepService.obj(s.today("Asia/Seoul").get("currentCycle"));
   s.saveSettings(Map.of("expectedRevision",1,"wake",Map.of("enabled",false,"weekdays",List.of(),"localTime","08:00")),"Asia/Seoul");
   assertThat(SleepService.obj(s.today("Asia/Seoul").get("currentCycle")).get("cycleId")).isEqualTo(c.get("cycleId"));
   assertThat((List<?>)s.today("Asia/Seoul").get("pendingActions")).isNotEmpty();
  });
 }
 @Test void sequentialDependenciesAndRevisionConflict(){
  rollback(s->{UUID id=UUID.randomUUID();var first=bed(id,"2026-10-02T14:40:00Z");var second=action("CAPTURE_BEDTIME",id,1,"2026-10-02T15:05:00Z",Map.of());second.put("dependsOnOperationId",first.get("operationId"));
   assertThatThrownBy(()->s.action(second)).isInstanceOf(SleepError.class);s.action(first);s.action(second);
   var wake=action("CAPTURE_WAKE",id,2,"2026-10-02T22:00:00Z",Map.of());wake.put("dependsOnOperationId",second.get("operationId"));s.action(wake);
   assertThat(s.session(id)).containsEntry("intervalMinutes",415.0);
   assertThatThrownBy(()->s.action(action("CORRECT_SESSION",id,1,"2026-10-02T22:01:00Z",Map.of("fields",Map.of("wakeAt","2026-10-02T21:50:00Z"))))).isInstanceOf(SleepError.class);
  });
 }
 @Test void recoveryIsReadOnlyUnassessedAndContextIsCompact(){
  rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T17:00:00Z"));s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T22:00:00Z",Map.of()));
   var adapter=new SleepRecoveryAdapter(s);var r=adapter.context("Asia/Seoul",time);assertThat(r).containsEntry("currentMode",null).containsEntry("currentLevel",null).containsEntry("assessmentStatus","NOT_ASSESSED");
   assertThat((List<?>)r.get("signals")).hasSize(1);var c=s.context("Asia/Seoul",time);
   assertThat(s.encode(c).getBytes(java.nio.charset.StandardCharsets.UTF_8).length).isLessThan(10240);assertThat(c).doesNotContainKeys("events","history");
  });
 }
 @Test void transactionFailureRollsBackFactsAndReceipt(){
  UUID id=UUID.randomUUID();var a=bed(id,"2026-10-02T14:40:00Z");
  assertThatThrownBy(()->tx.executeWithoutResult(st->{sleep.action(a);throw new IllegalStateException("simulated commit failure");})).isInstanceOf(IllegalStateException.class);
  assertThat(db.queryForObject("select count(*) from sleep_sessions where id=?",Long.class,id)).isZero();
  assertThat(db.queryForObject("select count(*) from sleep_receipts where operation_id=?",Long.class,UUID.fromString(a.get("operationId").toString()))).isZero();
 }
 @Test void pendingStopUnknownAndRecallPreserveRequirementAndResolutionEvent(){
  rollback(s->{s.saveSettings(Map.of("expectedRevision",0),"Asia/Seoul");
   var pending=SleepService.obj(((List<?>)s.today("Asia/Seoul").get("pendingActions")).getFirst());
   var a=action("STOP_ALERTS_TODAY",UUID.randomUUID(),0,"2026-10-03T11:00:00Z",Map.of());a.put("sessionId",null);a.put("cycleId",pending.get("cycleId"));a.put("occurrenceId",pending.get("occurrenceId"));
   var before=s.contextRevision();s.action(a);assertThat(s.contextRevision()).isNotEqualTo(before);
   assertThat(s.active()).isNull();assertThat(s.history(null,null,null,100,true).get("items")).isEqualTo(List.of());
   var stored=s.documents("select document from sleep_pending where owner_id=? and occurrence_id=?",owner,pending.get("occurrenceId")).getFirst();
   assertThat(stored).containsEntry("status","DUE").containsEntry("alertsStopped",true);
   UUID id=UUID.randomUUID();s.action(action("CAPTURE_WAKE",id,0,"2026-10-03T00:00:00Z",Map.of("createWakeOnly",true)));
   s.action(action("MARK_TIME_UNKNOWN",id,1,"2026-10-03T00:01:00Z",Map.of("endpoint","bedtime")));
   var receipt=s.action(action("CORRECT_SESSION",id,2,"2026-10-03T00:02:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T16:00:00Z"))));
   var resolved=s.documents("select document from sleep_pending where owner_id=? and document->>'relatedSessionId'=? and document->>'status'='RESOLVED'",owner,id.toString());
   assertThat(resolved).isNotEmpty();assertThat(resolved).allSatisfy(p->assertThat(p.get("resolvedByEventId")).isEqualTo(receipt.get("eventId")));
  });
 }
 @Test void settingsLostResponseReplayPrecedesRevisionValidation(){
  rollback(s->{var input=SleepService.map("operationId",UUID.randomUUID().toString(),"expectedRevision",0L,"wake",Map.of("enabled",true));
   var receipt=s.saveSettings(input,"Asia/Seoul");assertThat(s.saveSettings(input,"Asia/Seoul")).isEqualTo(receipt);assertThat(s.settings()).containsEntry("revision",1);
   input.put("wake",Map.of("enabled",false));assertThatThrownBy(()->s.saveSettings(input,"Asia/Seoul")).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("IDEMPOTENCY_KEY_REUSED"));
  });
 }
 @Test void correctionMovesLogicalDateAndInvalidatesBothDates(){
  rollback(s->{UUID id=UUID.randomUUID();var a=action("CORRECT_SESSION",id,0,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-09-29T14:00:00Z","wakeAt","2026-09-29T22:00:00Z")));
   s.action(a);assertThat(s.session(id)).containsEntry("expectedWakeDate","2026-09-30");
   s.action(action("CORRECT_SESSION",id,1,"2026-10-03T11:01:00Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-09-30T14:00:00Z","wakeAt","2026-09-30T22:00:00Z"))));
   var changed=db.queryForObject("select changed_dates::text from sleep_context_revisions where owner_id=?",String.class,owner);
   assertThat(changed).contains("2026-09-30","2026-10-01");assertThat(s.session(id)).containsEntry("logicalWakeDate","2026-10-01");
  });
 }
 @Test void restorationRechecksCollision(){
  rollback(s->{UUID first=UUID.randomUUID(),second=UUID.randomUUID();s.action(action("CAPTURE_WAKE",first,0,"2026-10-02T22:00:00Z",Map.of("createWakeOnly",true)));
   s.action(action("EXCLUDE_SESSION",first,1,"2026-10-02T22:01:00Z",Map.of()));s.action(action("CAPTURE_WAKE",second,0,"2026-10-02T22:02:00Z",Map.of("createWakeOnly",true)));
   assertThatThrownBy(()->s.action(action("RESTORE_SESSION",first,2,"2026-10-02T22:03:00Z",Map.of()))).isInstanceOf(SleepError.class);
   assertThat(s.session(first).get("excludedAt")).isNotNull();
  });
 }
 @Test void concurrentNewCapturesSerializeToOneActive() throws Exception {
  var executor=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);var ids=List.of(UUID.randomUUID(),UUID.randomUUID());
  try {
   var futures=ids.stream().map(id->executor.submit(()->{start.await();try {tx.executeWithoutResult(st->sleep.action(bed(id,"2026-10-02T14:00:00Z")));return "OK";}catch(SleepError e){return e.body.get("code").toString();}})).toList();start.countDown();
   var outcomes=new ArrayList<String>();for(var f:futures)outcomes.add(f.get(30,TimeUnit.SECONDS));assertThat(outcomes).containsExactlyInAnyOrder("OK","ACTIVE_SESSION_EXISTS");
   assertThat(db.queryForObject("select count(*) from sleep_sessions where owner_id=? and status='OPEN'",Long.class,owner)).isEqualTo(1L);
  }finally {executor.shutdownNow();tx.executeWithoutResult(st->{for(String table:List.of("sleep_receipts","sleep_events","sleep_pending","sleep_sessions","sleep_cycles","sleep_context_revisions","sleep_settings"))db.update("delete from "+table+" where owner_id=?",owner);});}
 }
 @Test void missingDayDoesNotEstablishConsecutiveShortIntervals(){
  rollback(s->{
   for(String date:List.of("2026-10-01","2026-10-03")){
    var wake=LocalDate.parse(date).atTime(7,0).atZone(ZoneId.of("Asia/Seoul")).toInstant();
    s.action(action("CORRECT_SESSION",UUID.randomUUID(),0,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt",wake.minusSeconds(5*3600).toString(),"wakeAt",wake.toString()))));
   }
   var adapter=new SleepRecoveryAdapter(s);var signals=(List<?>)adapter.context("Asia/Seoul",time).get("signals");
   assertThat(signals).noneSatisfy(v->assertThat(SleepService.obj(v).get("signalCode")).isEqualTo("CONSECUTIVE_SHORT_INTERVALS"));
   var wake=Instant.parse("2026-10-01T22:00:00Z");s.action(action("CORRECT_SESSION",UUID.randomUUID(),0,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt",wake.minusSeconds(5*3600).toString(),"wakeAt",wake.toString()))));
   assertThat((List<?>)adapter.context("Asia/Seoul",time).get("signals")).anySatisfy(v->assertThat(SleepService.obj(v).get("signalCode")).isEqualTo("CONSECUTIVE_SHORT_INTERVALS"));
  });
 }
 @Test void historicalRecordHasAnIntervalBarBeforeTrackingStart(){
  rollback(s->{var wake=Instant.parse("2026-10-01T22:00:00Z");s.action(action("CORRECT_SESSION",UUID.randomUUID(),0,"2026-10-03T11:00:00Z",Map.of("fields",Map.of("bedtimeIntentAt",wake.minusSeconds(8*3600).toString(),"wakeAt",wake.toString()))));
   var days=(List<?>)s.metrics(7,"Asia/Seoul",time).get("days");assertThat(days).anySatisfy(v->assertThat(SleepService.obj(v)).containsEntry("date","2026-10-02").containsEntry("intervalMinutes",480.0));
  });
 }
}
