package com.kafka.backend.sleep;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class SleepNapPostgresTest extends SleepPostgresTest {
 Map<String,Object> napAction(String type,UUID id,long revision,String start,String end){
  var p=new LinkedHashMap<String,Object>();if(start!=null)p.put("startAt",start);if(end!=null)p.put("endAt",end);
  return SleepService.map("operationId",UUID.randomUUID().toString(),"actionType",type,"napId",id.toString(),"expectedRevision",revision,"capturedAt",time.toString(),"timezone","Asia/Seoul","offsetMinutes",540,"deviceId","web-test","entryPoint","HISTORY_EDIT","payload",p);
 }
 @Test void napsAreSeparateAndSameDaySupportsManyAndPagination(){rollback(s->{
  var settings=s.settings();var metrics=s.metrics(7,"Asia/Seoul",time);long cycles=db.queryForObject("select count(*) from sleep_cycles",Long.class);
  for(int i=0;i<3;i++)s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T0"+(i+1)+":00:00Z","2026-10-03T0"+(i+1)+":30:00Z"));
  assertThat(s.settings()).isEqualTo(settings);assertThat(s.metrics(7,"Asia/Seoul",time).get("completeCount")).isEqualTo(metrics.get("completeCount"));assertThat(db.queryForObject("select count(*) from sleep_cycles",Long.class)).isEqualTo(cycles);
  var first=s.naps("2026-10-03","2026-10-03",null,2);assertThat((List<?>)first.get("items")).hasSize(2);assertThat((List<?>)s.naps("2026-10-03","2026-10-03",first.get("nextCursor").toString(),2).get("items")).hasSize(1);
  assertThat(s.napSummary("2026-10-03","2026-10-03","UTC")).containsEntry("count",3).containsEntry("totalIntervalMinutes",90.0);
 });}
 @Test void napReplayRevisionAndOwnerIsolation(){rollback(s->{
  UUID id=UUID.randomUUID();var create=napAction("CREATE_NAP",id,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z");var first=s.napAction(create);assertThat(s.napAction(create)).isEqualTo(first);
  var changed=new LinkedHashMap<>(create);changed.put("payload",Map.of("startAt","2026-10-03T00:00:00Z"));assertThatThrownBy(()->s.napAction(changed)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("IDEMPOTENCY_KEY_REUSED"));
  var other=new SleepService(db,UUID::randomUUID,()->time);assertThatThrownBy(()->other.nap(id)).isInstanceOf(SleepError.class);assertThat(other.naps(null,null,null,30).get("items")).isEqualTo(List.of());
  assertThatThrownBy(()->s.napAction(napAction("UPDATE_NAP",id,0,"2026-10-03T01:05:00Z",null))).isInstanceOf(SleepError.class);
  s.napAction(napAction("UPDATE_NAP",id,1,"2026-10-03T01:05:00Z",null));assertThat(s.nap(id)).containsEntry("revision",2).containsEntry("intervalMinutes",25.0);
 });}
 @Test void napDeleteScrubsEveryReceiptAndCannotResurrect(){rollback(s->{
  UUID id=UUID.randomUUID();var a=napAction("CREATE_NAP",id,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z");s.napAction(a);var deletion=napAction("DELETE_NAP",id,1,null,null);var deleted=s.napAction(deletion);assertThat(s.napAction(deletion)).isEqualTo(deleted);
  assertThatThrownBy(()->s.nap(id)).isInstanceOf(SleepError.class);assertThat(s.napAction(a)).containsEntry("deleted",true).doesNotContainKey("nap");
  assertThatThrownBy(()->s.napAction(napAction("CREATE_NAP",id,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z"))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("NAP_DELETED"));
  assertThat(db.queryForObject("select count(*) from sleep_nap_events where nap_id=?",Long.class,id)).isZero();
  assertThat(db.queryForObject("select request::text || receipt::text from sleep_receipts where owner_id=? and operation_id=?",String.class,owner,UUID.fromString(a.get("operationId").toString()))).doesNotContain("2026-10-03T01:");
 });}
 @Test void napOverlapAdjacentAndOpenMain(){rollback(s->{
  UUID first=UUID.randomUUID();s.napAction(napAction("CREATE_NAP",first,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z"));
  s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T01:30:00Z","2026-10-03T02:00:00Z"));
  assertThatThrownBy(()->s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T01:15:00Z","2026-10-03T01:45:00Z"))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body).containsEntry("conflictingResourceType","NAP"));
  UUID main=UUID.randomUUID();s.action(bed(main,"2026-10-03T02:00:00Z"));
  assertThatThrownBy(()->s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T03:00:00Z","2026-10-03T03:30:00Z"))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body).containsEntry("conflictingResourceType","MAIN"));
 });}
 @Test void mainCorrectionAndCaptureRejectNapSymmetrically(){rollback(s->{
  s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z"));
  UUID main=UUID.randomUUID();assertThatThrownBy(()->s.action(bed(main,"2026-10-03T00:30:00Z"))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body).containsEntry("code","SESSION_OVERLAP").containsEntry("conflictingResourceType","NAP"));
  s.action(action("CORRECT_SESSION",main,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T22:00:00Z"))));
  assertThatThrownBy(()->s.action(action("CORRECT_SESSION",main,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-03T01:15:00Z"))))).isInstanceOf(SleepError.class);
  assertThat(s.session(main)).containsEntry("revision",1).containsEntry("wakeAt","2026-10-02T22:00:00Z");
 });}
 @Test void napZonesMidnightLongAndFuture(){rollback(s->{
  UUID id=UUID.randomUUID();var a=napAction("CREATE_NAP",id,0,"2026-10-01T23:30:00Z","2026-10-02T00:30:00Z");SleepService.obj(a.get("payload")).put("startTimezone","UTC");SleepService.obj(a.get("payload")).put("endTimezone","Asia/Seoul");s.napAction(a);assertThat(s.nap(id)).containsEntry("startLocalDate","2026-10-01").containsEntry("intervalMinutes",60.0);
  var longNap=napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-09-29T00:00:00Z","2026-09-30T02:00:00Z");assertThatThrownBy(()->s.napAction(longNap)).isInstanceOf(SleepError.class);SleepService.obj(longNap.get("payload")).put("confirmLongInterval",true);s.napAction(longNap);
  assertThatThrownBy(()->s.napAction(napAction("CREATE_NAP",UUID.randomUUID(),0,"2026-10-03T12:10:00Z","2026-10-03T12:20:00Z"))).isInstanceOf(SleepError.class);
 });}
 @Test void concurrentMainNapWritesHaveOneWinner() throws Exception {
  var gate=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);UUID main=UUID.randomUUID(),nap=UUID.randomUUID();
  try{
   var a=pool.submit(()->{gate.await();try{tx.executeWithoutResult(st->sleep.action(bed(main,"2026-10-03T02:00:00Z")));return "OK";}catch(SleepError e){return e.body.get("code");}});
   var b=pool.submit(()->{gate.await();try{tx.executeWithoutResult(st->sleep.napAction(napAction("CREATE_NAP",nap,0,"2026-10-03T02:15:00Z","2026-10-03T02:30:00Z")));return "OK";}catch(SleepError e){return e.body.get("code");}});gate.countDown();assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","SESSION_OVERLAP");
  }finally{pool.shutdownNow();tx.executeWithoutResult(st->{db.update("delete from sleep_sessions where id=?",main);db.update("delete from sleep_naps where id=?",nap);});}
 }
 @Test void napTablesDenyDirectBrowserAccessAndMigrationKeepsMainRows(){rollback(s->{
  assertThat(db.queryForList("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=? and c.relname in ('sleep_naps','sleep_nap_events','sleep_nap_tombstones')",Boolean.class,schema)).containsExactly(true,true,true);
  assertThat(db.queryForObject("select checksum from flyway_schema_history where version='76'",Integer.class)).isEqualTo(-1323816615);
 });}
 @Test void mainUndoRechecksNewNapAndPreservesBoth(){rollback(s->{
  UUID main=UUID.randomUUID();s.action(action("CORRECT_SESSION",main,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T22:00:00Z"))));
  var edited=s.action(action("CORRECT_SESSION",main,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-02T21:00:00Z"))));
  UUID nap=UUID.randomUUID();s.napAction(napAction("CREATE_NAP",nap,0,"2026-10-02T21:00:00Z","2026-10-02T21:30:00Z"));
  assertThatThrownBy(()->s.action(action("UNDO_EVENT",main,2,time.toString(),Map.of("targetEventId",edited.get("eventId"))))).isInstanceOf(SleepError.class);assertThat(s.session(main)).containsEntry("revision",2);assertThat(s.nap(nap)).containsEntry("revision",1);
 });}
 @Test void napPopulatedV76UpgradePreservesHistoricalRows(){
  String migrationSchema="sleep_qa_"+UUID.randomUUID().toString().replace("-","");
  var base=new org.springframework.jdbc.datasource.DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));var jdbc=new org.springframework.jdbc.core.JdbcTemplate(base);jdbc.execute("create schema "+migrationSchema);
  try{
   var f=org.flywaydb.core.Flyway.configure().dataSource(base).schemas(migrationSchema).defaultSchema(migrationSchema).locations(SleepWebRuntime.migrations()).baselineVersion("69").target("76").cleanDisabled(true).load();f.baseline();f.migrate();
   UUID id=UUID.randomUUID(),event=UUID.randomUUID(),op=UUID.randomUUID();String prefix=migrationSchema+".";
   jdbc.update("insert into "+prefix+"sleep_cycles values(?,?,date '2026-10-03','Asia/Seoul',1,'{\"fixture\":\"historical cycle\"}'::jsonb)",owner,"historical");
   jdbc.update("insert into "+prefix+"sleep_sessions(id,owner_id,cycle_id,status,bedtime_at,wake_at,logical_wake_date,expected_wake_date,revision,document) values(?,?,'historical','CLOSED','2026-10-02T14:00Z','2026-10-02T22:00Z','2026-10-03','2026-10-03',1,'{\"fixture\":\"historical endpoints and provenance\"}'::jsonb)",id,owner);
   jdbc.update("insert into "+prefix+"sleep_events(event_id,owner_id,session_id,operation_id,previous_revision,new_revision,document) values(?,?,?,?,0,1,'{\"before\":{},\"after\":{\"historical\":true}}')",event,owner,id,op);
   jdbc.update("insert into "+prefix+"sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,'{\"timestamp\":\"2026-10-02T14:00Z\"}','{\"fixture\":\"original receipt\"}')",owner,op);
   var before=new LinkedHashMap<String,List<Map<String,Object>>>();for(String table:List.of("sleep_settings","sleep_cycles","sleep_sessions","sleep_events","sleep_receipts","sleep_pending","sleep_context_revisions","sleep_tombstones"))before.put(table,jdbc.queryForList("select * from "+prefix+table));
   var upgrade=org.flywaydb.core.Flyway.configure().dataSource(base).schemas(migrationSchema).defaultSchema(migrationSchema).locations(SleepWebRuntime.migrations()).cleanDisabled(true).load();upgrade.migrate();upgrade.validate();
   for(var entry:before.entrySet())assertThat(jdbc.queryForList("select * from "+prefix+entry.getKey())).isEqualTo(entry.getValue());
   assertThat(jdbc.queryForObject("select count(*) from "+prefix+"sleep_tombstones",Long.class)).isZero();
  }finally{if(migrationSchema.matches("sleep_qa_[0-9a-f]{32}"))jdbc.execute("drop schema "+migrationSchema+" cascade");}
 }
 @Test void napConcurrentWritesHaveOneWinner() throws Exception {
  var gate=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);UUID main=UUID.randomUUID(),nap=UUID.randomUUID();
  try{
   var a=pool.submit(()->{gate.await();try{tx.executeWithoutResult(st->sleep.napAction(napAction("CREATE_NAP",main,0,"2026-10-03T02:00:00Z","2026-10-03T02:30:00Z")));return "OK";}catch(SleepError e){return e.body.get("code");}});
   var b=pool.submit(()->{gate.await();try{tx.executeWithoutResult(st->sleep.napAction(napAction("CREATE_NAP",nap,0,"2026-10-03T02:15:00Z","2026-10-03T02:30:00Z")));return "OK";}catch(SleepError e){return e.body.get("code");}});gate.countDown();assertThat(List.of(a.get(30,TimeUnit.SECONDS),b.get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder("OK","SESSION_OVERLAP");
  }finally{pool.shutdownNow();tx.executeWithoutResult(st->{db.update("delete from sleep_naps where id=?",main);db.update("delete from sleep_naps where id=?",nap);});}
 }
 @Test void napReceiptIdentitySurvivesSameUUIDMainDeletion(){rollback(s->{
  UUID id=UUID.randomUUID();var create=napAction("CREATE_NAP",id,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z");var receipt=s.napAction(create);
  s.action(action("CORRECT_SESSION",id,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T22:00:00Z"))));
  s.action(action("DELETE_SESSION",id,1,time.toString(),Map.of()));
  assertThat(s.napAction(create)).isEqualTo(receipt);assertThat(s.nap(id)).containsEntry("revision",1);
 });}
 @Test void napCollisionKeepsOldAndroidMainSnapshotContract(){rollback(s->{
  UUID id=UUID.randomUUID();s.napAction(napAction("CREATE_NAP",id,0,"2026-10-03T01:00:00Z","2026-10-03T01:30:00Z"));
  s.action(action("CORRECT_SESSION",id,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T22:00:00Z"))));var original=s.session(id);
  assertThatThrownBy(()->s.action(action("CORRECT_SESSION",id,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-03T01:15:00Z"))))).isInstanceOfSatisfying(SleepError.class,e->{
   assertThat(e.body.get("serverSnapshot")).isEqualTo(original);assertThat(SleepService.obj(e.body.get("conflictingSnapshot"))).containsEntry("startAt","2026-10-03T01:00:00Z");
  });
  assertThatThrownBy(()->s.action(bed(UUID.randomUUID(),"2026-10-03T00:30:00Z"))).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body).doesNotContainKey("serverSnapshot").containsKey("conflictingSnapshot"));
 });}
}
