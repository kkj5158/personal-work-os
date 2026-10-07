package com.kafka.backend.sleep;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class SleepRecorderPostgresTest extends SleepPostgresTest {
 @Test void reminderEditsFreezeStartedKindAndUpdateUnstartedKind(){rollback(s->{
  var old=s.saveSettings(Map.of("expectedRevision",0),"Asia/Seoul");var tomorrow=s.cycle(java.time.LocalDate.of(2026,10,4),java.time.ZoneId.of("Asia/Seoul"),true);
  // At fixed QA now (21:00 KST), tomorrow's bedtime is still ahead; today's wake is already started.
  var today=s.cycle(java.time.LocalDate.of(2026,10,3),java.time.ZoneId.of("Asia/Seoul"),true);var originalWake=today.get("wakeDueAt");
  s.saveSettings(Map.of("expectedRevision",1,"bedtime",Map.of("localTime","22:15"),"wake",Map.of("localTime","08:30")),"Asia/Seoul");
  var t=s.cycle(java.time.LocalDate.of(2026,10,3),java.time.ZoneId.of("Asia/Seoul"),false);var n=s.cycle(java.time.LocalDate.of(2026,10,4),java.time.ZoneId.of("Asia/Seoul"),false);
  assertThat(t.get("wakeDueAt")).isEqualTo(originalWake);assertThat(n.get("wakeDueAt")).isEqualTo("2026-10-03T23:30:00Z");assertThat(n.get("bedtimeDueAt")).isEqualTo("2026-10-03T13:15:00Z");assertThat(n.get("cycleId")).isEqualTo(tomorrow.get("cycleId"));
 });}
 @Test void compositeUndoRejectsLaterPriorChangeAtomically(){rollback(s->{
  UUID old=UUID.randomUUID(),next=UUID.randomUUID();s.action(bed(old,"2026-10-01T14:40:00Z"));var transition=s.action(action("START_NEW_AFTER_UNRESOLVED",next,0,"2026-10-03T11:00:00Z",Map.of("priorSessionId",old.toString(),"priorExpectedRevision",1)));
  s.action(action("CORRECT_SESSION",old,2,"2026-10-03T11:00:01Z",Map.of("fields",Map.of("bedtimeIntentAt","2026-10-01T14:30:00Z"))));
  assertThatThrownBy(()->s.action(action("UNDO_EVENT",next,1,"2026-10-03T11:00:02Z",Map.of("targetEventId",transition.get("eventId"))))).isInstanceOf(SleepError.class);
  assertThat(s.active()).containsEntry("id",next.toString()).containsEntry("revision",1);assertThat(s.session(old)).containsEntry("revision",3);
 });}
 @Test void populatedV70UpgradePreservesAllHistoricalRows(){
  String migrationSchema="sleep_qa_"+UUID.randomUUID().toString().replace("-","");
  var base=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var jdbc=new org.springframework.jdbc.core.JdbcTemplate(base);jdbc.execute("create schema "+migrationSchema);
  try{
   var f=org.flywaydb.core.Flyway.configure().dataSource(base).schemas(migrationSchema).defaultSchema(migrationSchema).locations(SleepDevRuntime.migrations()).baselineVersion("69").target("70").cleanDisabled(true).load();f.baseline();f.migrate();
   UUID id=UUID.randomUUID(),event=UUID.randomUUID(),op=UUID.randomUUID();String prefix=migrationSchema+".";
   jdbc.update("insert into "+prefix+"sleep_cycles values(?,?,date '2026-10-03','Asia/Seoul',1,'{\"fixture\":\"historical cycle\"}'::jsonb)",owner,"historical");
   jdbc.update("insert into "+prefix+"sleep_sessions(id,owner_id,cycle_id,status,bedtime_at,wake_at,logical_wake_date,expected_wake_date,revision,document) values(?,?,'historical','CLOSED','2026-10-02T14:00Z','2026-10-02T22:00Z','2026-10-03','2026-10-03',1,'{\"fixture\":\"historical endpoints and provenance\"}'::jsonb)",id,owner);
   jdbc.update("insert into "+prefix+"sleep_events(event_id,owner_id,session_id,operation_id,previous_revision,new_revision,document) values(?,?,?,?,0,1,'{\"before\":{},\"after\":{\"historical\":true}}')",event,owner,id,op);
   jdbc.update("insert into "+prefix+"sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,'{\"timestamp\":\"2026-10-02T14:00Z\"}','{\"fixture\":\"original receipt\"}')",owner,op);
   var before=new LinkedHashMap<String,List<Map<String,Object>>>();for(String table:List.of("sleep_cycles","sleep_sessions","sleep_events","sleep_receipts"))before.put(table,jdbc.queryForList("select * from "+prefix+table));
   var upgrade=org.flywaydb.core.Flyway.configure().dataSource(base).schemas(migrationSchema).defaultSchema(migrationSchema).locations(SleepDevRuntime.migrations()).cleanDisabled(true).load();upgrade.migrate();upgrade.validate();
   for(var entry:before.entrySet())assertThat(jdbc.queryForList("select * from "+prefix+entry.getKey())).isEqualTo(entry.getValue());
   assertThat(jdbc.queryForObject("select count(*) from "+prefix+"sleep_tombstones",Long.class)).isZero();
  }finally{if(migrationSchema.matches("sleep_qa_[0-9a-f]{32}"))jdbc.execute("drop schema "+migrationSchema+" cascade");}
 }
 @Test void confirmedLongIntervalAndUneditedProvenance(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-01T10:00:00Z"));var before=s.session(id);
  var p=Map.of("fields",Map.of("wakeAt","2026-10-02T12:00:00Z"),"confirmLongInterval",true);
  s.action(action("CORRECT_SESSION",id,1,"2026-10-03T10:00:00Z",p));
  var after=s.session(id);assertThat(after).containsEntry("intervalMinutes",1560.0);
  for(String suffix:List.of("Timezone","OffsetMinutes","Certainty","Source","EntryPoint","RecordedAt"))assertThat(after.get("bedtime"+suffix)).isEqualTo(before.get("bedtime"+suffix));
 });}
 @Test void missingTransitionAndCompositeInverse(){rollback(s->{
  UUID old=UUID.randomUUID(),next=UUID.randomUUID();s.action(bed(old,"2026-10-01T14:40:00Z"));
  var prior=s.session(old);var result=s.action(action("START_NEW_AFTER_UNRESOLVED",next,0,"2026-10-03T11:00:00Z",Map.of("priorSessionId",old.toString(),"priorExpectedRevision",1)));
  assertThat(s.session(old)).containsEntry("wakeCertainty",null).containsEntry("wakeAt",null).containsEntry("status","INCOMPLETE");
  var undo=action("UNDO_EVENT",next,1,"2026-10-03T11:00:02Z",Map.of("targetEventId",result.get("eventId")));var receipt=s.action(undo);
  assertThat(receipt).containsEntry("deleted",true);assertThat(s.action(undo)).isEqualTo(receipt);
  assertThat(s.active()).containsEntry("id",old.toString()).containsEntry("bedtimeIntentAt",prior.get("bedtimeIntentAt"));
  assertThatThrownBy(()->s.session(next)).isInstanceOf(SleepError.class);
 });}
 @Test void deletionScrubsFactsReplaysAndRejectsResurrection(){rollback(s->{
  UUID id=UUID.randomUUID();var capture=bed(id,"2026-10-02T14:40:00Z");s.action(capture);
  String context=s.contextRevision();var delete=action("DELETE_SESSION",id,1,"2026-10-03T11:00:00Z",Map.of());var receipt=s.action(delete);
  assertThat(s.action(delete)).isEqualTo(receipt);assertThat(s.contextRevision()).isNotEqualTo(context);
  assertThat(db.queryForObject("select count(*) from sleep_events where session_id=?",Long.class,id)).isZero();
  assertThat(db.queryForObject("select count(*) from sleep_receipts where owner_id=? and (request::text like '%14:40%' or receipt::text like '%14:40%')",Long.class,owner)).isZero();
  assertThat(s.action(capture)).containsEntry("deleted",true);
  var reused=new LinkedHashMap<>(capture);reused.put("payload",Map.of());assertThatThrownBy(()->s.action(reused)).isInstanceOf(SleepError.class);
  assertThatThrownBy(()->s.action(bed(id,"2026-10-03T11:00:00Z"))).isInstanceOf(SleepError.class);
  assertThat(s.metricRecords(java.time.Instant.parse("2026-10-03T12:00:00Z"))).isEmpty();
 });}
 @Test void staleDeletionAndForeignOwnerCannotDelete(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));
  assertThatThrownBy(()->s.action(action("DELETE_SESSION",id,0,"2026-10-03T11:00:00Z",Map.of()))).isInstanceOf(SleepError.class);
  UUID foreignOwner=UUID.randomUUID();var foreign=new SleepService(db,()->foreignOwner,()->time);
  assertThatThrownBy(()->foreign.action(action("DELETE_SESSION",id,1,"2026-10-03T11:00:00Z",Map.of()))).isInstanceOf(Exception.class);
  assertThat(s.session(id)).containsEntry("revision",1);
 });}
 @Test void wakeUndoPreservesBedAndInitialUndoCancelsFact(){rollback(s->{
  UUID id=UUID.randomUUID();var a=bed(id,"2026-10-02T14:40:00Z");var capture=s.action(a);
  var wake=s.action(action("CAPTURE_WAKE",id,1,"2026-10-02T22:00:00Z",Map.of()));
  s.action(action("UNDO_EVENT",id,2,"2026-10-02T22:00:02Z",Map.of("targetEventId",wake.get("eventId"))));
  assertThat(s.session(id)).containsEntry("bedtimeIntentAt","2026-10-02T14:40:00Z").containsEntry("wakeAt",null).containsEntry("status","OPEN");
  UUID next=UUID.randomUUID();s.action(action("EXCLUDE_SESSION",id,3,"2026-10-03T10:00:00Z",Map.of()));var fresh=s.action(bed(next,"2026-10-03T11:00:00Z"));
  s.action(action("UNDO_EVENT",next,1,"2026-10-03T11:00:01Z",Map.of("targetEventId",fresh.get("eventId"))));
  assertThatThrownBy(()->s.session(next)).isInstanceOf(SleepError.class);
 });}
}

