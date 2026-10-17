package com.kafka.backend.sleep;

import java.time.*;
import java.util.*;
import static com.kafka.backend.sleep.SleepService.*;

/** Conservative development policy. Thresholds are explicitly tentative, not clinical recommendations. */
public final class SleepGuidancePolicy {
 public static final String VERSION="sleep-guidance.rules.dev1";
 public record Parameters(int lookbackDays,int minimumNights,int stepMinutes,int maximumSpreadMinutes){
  public Parameters {if(lookbackDays<7||lookbackDays>30||minimumNights<3||minimumNights>30||stepMinutes<1||stepMinutes>30||maximumSpreadMinutes<15||maximumSpreadMinutes>240)throw new IllegalArgumentException("Invalid tentative guidance parameters");}
 }
 static int minute(Instant at,ZoneId zone){var t=at.atZone(zone).toLocalTime();return t.getHour()*60+t.getMinute();}
 static double delta(double a,double b){return ((a-b+2160)%1440)-720;}
 static double median(List<Double> input){var rows=input.stream().sorted().toList();int n=rows.size();return n%2==1?rows.get(n/2):(rows.get(n/2-1)+rows.get(n/2))/2;}
 static Map<String,Object> summary(List<Double> rows){
  double center=rows.stream().min(Comparator.comparingDouble(a->rows.stream().mapToDouble(b->Math.abs(delta(b,a))).sum())).orElse(0.0);
  var unwrapped=rows.stream().map(x->center+delta(x,center)).toList();double mid=median(unwrapped);
  return map("minute",(int)Math.round((mid+1440)%1440),"medianAbsoluteDeviationMinutes",median(unwrapped.stream().map(x->Math.abs(x-mid)).toList()),
   "spreadMinutes",Collections.max(unwrapped)-Collections.min(unwrapped));
 }
 public static Map<String,Object> project(List<Map<String,Object>> records,Map<String,Object> goal,String timezone,Instant asOf,Parameters parameters){
  var zone=ZoneId.of(timezone);var end=asOf.atZone(zone).toLocalDate();var start=end.minusDays(parameters.lookbackDays()-1);
  var complete=new ArrayList<Map<String,Object>>();int excluded=0,partial=0;boolean mixed=false,duplicateDay=false;
  var days=new HashSet<String>();var sources=new TreeMap<String,Integer>();var beds=new ArrayList<Double>();var wakes=new ArrayList<Double>();
  for(var r:records){
   Object date=r.getOrDefault("logicalWakeDate",r.get("expectedWakeDate"));if(date==null)date=r.get("expectedWakeDate");if(date==null)continue;
   var day=LocalDate.parse(date.toString());if(day.isBefore(start)||day.isAfter(end))continue;
   if(r.get("excludedAt")!=null||Boolean.TRUE.equals(r.get("deleted"))){excluded++;continue;}
   if(!"CLOSED".equals(r.get("status"))||r.get("bedtimeIntentAt")==null||r.get("wakeAt")==null||"UNKNOWN".equals(r.get("bedtimeCertainty"))||"UNKNOWN".equals(r.get("wakeCertainty"))){partial++;continue;}
   Instant b=Instant.parse(r.get("bedtimeIntentAt").toString()),w=Instant.parse(r.get("wakeAt").toString());
   if(w.isAfter(asOf)||!w.isAfter(b)){partial++;continue;}
   if(!days.add(day.toString()))duplicateDay=true;
   if(!timezone.equals(r.get("bedtimeTimezone"))||!timezone.equals(r.get("wakeTimezone")))mixed=true;
   complete.add(r);beds.add((double)minute(b,zone));wakes.add((double)minute(w,zone));
   for(String e:List.of("bedtime","wake"))sources.merge(Objects.toString(r.get(e+"Source"),"UNSPECIFIED"),1,Integer::sum);
  }
  var output=map("policyVersion",VERSION,"tentative",true,"lookbackDays",parameters.lookbackDays(),"minimumNights",parameters.minimumNights(),"stepMinutes",parameters.stepMinutes(),"maximumSpreadMinutes",parameters.maximumSpreadMinutes(),
   "from",start.toString(),"to",end.toString(),"sampleN",complete.size(),"excludedN",excluded,"incompleteN",partial,"sourceCounts",sources,
   "metricMeaning",MEANING,"objectiveMeasurement",false,"caveats",List.of("취침·기상 간격은 측정된 수면 시간이 아닙니다.","임계값은 검증 전 DEV 잠정값입니다.","서버는 미전송 단말 기록을 알 수 없습니다."));
  String status="AVAILABLE",reason="CONSERVATIVE_STEP";
  if(complete.size()<parameters.minimumNights()){status="INSUFFICIENT_DATA";reason="TOO_FEW_COMPLETE_NIGHTS";}
  else if(mixed||duplicateDay){status="INSUFFICIENT_DATA";reason=mixed?"MIXED_TIMEZONES":"MULTIPLE_NIGHTS_PER_DAY";}
  else {
   var bedSummary=summary(beds);var wakeSummary=summary(wakes);output.put("bedtimeSummary",bedSummary);output.put("wakeSummary",wakeSummary);
   if(((Number)bedSummary.get("spreadMinutes")).doubleValue()>parameters.maximumSpreadMinutes()||((Number)wakeSummary.get("spreadMinutes")).doubleValue()>parameters.maximumSpreadMinutes()){
    status="INSUFFICIENT_DATA";reason="IRREGULAR_OR_MULTIPLE_REGIMES";
   } else if(!Boolean.TRUE.equals(goal.get("enabled"))||goal.get("preferredWake")==null||goal.get("desiredOpportunityMinutes")==null){status="NOT_READY";reason="OPTIONAL_GOAL_REQUIRED";}
   else if(!timezone.equals(goal.get("timezone"))){status="NOT_READY";reason="GOAL_TIMEZONE_MISMATCH";}
   else {
    int target=timeMinute(goal.get("preferredWake")),low=timeMinute(goal.get("wakeWindowStart")),high=timeMinute(goal.get("wakeWindowEnd"));
    int desired=((Number)goal.get("desiredOpportunityMinutes")).intValue(),current=((Number)wakeSummary.get("minute")).intValue();
    int next=Math.floorMod(current+(int)Math.copySign(Math.min(Math.abs(delta(target,current)),parameters.stepMinutes()),delta(target,current)),1440);
    // Hard wake bounds take precedence over the tentative step.
    if(!inWindow(next,low,high)){status="NOT_READY";reason="STEP_OUTSIDE_HARD_WAKE_WINDOW";}
    else {
     int currentBed=((Number)bedSummary.get("minute")).intValue();int bed=Math.floorMod(currentBed+(int)delta(next,current),1440);
     int opportunity=Math.floorMod(next-bed,1440);var nextDate=end.plusDays(1);
     var wakeLocal=nextDate.atStartOfDay().plusMinutes(next);var bedLocal=nextDate.atStartOfDay().plusMinutes(bed);if(!bedLocal.isBefore(wakeLocal))bedLocal=bedLocal.minusDays(1);
     if(zone.getRules().getValidOffsets(wakeLocal).size()!=1||zone.getRules().getValidOffsets(bedLocal).size()!=1){status="NOT_READY";reason="DST_REQUIRES_MANUAL_REVIEW";}
     else output.put("suggestion",map("bedtime",bedLocal.atZone(zone).toOffsetDateTime().toString(),"wake",wakeLocal.atZone(zone).toOffsetDateTime().toString(),"opportunityMinutes",opportunity,
      "desiredOpportunityMinutes",desired,"remainingOpportunityMinutes",desired-opportunity,"targetWake",goal.get("preferredWake"),"targetBedtime",time(Math.floorMod(target-desired,1440))));
    }
   }
  }
  output.put("status",status);output.put("reasonCodes",List.of(reason));return output;
 }
 static int timeMinute(Object value){var t=LocalTime.parse(Objects.toString(value));return t.getHour()*60+t.getMinute();}
 static String time(int value){return LocalTime.of(value/60,value%60).toString();}
 static boolean inWindow(int value,int low,int high){return low<=high?value>=low&&value<=high:value>=low||value<=high;}
 public static Map<String,Object> validateGoal(Map<String,Object> input){
  boolean enabled=Boolean.TRUE.equals(input.get("enabled"));var result=map("enabled",enabled);
  if(!enabled)return result;
  String zone=ZoneId.of(Objects.toString(input.get("timezone"))).getId();result.put("timezone",zone);
  for(String key:List.of("preferredWake","wakeWindowStart","wakeWindowEnd"))result.put(key,time(timeMinute(input.get(key))));
  if(!inWindow(timeMinute(result.get("preferredWake")),timeMinute(result.get("wakeWindowStart")),timeMinute(result.get("wakeWindowEnd"))))throw new IllegalArgumentException("Wake goal outside window");
  if(input.get("desiredOpportunityMinutes")!=null){long value=number(input.get("desiredOpportunityMinutes"));if(value<60||value>1080)throw new IllegalArgumentException("Invalid opportunity");result.put("desiredOpportunityMinutes",value);}
  return result;
 }
}
