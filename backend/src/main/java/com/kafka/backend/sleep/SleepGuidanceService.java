package com.kafka.backend.sleep;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import java.time.*;
import java.util.*;
import static com.kafka.backend.sleep.SleepService.*;

@Service @Transactional
public class SleepGuidanceService {
 private final SleepService sleep;
 @Value("${app.sleep.guidance.enabled:false}") boolean enabled;
 @Value("${app.sleep.guidance.lookback-days:14}") int lookback=14;
 @Value("${app.sleep.guidance.minimum-nights:7}") int minimum=7;
 @Value("${app.sleep.guidance.step-minutes:15}") int step=15;
 @Value("${app.sleep.guidance.maximum-spread-minutes:180}") int spread=180;
 public SleepGuidanceService(SleepService sleep){this.sleep=sleep;}
 private void requireEnabled(){if(!enabled)throw new SleepError(404,"GUIDANCE_DISABLED","DEV 가이드가 꺼져 있어요. 기존 기록·알림은 계속 사용할 수 있습니다.");}
 @Transactional(readOnly=true) public Map<String,Object> goal(){
  requireEnabled();var rows=sleep.documents("select document from sleep_goals where owner_id=?",sleep.owner());
  return rows.isEmpty()?map("revision",0,"enabled",false):rows.getFirst();
 }
 public Map<String,Object> saveGoal(Map<String,Object> input){
  requireEnabled();sleep.lock();UUID operation=uuid(input.get("operationId"));
  var request=map("route","SLEEP_GOAL","body",input);
  var receipts=sleep.documents("select jsonb_build_object('request',request,'receipt',receipt) from sleep_receipts where owner_id=? and operation_id=?",sleep.owner(),operation);
  if(!receipts.isEmpty()){
   // JSONB key order is canonicalized by PostgreSQL; compare decoded structures.
   if(!sleep.decode(sleep.encode(request)).equals(obj(receipts.getFirst().get("request"))))throw new SleepError(409,"IDEMPOTENCY_KEY_REUSED","원래 목표 요청과 다릅니다.");
   return obj(receipts.getFirst().get("receipt"));
  }
  var current=goal();if(number(input.get("expectedRevision"))!=number(current.get("revision")))throw new SleepError(409,"GOAL_REVISION_CONFLICT","최신 목표와 비교해주세요.");
  var next=SleepGuidancePolicy.validateGoal(input);long revision=number(current.get("revision"))+1;next.put("revision",revision);next.put("updatedAt",sleep.now().toString());
  sleep.dbForGuidance().update("insert into sleep_goals(owner_id,revision,document) values(?,?,?::jsonb) on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now()",sleep.owner(),revision,sleep.encode(next));
  sleep.dbForGuidance().update("insert into sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,?::jsonb,?::jsonb)",sleep.owner(),operation,sleep.encode(request),sleep.encode(next));
  return sleep.decode(sleep.encode(next));
 }
 @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
 public Map<String,Object> guidance(String timezone,Instant at){
  requireEnabled();ZoneId zone=ZoneId.of(timezone);Instant generated=sleep.now();if(at==null)at=generated;
  if(at.isAfter(generated))throw new SleepError(422,"FUTURE_TIME","미래 기준 시각을 사용할 수 없어요.");
  var goal=goal();var result=SleepGuidancePolicy.project(sleep.metricRecords(at),goal,timezone,at,new SleepGuidancePolicy.Parameters(lookback,minimum,step,spread));
  var validThrough=at.atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant();
  result.put("asOf",at.toString());result.put("serverGeneratedAt",generated.toString());result.put("validThrough",validThrough.toString());result.put("factsRevision",sleep.contextRevision());result.put("goalRevision",goal.get("revision"));result.put("timezone",timezone);
  if(generated.isAfter(validThrough)){result.put("status","STALE");result.put("reasonCodes",List.of("EXPIRED_AS_OF"));result.remove("suggestion");}
  result.put("guidanceId",UUID.nameUUIDFromBytes(sleep.encode(map("owner",sleep.owner().toString(),"projection",result)).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString());
  return result;
 }
}
