package com.kafka.backend.sleep;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.sleep.SleepService.*;
class AutoCapturePostgresTest extends SleepPostgresTest {
 Map<String,Object> capture(UUID id,String source,String quality,String bed,String wake){var p=map("capturePolicy","automatic-first-v1","source",source,"policyVersion","google-sleep-segment-v1","fields",Map.of("bedtimeIntentAt",bed,"wakeAt",wake),"fieldTimezones",Map.of("bedtimeIntentAt","Asia/Seoul","wakeAt","Asia/Seoul"));if(quality!=null)p.put("googleDetectionStatus",quality);return action("AUTO_APPLY_SESSION",id,0,time.toString(),p);}
 Map<String,Object> google(UUID id,String quality){return capture(id,"GOOGLE_SLEEP_API",quality,"2026-10-02T14:00:00Z","2026-10-02T22:00:00Z");}
 @Test void fallbackUpgradesToGoogleWithoutChangingCanonicalId(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(capture(id,"SCHEDULE_PLACEHOLDER",null,"2026-10-02T14:00:00Z","2026-10-02T22:00:00Z"));assertThat(s.session(id)).containsEntry("provisional",true).containsEntry("metricEligible",false);assertThat(s.metrics(7,"Asia/Seoul",time)).containsEntry("completeCount",0);
  for(var a:List.of(capture(UUID.randomUUID(),"USAGE_ESTIMATE",null,"2026-10-02T15:00:00Z","2026-10-02T22:00:00Z"),google(UUID.randomUUID(),"GOOGLE_PARTIAL"),google(UUID.randomUUID(),"GOOGLE_SUCCESS"))){var r=s.action(a);assertThat(r).containsEntry("mergeOutcome","APPLIED");assertThat(obj(r.get("session"))).containsEntry("id",id.toString());assertThat(s.action(a)).isEqualTo(r);}
  assertThat(s.session(id)).containsEntry("googleDetectionStatus","GOOGLE_SUCCESS").containsEntry("revision",4).containsEntry("wakeCertainty","ESTIMATED");assertThat((List<?>)s.history(null,null,null,100,true).get("items")).hasSize(1);assertThat(s.metrics(7,"Asia/Seoul",time)).containsEntry("completeCount",1);
 });}
 @Test void twentyHourRawGoogleIsProvisionalAndTrustworthyPartialCanReplaceIt(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(capture(id,"GOOGLE_SLEEP_API","GOOGLE_SUCCESS","2026-10-02T02:00:00Z","2026-10-02T22:00:00Z"));assertThat(s.session(id)).containsEntry("intervalMinutes",1200.0).containsEntry("bedtimeIntentAt","2026-10-02T02:00:00Z").containsEntry("anomaly","LONG_INTERVAL").containsEntry("metricEligible",false).containsEntry("status","CLOSED");assertThat(s.metrics(7,"Asia/Seoul",time)).containsEntry("completeCount",0);
  s.action(google(UUID.randomUUID(),"GOOGLE_PARTIAL"));assertThat(s.session(id)).containsEntry("provisional",false).containsEntry("metricEligible",true).containsEntry("intervalMinutes",480.0);
 });}
 @Test void sameDayOrderAndShortGoogleDoNotDuplicate(){rollback(s->{
  UUID id=UUID.randomUUID();s.action(google(id,"GOOGLE_SUCCESS"));var before=s.session(id);s.action(google(UUID.randomUUID(),"GOOGLE_PARTIAL"));assertThat(s.session(id)).isEqualTo(before);assertThat((List<?>)s.history(null,null,null,100,true).get("items")).hasSize(1);
 });rollback(s->{UUID id=UUID.randomUUID();s.action(capture(id,"GOOGLE_SLEEP_API","GOOGLE_SUCCESS","2026-10-02T21:30:00Z","2026-10-02T22:00:00Z"));assertThat(s.session(id)).containsEntry("intervalMinutes",30.0).containsEntry("metricEligible",true);});}
 @Test void everyExplicitOwnerDecisionIsProtected(){for(String type:List.of("CORRECT_SESSION","ANNOTATE_SESSION","MARK_TIME_UNKNOWN","EXCLUDE_SESSION","DELETE_SESSION"))rollback(s->{
  UUID id=UUID.randomUUID();s.action(capture(id,"SCHEDULE_PLACEHOLDER",null,"2026-10-02T14:00:00Z","2026-10-02T22:00:00Z"));var payload=switch(type){case "CORRECT_SESSION"->Map.<String,Object>of("fields",Map.of("wakeAt","2026-10-02T22:15:00Z"));case "ANNOTATE_SESSION"->Map.<String,Object>of("fields",Map.of("sleepNote","owner edit"));case "MARK_TIME_UNKNOWN"->Map.<String,Object>of("endpoint","wake");case "EXCLUDE_SESSION"->Map.<String,Object>of("reason","owner");default->Map.<String,Object>of();};s.action(action(type,id,1,time.toString(),payload));var before=type.equals("DELETE_SESSION")?null:s.session(id);s.action(google(UUID.randomUUID(),"GOOGLE_SUCCESS"));if(before!=null)assertThat(s.session(id)).isEqualTo(before);else assertThat((List<?>)s.history(null,null,null,100,true).get("items")).isEmpty();
 });}
 @Test void oldRecordsAndSourceTruthAreProtected(){rollback(s->{UUID id=UUID.randomUUID();s.action(bed(id,"2026-10-02T14:40:00Z"));var before=s.session(id);s.action(google(UUID.randomUUID(),"GOOGLE_SUCCESS"));assertThat(s.session(id)).isEqualTo(before);assertThatThrownBy(()->s.action(capture(UUID.randomUUID(),"SCHEDULE_PLACEHOLDER","GOOGLE_SUCCESS","2026-10-02T14:00:00Z","2026-10-02T22:00:00Z"))).isInstanceOf(SleepError.class);});}
}
