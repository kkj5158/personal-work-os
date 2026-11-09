package com.kafka.backend.sleep;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.sleep.SleepService.*;

/** Actual PostgreSQL, isolated schema, inherited Sleep fact/owner/receipt regressions. */
class GoogleSleepPostgresTest extends SleepPostgresTest {
 Map<String,Object> google(UUID id,long revision){return action("AUTO_APPLY_SESSION",id,revision,time.toString(),Map.of("source","GOOGLE_SLEEP_API","policyVersion","google-sleep-segment-v1","fields",Map.of("bedtimeIntentAt","2026-10-02T14:00:00Z","wakeAt","2026-10-02T21:00:00Z"),"fieldTimezones",Map.of("bedtimeIntentAt","Asia/Seoul","wakeAt","Asia/Seoul")));}
 @Test void googleProvenanceReceiptReplayAndCrossDeviceCanonicalAreStable(){rollback(s->{
  UUID id=UUID.randomUUID();var a=google(id,0);var first=s.action(a);assertThat(s.action(a)).isEqualTo(first);
  assertThat(s.session(id)).containsEntry("bedtimeSource","GOOGLE_SLEEP_API").containsEntry("wakeSource","GOOGLE_SLEEP_API").containsEntry("bedtimeCertainty","ESTIMATED");
  assertThat(s.metrics(7,"Asia/Seoul",time).get("estimatedCompleteCount")).isEqualTo(1L);
  var other=s.action(google(UUID.randomUUID(),0));assertThat(other).containsEntry("mergeOutcome","CANONICAL_SESSION");assertThat(obj(other.get("session"))).containsEntry("id",id.toString()).containsEntry("revision",1);
  var reused=new LinkedHashMap<>(a);reused.put("deviceId","changed");assertThatThrownBy(()->s.action(reused)).isInstanceOf(SleepError.class);
 });}
 @Test void googleNeverFillsOrChangesManualUnknownExcludedOrStaleFacts(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var before=s.session(id);
  assertThat(s.action(google(id,1))).containsEntry("mergeOutcome","EXISTING_SESSION_PROTECTED");assertThat(s.session(id)).isEqualTo(before);
  s.action(action("MARK_TIME_UNKNOWN",id,1,time.toString(),Map.of("endpoint","wake")));before=s.session(id);s.action(google(id,2));assertThat(s.session(id)).isEqualTo(before);
  assertThat(s.action(google(id,1))).containsEntry("mergeOutcome","NEWER_SERVER_FACT");
  s.action(action("EXCLUDE_SESSION",id,2,time.toString(),Map.of("reason","test")));before=s.session(id);s.action(google(id,3));assertThat(s.session(id)).isEqualTo(before);
 });}
 @Test void googleCannotRecreateDeletedDayAndManualCorrectionKeepsPriority(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(google(id,0));s.action(action("CORRECT_SESSION",id,1,time.toString(),Map.of("fields",Map.of("wakeAt","2026-10-02T22:00:00Z"))));var before=s.session(id);s.action(google(id,2));assertThat(s.session(id)).isEqualTo(before);
  s.action(action("DELETE_SESSION",id,2,time.toString(),Map.of()));assertThat(s.action(google(id,0))).containsEntry("deleted",true);assertThat(s.action(google(UUID.randomUUID(),0))).containsEntry("mergeOutcome","DELETED_DAY");
 });}
 @Test void fullAndPartialShortAndLongSegmentsAutoCloseWithoutConfirmation(){
  for(String quality:List.of("GOOGLE_SUCCESS","GOOGLE_PARTIAL"))for(int minutes:List.of(30,60,1020,1079))rollback(s->{
   UUID id=UUID.randomUUID();var a=google(id,0);var payload=new LinkedHashMap<>(obj(a.get("payload")));payload.put("googleDetectionStatus",quality);
   var end=java.time.Instant.parse("2026-10-02T21:00:00Z");payload.put("fields",Map.of("bedtimeIntentAt",end.minusSeconds(minutes*60L).toString(),"wakeAt",end.toString()));a.put("payload",payload);
   var receipt=s.action(a);assertThat(receipt).containsEntry("mergeOutcome","APPLIED");
   assertThat(s.session(id)).containsEntry("status","CLOSED").containsEntry("googleDetectionStatus",quality).containsEntry("wakeCertainty","ESTIMATED").containsEntry("wakeSource","GOOGLE_SLEEP_API");
   assertThat(s.action(a)).isEqualTo(receipt);assertThat(s.today("Asia/Seoul").get("lastClosed")).isEqualTo(s.session(id));
   assertThat(s.metrics(7,"Asia/Seoul",time).get("completeCount")).isEqualTo(1);
  });
 }
 @Test void eighteenHoursRequiresManualConfirmationAndUnknownQualityCannotWrite(){rollback(s->{
  var a=google(UUID.randomUUID(),0);var p=new LinkedHashMap<>(obj(a.get("payload")));p.put("fields",Map.of("bedtimeIntentAt","2026-10-02T03:00:00Z","wakeAt","2026-10-02T21:00:00Z"));a.put("payload",p);
  assertThat(s.action(a)).containsEntry("mergeOutcome","INELIGIBLE_TIME_CONFIRMATION_REQUIRED").containsEntry("session",null);
  var b=google(UUID.randomUUID(),0);var q=new LinkedHashMap<>(obj(b.get("payload")));q.put("googleDetectionStatus","NOT_DETECTED");b.put("payload",q);
  assertThatThrownBy(()->s.action(b)).isInstanceOfSatisfying(SleepError.class,e->assertThat(e.body).containsEntry("code","INVALID_GOOGLE_STATUS"));
  assertThat((List<?>)s.history(null,null,null,100,true).get("items")).isEmpty();
 });}
 @Test void malformedFuturePartialOrUnknownSourceCannotCreateFacts(){rollback(s->{
  for(var fields:List.of(Map.of("bedtimeIntentAt","2026-10-02T21:00:00Z","wakeAt","2026-10-02T14:00:00Z"),Map.of("bedtimeIntentAt","2026-10-03T10:00:00Z","wakeAt","2026-10-03T14:00:00Z"),Map.of("wakeAt","2026-10-02T21:00:00Z"))){var a=google(UUID.randomUUID(),0);a.put("payload",Map.of("source","GOOGLE_SLEEP_API","policyVersion","google-sleep-segment-v1","fields",fields));assertThatThrownBy(()->s.action(a)).isInstanceOf(SleepError.class);}
  var a=google(UUID.randomUUID(),0);a.put("payload",Map.of("source","FAKE","fields",Map.of("wakeAt","2026-10-02T21:00:00Z")));assertThatThrownBy(()->s.action(a)).isInstanceOf(SleepError.class);
  assertThat((List<?>)s.history(null,null,null,100,true).get("items")).isEmpty();
 });}
}
