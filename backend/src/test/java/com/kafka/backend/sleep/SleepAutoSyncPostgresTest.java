package com.kafka.backend.sleep;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.sleep.SleepService.*;

/** Real PostgreSQL, isolated schema, rollback fixtures; inherited contracts remain enabled. */
class SleepAutoSyncPostgresTest extends SleepPostgresTest {
 Map<String,Object> estimate(UUID id,long revision){return action("AUTO_APPLY_SESSION",id,revision,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T21:00:00Z"),"fieldTimezones",Map.of("bedtimeIntentAt","Asia/Seoul","wakeAt","Asia/Seoul")));}
 @Test void morningEstimateIsOnceAndUsesActualWakeDayBeforeAlarm(){rollback(s->{
  UUID id=UUID.randomUUID();var request=estimate(id,0);var receipt=s.action(request);
  assertThat(receipt).containsEntry("mergeOutcome","APPLIED");assertThat(s.action(request)).isEqualTo(receipt);
  assertThat(s.session(id)).containsEntry("logicalWakeDate","2026-10-03").containsEntry("expectedWakeDate","2026-10-03").containsEntry("bedtimeSource","USAGE_AUTO").containsEntry("wakeCertainty","ESTIMATED").containsEntry("revision",1);
  assertThat(s.action(estimate(id,1))).containsEntry("mergeOutcome","MANUAL_PRIORITY_OR_UNCHANGED");
  assertThat(s.session(id)).containsEntry("revision",1);assertThat((List<?>)s.events(id,null,100).get("items")).hasSize(1);
  var duplicate=s.action(estimate(UUID.randomUUID(),0));assertThat(obj(duplicate.get("session"))).containsEntry("id",id.toString());
  assertThat((List<?>)s.history(null,null,null,100,false).get("items")).hasSize(1);
 });}
 @Test void manualEndpointsAndExplicitUnknownBeatFutureEstimates(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(estimate(id,0));
  s.action(action("CORRECT_SESSION",id,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-02T22:00:00Z"))));
  s.action(estimate(id,2));assertThat(s.session(id)).containsEntry("wakeAt","2026-10-02T22:00:00Z").containsEntry("wakeSource","USER_MANUAL").containsEntry("revision",2);
  s.action(action("MARK_TIME_UNKNOWN",id,2,time.toString(),Map.of("endpoint","bedtime")));
  s.action(estimate(id,3));assertThat(s.session(id)).containsEntry("bedtimeIntentAt",null).containsEntry("bedtimeCertainty","UNKNOWN").containsEntry("revision",3);
 });}
 @Test void annotationRaceCannotOverwriteEndpointsAndZeroNullAndUnicodeArePreserved(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(estimate(id,0));
  s.action(action("CORRECT_SESSION",id,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-02T22:00:00Z"))));
  s.action(action("ANNOTATE_SESSION",id,1,time.toString(),Map.of("fields",Map.of("sleepScore",0,"sleepNote","🙂".repeat(100)))));
  assertThat(s.session(id)).containsEntry("sleepScore",0).containsEntry("sleepNote","🙂".repeat(100)).containsEntry("wakeAt","2026-10-02T22:00:00Z");
  s.action(action("CORRECT_SESSION",id,1,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T13:50:00Z"))));
  assertThat(s.session(id)).containsEntry("sleepScore",0).containsEntry("wakeAt","2026-10-02T22:00:00Z");
  var clear=map("sleepScore",null,"sleepNote",null);s.action(action("ANNOTATE_SESSION",id,1,time.toString(),Map.of("fields",clear)));
  assertThat(s.session(id)).containsEntry("sleepScore",null).containsEntry("sleepNote",null);
 });}
 @Test void invalidAnnotationsAndEndpointSmugglingAreAtomic(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(estimate(id,0));var original=s.session(id);
  for(var fields:List.of(Map.of("sleepScore",101),Map.of("sleepScore",-1),Map.of("sleepScore",1.5),Map.of("sleepScore","2"),Map.of("sleepNote","a\nb"),Map.of("sleepNote","x".repeat(101)),Map.of("wakeAt","2026-10-02T23:00:00Z"))){
   assertThatThrownBy(()->s.action(action("ANNOTATE_SESSION",id,1,time.toString(),Map.of("fields",fields)))).isInstanceOf(SleepError.class);
   assertThat(s.session(id)).isEqualTo(original);
  }
 });}
 @Test void tombstonesBlockSameIdAndNewIdForDeletedWakeDay(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(estimate(id,0));s.action(action("DELETE_SESSION",id,1,time.toString(),Map.of()));
  assertThat(s.action(estimate(id,0))).containsEntry("deleted",true);
  assertThat(s.action(estimate(UUID.randomUUID(),0))).containsEntry("mergeOutcome","DELETED_DAY").containsEntry("deleted",true);
  assertThat((List<?>)s.history(null,null,null,100,true).get("items")).isEmpty();
 });}
 @Test void undatedHistoricalTombstonePreventsAutomaticBackfillWithoutBlockingManualHistory(){rollback(s->{
  db.update("insert into sleep_tombstones(owner_id,session_id,revision,operation_id,deleted_at) values(?,?,1,?,'2026-10-03T00:00Z')",owner,UUID.randomUUID(),UUID.randomUUID());
  assertThat(s.action(estimate(UUID.randomUUID(),0))).containsEntry("mergeOutcome","LEGACY_TOMBSTONE_BACKFILL_PROTECTED");
  UUID id=UUID.randomUUID();s.action(action("CORRECT_SESSION",id,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T22:00:00Z"))));
  assertThat(s.session(id)).containsEntry("logicalWakeDate","2026-10-03");
 });}
 @Test void legacyNapEnvelopeAlsoRequiresUpgradeBeforeAnyMutation(){rollback(s->{
  var legacy=map("operationId",UUID.randomUUID().toString(),"actionType","CREATE_NAP","napId",UUID.randomUUID().toString());
  assertThatThrownBy(()->s.napAction(legacy)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("SLEEP_PROTOCOL_UPGRADE_REQUIRED"));
  assertThat(db.queryForObject("select count(*) from sleep_naps where owner_id=?",Long.class,owner)).isZero();
 });}
 @Test void protocolRejectsLegacyBeforeReplayButAllowsBackdatedManual(){rollback(s->{
  UUID id=UUID.randomUUID();var request=estimate(id,0);s.action(request);var original=s.session(id);
  var old=new LinkedHashMap<>(request);old.remove("protocolVersion");
  assertThatThrownBy(()->s.action(old)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body.get("code")).isEqualTo("SLEEP_PROTOCOL_UPGRADE_REQUIRED"));
  assertThat(s.session(id)).isEqualTo(original);
  UUID history=UUID.randomUUID();s.action(action("CORRECT_SESSION",history,0,time.toString(),Map.of("fields",Map.of("bedtimeIntentAt","2025-01-01T14:00:00Z","wakeAt","2025-01-01T22:00:00Z"))));
  assertThat(s.session(history)).containsEntry("logicalWakeDate","2025-01-02");
 });}
 @Test void staleAutomaticCannotClobberNewerFactAndInvalidEstimatesAbstain(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(estimate(id,0));var change=estimate(id,1);change.put("payload",Map.of("fields",Map.of("wakeAt","2026-10-02T22:00:00Z")));s.action(change);
  assertThat(s.action(estimate(id,1))).containsEntry("mergeOutcome","NEWER_SERVER_FACT");assertThat(s.session(id)).containsEntry("wakeAt","2026-10-02T22:00:00Z").containsEntry("revision",2);
  var invalid=estimate(id,2);invalid.put("payload",Map.of("fields",Map.of("wakeAt","2026-10-02T13:00:00Z")));
  assertThat(s.action(invalid)).containsEntry("mergeOutcome","INELIGIBLE_INVALID_TIME_RANGE");assertThat(s.session(id)).containsEntry("revision",2);
 });}
 @Test void noDataHistoricalDaysDoNotBecomeCurrentDueQueue(){rollback(s->{
  s.saveSettings(Map.of("expectedRevision",0),"Asia/Seoul");
  db.update("update sleep_settings set document=jsonb_set(document,'{recordingStartDate}','\"2026-01-01\"') where owner_id=?",owner);
  var today=s.today("Asia/Seoul");var pending=(List<Map<String,Object>>)today.get("pendingActions");
  assertThat(pending).hasSizeLessThanOrEqualTo(4);assertThat(pending).allSatisfy(p->assertThat(str(p.get("expectedWakeDate"))).isGreaterThanOrEqualTo("2026-10-02"));
  assertThat(obj(today.get("pendingSummary"))).containsEntry("meaning","MISSING_ENDPOINTS_NOT_SYNC_CONFLICTS");
  assertThat(db.queryForObject("select count(*) from sleep_cycles where owner_id=?",Long.class,owner)).isZero();
 });}
}
