package com.kafka.backend.sleep;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static com.kafka.backend.sleep.SleepService.*;
import static org.assertj.core.api.Assertions.*;
class SleepGuidancePolicyTest {
 final Instant now=Instant.parse("2026-10-17T03:00:00Z");
 final SleepGuidancePolicy.Parameters defaults=new SleepGuidancePolicy.Parameters(14,7,15,180);
 Map<String,Object> goal(){return map("enabled",true,"revision",1,"timezone","Asia/Seoul","preferredWake","07:00","wakeWindowStart","07:00","wakeWindowEnd","07:30","desiredOpportunityMinutes",450);}
 List<Map<String,Object>> nights(int n){var rows=new ArrayList<Map<String,Object>>();for(int i=0;i<n;i++){var day=LocalDate.of(2026,10,16).minusDays(i);rows.add(map("status","CLOSED","logicalWakeDate",day.toString(),"bedtimeIntentAt",day.atTime(0,20).atZone(ZoneId.of("Asia/Seoul")).toInstant().toString(),"wakeAt",day.atTime(7,30).atZone(ZoneId.of("Asia/Seoul")).toInstant().toString(),"bedtimeTimezone","Asia/Seoul","wakeTimezone","Asia/Seoul","bedtimeSource","USER_TAP","wakeSource","USER_MANUAL"));}return rows;}
 Map<String,Object> project(List<Map<String,Object>> rows,Map<String,Object> goal){return SleepGuidancePolicy.project(rows,goal,"Asia/Seoul",now,defaults);}
 @Test void transparentStepDoesNotClaimDesiredOpportunityAchieved(){var p=project(nights(10),goal());assertThat(p).containsEntry("status","AVAILABLE").containsEntry("sampleN",10).containsEntry("tentative",true);var suggestion=obj(p.get("suggestion"));assertThat(suggestion).containsEntry("bedtime","2026-10-18T00:05+09:00").containsEntry("wake","2026-10-18T07:15+09:00").containsEntry("opportunityMinutes",430).containsEntry("remainingOpportunityMinutes",20);}
 @Test void noGoalSparseIrregularMixedAndMultipleNightsAbstain(){
  assertThat(project(nights(10),Map.of())).containsEntry("status","NOT_READY").doesNotContainKey("suggestion");
  assertThat(project(nights(6),goal())).containsEntry("status","INSUFFICIENT_DATA");
  var mixed=nights(10);mixed.getFirst().put("wakeTimezone","America/New_York");assertThat(project(mixed,goal())).containsEntry("reasonCodes",List.of("MIXED_TIMEZONES"));
  var duplicate=nights(10);duplicate.add(duplicate.getFirst());assertThat(project(duplicate,goal())).containsEntry("reasonCodes",List.of("MULTIPLE_NIGHTS_PER_DAY"));
  var irregular=nights(10);irregular.getFirst().put("wakeAt","2026-10-16T06:30:00Z");assertThat(project(irregular,goal())).containsEntry("reasonCodes",List.of("IRREGULAR_OR_MULTIPLE_REGIMES"));
 }
 @Test void circularMidnightSummaryAndHardFixedWake(){
  assertThat(SleepGuidancePolicy.summary(List.of(1430.0,0.0,10.0))).containsEntry("minute",0).containsEntry("spreadMinutes",20.0);
  var fixed=goal();fixed.put("wakeWindowEnd","07:00");assertThat(project(nights(10),fixed)).containsEntry("reasonCodes",List.of("STEP_OUTSIDE_HARD_WAKE_WINDOW")).doesNotContainKey("suggestion");
 }
 @Test void optionalIncompleteGoalAndResetCannotInventBedtime(){var g=goal();g.remove("desiredOpportunityMinutes");assertThat(project(nights(10),g)).doesNotContainKey("suggestion");assertThat(SleepGuidancePolicy.validateGoal(Map.of("enabled",false))).containsExactlyEntriesOf(Map.of("enabled",false));}
 @Test void thresholdSensitivityIsExplicitAndBoundaryTested(){for(int lookback:new int[]{7,14,21,30})for(int minimum:new int[]{5,7,10})for(int step:new int[]{5,15,30}){
  var p=new SleepGuidancePolicy.Parameters(lookback,minimum,step,180);var result=SleepGuidancePolicy.project(nights(10),goal(),"Asia/Seoul",now,p);
  assertThat(result.get("sampleN")).isEqualTo(Math.min(10,lookback-1));assertThat(result.get("minimumNights")).isEqualTo(minimum);if(((Integer)result.get("sampleN"))<minimum)assertThat(result).doesNotContainKey("suggestion");
 }}
 @Test void goalValidationAndZoneTravelRemainExplicit(){var invalid=goal();invalid.put("preferredWake","09:00");assertThatThrownBy(()->SleepGuidancePolicy.validateGoal(invalid)).isInstanceOf(IllegalArgumentException.class);var zone=goal();zone.put("timezone","UTC");assertThat(project(nights(10),zone)).containsEntry("reasonCodes",List.of("GOAL_TIMEZONE_MISMATCH"));}
}
