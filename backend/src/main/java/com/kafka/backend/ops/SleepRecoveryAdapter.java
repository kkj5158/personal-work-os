package com.kafka.backend.ops;

import com.kafka.backend.sleep.SleepService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

/** OPS owns thresholds. No writes to sleep facts, Recovery selection, Calendar or WORK FLOW. */
@Service
public class SleepRecoveryAdapter {
 private final SleepService sleep;
 public SleepRecoveryAdapter(SleepService sleep){this.sleep=sleep;}
 @SuppressWarnings("unchecked") static Map<String,Object> obj(Object value){return value instanceof Map<?,?>?(Map<String,Object>)value:Map.of();}
 static Map<String,Object> map(Object... v){var r=new LinkedHashMap<String,Object>();for(int i=0;i<v.length;i+=2)r.put((String)v[i],v[i+1]);return r;}
 static double num(Object n){return n instanceof Number x?x.doubleValue():0;}
 @Transactional(readOnly=true) public Map<String,Object> context(String timezone,Instant at){
  if(at==null)at=Instant.now();var c=sleep.context(timezone,at);var m=sleep.metrics(7,timezone,at);
  var signals=new ArrayList<Map<String,Object>>();var unavailable=new ArrayList<String>();String signature=c.get("contextRevision")+":sleep-ops-proposal-v0";
  var last=obj(c.get("lastCompleted"));if(last.isEmpty())unavailable.add("SHORT_RECORDED_INTERVAL");
  else if(num(last.get("intervalMinutes"))<360)signals.add(signal("SHORT_RECORDED_INTERVAL",last,signature,at,360,num(last.get("intervalMinutes")),"REPORTED_INTERVAL_ONLY"));
  @SuppressWarnings("unchecked") var days=(List<Map<String,Object>>)m.get("days");
  var completed=days.stream().filter(d->"complete".equals(d.get("quality"))).toList();
  if(completed.size()>=2){var a=completed.get(completed.size()-2);var b=completed.getLast();
   if(LocalDate.parse(a.get("date").toString()).plusDays(1).equals(LocalDate.parse(b.get("date").toString()))&&num(a.get("intervalMinutes"))<360&&num(b.get("intervalMinutes"))<360)
    signals.add(signal("CONSECUTIVE_SHORT_INTERVALS",map("days",List.of(a,b),"sleepContextRevision",c.get("contextRevision")),signature,at,360,null,"REPORTED_INTERVAL_ONLY"));
  }else unavailable.add("CONSECUTIVE_SHORT_INTERVALS");
  for(String e:List.of("bedtime","wake")){var r=obj(m.get(e));String code=e.equals("bedtime")?"BEDTIME_VARIABILITY":"WAKE_VARIABILITY";
   if(!"AVAILABLE".equals(r.get("status")))unavailable.add(code);else if(num(r.get("deviationMinutes"))>60)signals.add(signal(code,r,signature,at,60,num(r.get("deviationMinutes")),"OPERATIONAL_OBSERVATION"));}
  var trend=obj(m.get("trend"));if(!"AVAILABLE".equals(trend.get("status")))unavailable.add("RECENT_INTERVAL_DECLINE");
  else if(num(trend.get("comparisonMinutes"))<=-60)signals.add(signal("RECENT_INTERVAL_DECLINE",trend,signature,at,-60,num(trend.get("comparisonMinutes")),"REPORTED_INTERVAL_ONLY"));
  var quality=new ArrayList<Map<String,Object>>();var coverage=obj(m.get("coverage"));
  if(num(coverage.get("missing"))+num(coverage.get("partial"))+num(coverage.get("unknown"))>0||obj(c.get("activeSession")).get("bedtimeIntentAt")!=null&&
   Instant.parse(obj(c.get("activeSession")).get("bedtimeIntentAt").toString()).isBefore(at.minusSeconds(64800)))
   quality.add(signal("MISSING_SLEEP_DATA",map("coverage",coverage,"sleepContextRevision",c.get("contextRevision")),signature,at,null,null,"DATA_QUALITY_ONLY"));
  return map("schemaVersion","ops.recovery.context.v1","generatedAt",Instant.now().toString(),"asOf",at.toString(),"contextRevision",signature,
   "currentMode",null,"currentLevel",null,"selectionSource","UNAVAILABLE","assessmentStatus","NOT_ASSESSED","availableInputs",List.of("SLEEP"),
   "unavailableInputs",List.of("WORK","CALENDAR","ROUTINE","EXERCISE","USER_REPORT"),"unavailableSignals",unavailable,
   "signals",signals,"dataQualitySignals",quality,"recommendedProtocol",null,"automaticActions",List.of(),"freshness",c.get("freshness"));
 }
 static Map<String,Object> signal(String code,Map<String,Object> evidence,String signature,Instant at,Object threshold,Object actual,String meaning){
  return map("signalId",UUID.nameUUIDFromBytes((signature+":"+code+":"+evidence).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(),
   "ownerScope","AUTHENTICATED_OWNER","signalCode",code,"rulesetVersion","sleep-ops-proposal-v0","generatedAt",at.toString(),
   "inputSignature",signature,"evidence",evidence,"threshold",threshold,"actualValue",actual,"meaning",meaning,"assessmentStatus","NOT_ASSESSED",
   "dataQuality",map("objectiveMeasurement",false),"affectsLevelAutomatically",false);
 }
}
