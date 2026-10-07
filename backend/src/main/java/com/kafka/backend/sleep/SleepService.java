package com.kafka.backend.sleep;

import com.kafka.backend.common.CurrentUserProvider;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.sleep.SleepTime.*;

/** All mutations serialize per authenticated owner. Facts, audit, receipts and invalidations commit together. */
@Service @Transactional
public class SleepService {
 public static final String MEANING="REPORTED_BEDTIME_WAKE_INTERVAL";
 private final JdbcTemplate db;private final CurrentUserProvider users;
 private final ObjectMapper json=new ObjectMapper();private final java.util.function.Supplier<Instant> clock;
 @org.springframework.beans.factory.annotation.Autowired public SleepService(JdbcTemplate db,CurrentUserProvider users){this(db,users,Instant::now);}
 SleepService(JdbcTemplate db,CurrentUserProvider users,java.util.function.Supplier<Instant> clock){this.db=db;this.users=users;this.clock=clock;}
 UUID owner(){return users.getCurrentUserId();}
 Instant now(){return clock.get();}
 static Map<String,Object> map(Object... fields){var m=new LinkedHashMap<String,Object>();for(int i=0;i<fields.length;i+=2)m.put((String)fields[i],fields[i+1]);return m;}
 String encode(Object o){try{return json.writeValueAsString(o);}catch(Exception e){throw new IllegalArgumentException("Invalid JSON",e);}}
 Map<String,Object> decode(String s){try{return json.readValue(s,new TypeReference<LinkedHashMap<String,Object>>(){});}catch(Exception e){throw new IllegalStateException("Invalid stored sleep JSON",e);}}
 @SuppressWarnings("unchecked") static Map<String,Object> obj(Object v){return v instanceof Map<?,?>?(Map<String,Object>)v:new LinkedHashMap<>();}
 static long number(Object v){return v instanceof Number n?n.longValue():Long.parseLong(v.toString());}
 static UUID uuid(Object v){try{return UUID.fromString(Objects.toString(v));}catch(Exception e){throw new SleepError(422,"INVALID_ID","식별자를 확인해주세요.");}}
 static String str(Object v){return v==null?null:v.toString();}
 static boolean yes(Object v){return Boolean.TRUE.equals(v);}
 void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"sleep:"+owner());}
 List<Map<String,Object>> documents(String sql,Object... args){return db.query(sql,(r,n)->decode(r.getString(1)),args);}
 @Transactional(readOnly=true) public Map<String,Object> settings(){
  var rows=documents("select document from sleep_settings where owner_id=?",owner());
  return rows.isEmpty()?map("revision",0,"recordingStartDate",null,"timezoneMode","DEVICE_LOCAL","reminderDeviceId",null,
   "bedtime",map("enabled",false,"localTime","23:00","weekdays",List.of(1,2,3,4,5,6,7),"profile","SILENT"),
   "wake",map("enabled",false,"localTime","07:10","weekdays",List.of(1,2,3,4,5,6,7),"profile","VIBRATION")):rows.getFirst();
 }
 void ensureSettings(ZoneId z){
  if(number(settings().get("revision"))==0){var s=settings();s.put("revision",1);s.put("recordingStartDate",now().atZone(z).toLocalDate().toString());
   db.update("insert into sleep_settings(owner_id,revision,document) values(?,1,?::jsonb)",owner(),encode(s));}
 }
 @Transactional(readOnly=true) public Map<String,Object> session(UUID id){
  var rows=documents("select document from sleep_sessions where owner_id=? and id=?",owner(),id);
  if(rows.isEmpty())throw new SleepError(404,"NOT_FOUND","기록을 찾을 수 없어요.");return rows.getFirst();
 }
 @Transactional(readOnly=true) public Map<String,Object> active(){
  var rows=documents("select document from sleep_sessions where owner_id=? and status='OPEN' and excluded_at is null",owner());
  return rows.isEmpty()?null:rows.getFirst();
 }
 @Transactional(readOnly=true) public Map<String,Object> history(String from,String to,String cursor,int limit,boolean excluded){
  limit=Math.max(1,Math.min(limit,100));LocalDate a=from==null?LocalDate.of(2000,1,1):LocalDate.parse(from),b=to==null?LocalDate.of(2200,1,1):LocalDate.parse(to);
  if(a.isAfter(b))throw new SleepError(422,"INVALID_RANGE","기간을 확인해주세요.");
  var args=new ArrayList<Object>(List.of(owner(),a,b));String after="";
  if(cursor!=null){String[] parts=cursor.split("\\|",2);if(parts.length!=2)throw new SleepError(422,"INVALID_CURSOR","다시 조회해주세요.");
   after=" and (coalesce(logical_wake_date,expected_wake_date),id)<(?,?)";args.add(LocalDate.parse(parts[0]));args.add(uuid(parts[1]));}
  args.add(limit+1);
  var rows=documents("select document from sleep_sessions where owner_id=? and coalesce(logical_wake_date,expected_wake_date) between ? and ?"+
   (excluded?"":" and excluded_at is null")+after+" order by coalesce(logical_wake_date,expected_wake_date) desc,id desc limit ?",args.toArray());
  boolean more=rows.size()>limit;if(more)rows.removeLast();var last=rows.isEmpty()?null:rows.getLast();
  return map("items",rows,"nextCursor",more?Objects.toString(last.get("logicalWakeDate"),str(last.get("expectedWakeDate")))+"|"+last.get("id"):null);
 }
 @Transactional(readOnly=true) public Map<String,Object> events(UUID id,String cursor,int limit){
  session(id);long before=cursor==null?Long.MAX_VALUE:Long.parseLong(cursor);limit=Math.max(1,Math.min(limit,100));
  var rows=documents("select document from sleep_events where owner_id=? and session_id=? and new_revision<? order by new_revision desc limit ?",owner(),id,before,limit+1);
  boolean more=rows.size()>limit;if(more)rows.removeLast();
  return map("items",rows,"nextCursor",more?str(rows.getLast().get("newRevision")):null);
 }
 Map<String,Object> cycle(LocalDate day,ZoneId z,boolean persist){
  var stored=documents("select document from sleep_cycles where owner_id=? and expected_wake_date=? order by settings_revision limit 1",owner(),day);
  if(!stored.isEmpty())return stored.getFirst();return constructCycle(day,z,settings(),persist);
 }
 Map<String,Object> constructCycle(LocalDate day,ZoneId z,Map<String,Object> s,boolean persist){var wake=LocalTime.parse(str(obj(s.get("wake")).get("localTime")));
  var bed=LocalTime.parse(str(obj(s.get("bedtime")).get("localTime")));var wakeAt=day.atTime(wake).atZone(z);
  var bedAt=day.atTime(bed).atZone(z);if(!bedAt.isBefore(wakeAt))bedAt=day.minusDays(1).atTime(bed).atZone(z);
  var c=map("cycleId",owner()+":"+s.get("revision")+":"+day,"expectedWakeDate",day.toString(),"timezone",z.getId(),
   "settingsRevision",s.get("revision"),"bedtimeDueAt",bedAt.toInstant().toString(),"wakeDueAt",wakeAt.toInstant().toString(),
   "bedtime",s.get("bedtime"),"wake",s.get("wake"));
  if(persist)db.update("insert into sleep_cycles(owner_id,cycle_id,expected_wake_date,timezone,settings_revision,document) values(?,?,?,?,?,?::jsonb) on conflict do nothing",
   owner(),c.get("cycleId"),day,z.getId(),number(s.get("revision")),encode(c));return c;
 }
 List<Map<String,Object>> pending(Map<String,Object> c,Instant at,boolean persist){
  String id=str(c.get("cycleId"));var records=documents("select document from sleep_sessions where owner_id=? and cycle_id=? and excluded_at is null",owner(),id);
  var stored=documents("select document from sleep_pending where owner_id=? and cycle_id=?",owner(),id);
  return projectPending(c,at,persist,records,stored);
 }
 List<Map<String,Object>> projectPending(Map<String,Object> c,Instant at,boolean persist,List<Map<String,Object>> allRecords,List<Map<String,Object>> allPending){
  String id=str(c.get("cycleId"));var records=allRecords.stream().filter(r->id.equals(r.get("cycleId"))&&r.get("excludedAt")==null).toList();
  var result=new ArrayList<Map<String,Object>>();
  for(String endpoint:List.of("bedtime","wake")){
   String kind=endpoint.equals("bedtime")?"BEDTIME_REQUIRED":"WAKE_REQUIRED",occ=id+":"+kind,field=endpoint.equals("bedtime")?"bedtimeIntentAt":"wakeAt";
   Instant due=instant(c.get(endpoint+"DueAt"));if(at.isBefore(due))continue;
   var stored=allPending.stream().filter(p->occ.equals(p.get("occurrenceId"))).toList();
   var p=stored.isEmpty()?map("occurrenceId",occ,"cycleId",id,"kind",kind,"dueAt",due.toString(),"status","DUE","revision",0,
    "expectedWakeDate",c.get("expectedWakeDate"),"relatedSessionId",null,"alertsStopped",false,"snoozeUntil",null):stored.getFirst();
   var known=records.stream().filter(r->r.get(field)!=null).findFirst();
   var unknown=records.stream().filter(r->"UNKNOWN".equals(r.get(endpoint+"Certainty"))).findFirst();
   if(known.isPresent()){p.put("status","RESOLVED");p.put("relatedSessionId",known.get().get("id"));}
   else if(unknown.isPresent()){p.put("status","ACKNOWLEDGED_UNKNOWN");p.put("relatedSessionId",unknown.get().get("id"));}
   else if(p.get("relatedSessionId")!=null){p.put("status","DUE");p.put("relatedSessionId",null);p.put("resolvedByEventId",null);}
   if(persist)db.update("insert into sleep_pending(owner_id,occurrence_id,cycle_id,document) values(?,?,?,?::jsonb) on conflict(owner_id,occurrence_id) do update set document=excluded.document",owner(),occ,id,encode(p));
   if(!"RESOLVED".equals(p.get("status")))result.add(p);
  }return result;
 }
 List<Map<String,Object>> due(ZoneId z,Instant at,boolean persist){
  var s=settings();if(s.get("recordingStartDate")==null)return List.of();
  LocalDate first=LocalDate.parse(str(s.get("recordingStartDate"))),end=at.atZone(z).toLocalDate().plusDays(1);
  var result=new ArrayList<Map<String,Object>>();
  var cycles=documents("select document from sleep_cycles where owner_id=? order by settings_revision",owner());
  var records=documents("select document from sleep_sessions where owner_id=?",owner());
  var requirements=documents("select document from sleep_pending where owner_id=?",owner());
  // Older materialized requirements remain in the DB; bounded query projection avoids unbounded first-open scans.
  LocalDate scan=first.isBefore(end.minusDays(366))?end.minusDays(366):first;
  for(LocalDate d=scan;!d.isAfter(end);d=d.plusDays(1)){
   final String day=d.toString();var c=cycles.stream().filter(x->day.equals(x.get("expectedWakeDate"))).findFirst().orElse(null);
   if(c==null)c=constructCycle(d,z,s,persist);result.addAll(projectPending(c,at,persist,records,requirements));
  }
  result.sort(Comparator.comparing(p->str(p.get("dueAt"))));return result;
 }
 @Transactional(readOnly=true) public String contextRevision(){
  var rows=db.queryForList("select revision from sleep_context_revisions where owner_id=?",Long.class,owner());return "sleep-r"+(rows.isEmpty()?0:rows.getFirst());
 }
 @Transactional(readOnly=true) public Map<String,Object> today(String timezone){
  var z=zone(timezone);var a=active();var all=documents("select document from sleep_sessions where owner_id=? and status='CLOSED' and excluded_at is null order by wake_at desc limit 1",owner());
  var p=due(z,now(),false);var c=cycle(anchor(now(),z,LocalTime.parse(str(obj(settings().get("wake")).get("localTime"))),true),z,false);
  return map("deletedSessionIds",db.queryForList("select session_id::text from sleep_tombstones where owner_id=?",String.class,owner()),"ownerId",owner().toString(),"serverNow",now().toString(),"activeSession",a,"pendingActions",p,
   "lastClosed",all.isEmpty()?null:all.getFirst(),"contextRevision",contextRevision(),"currentCycle",c,
   "staleOpen",a!=null&&instant(a.get("bedtimeIntentAt")).isBefore(now().minusSeconds(64800)),"settings",settings());
 }
 void version(Map<String,Object> s,Object expected){
  if(expected==null||number(expected)!=number(s.get("revision")))throw new SleepError(409,"REVISION_CONFLICT","다른 기기에서 이 기록을 수정했어요.",
   "serverSnapshot",s,"serverRevision",s.get("revision"),"draftAccepted",false,"conflictingFields",List.of("bedtimeIntentAt","wakeAt"));
 }
 Map<String,Object> fresh(UUID id,Map<String,Object> cycle){
  return map("id",id.toString(),"cycleId",cycle.get("cycleId"),"expectedWakeDate",cycle.get("expectedWakeDate"),"revision",0,
   "bedtimeIntentAt",null,"wakeAt",null,"logicalWakeDate",null,"status","INCOMPLETE","corrected",false,
   "bedtimeCertainty",null,"wakeCertainty",null,"excludedAt",null,"intervalMinutes",null,"metricMeaning",MEANING);
 }
 void endpoint(Map<String,Object> s,String endpoint,Object value,Object timezone,Object certainty,Map<String,Object> a){
  String field=endpoint.equals("bedtime")?"bedtimeIntentAt":"wakeAt";Instant at=instant(value);ZoneId z=zone(timezone==null?a.get("timezone"):timezone);
  s.put(field,at==null?null:at.toString());s.put(endpoint+"Timezone",z.getId());
  s.put(endpoint+"OffsetMinutes",at==null?null:z.getRules().getOffset(at).getTotalSeconds()/60);
  s.put(endpoint+"Certainty",at==null?"UNKNOWN":Objects.toString(certainty,"RECALLED"));
  s.put(endpoint+"MissingReason",at==null?"UNKNOWN":null);s.put(endpoint+"Source","REPORTED_NOW".equals(certainty)?"USER_TAP":"USER_MANUAL");
  s.put(endpoint+"EntryPoint",a.get("entryPoint"));
  if(!s.containsKey(endpoint+"RecordedAt"))s.put(endpoint+"RecordedAt",a.get("capturedAt"));
 }
 void normalize(Map<String,Object> s,boolean open,boolean confirmed){
  Instant b=instant(s.get("bedtimeIntentAt")),w=instant(s.get("wakeAt"));validate(b,w,now(),confirmed);
  s.put("status",b!=null&&w!=null?"CLOSED":open&&b!=null&&w==null?"OPEN":"INCOMPLETE");
  s.put("logicalWakeDate",w==null?null:w.atZone(zone(s.get("wakeTimezone"))).toLocalDate().toString());
  s.put("logicalDateTimezone",w==null?null:s.get("wakeTimezone"));s.put("intervalMinutes",b==null||w==null?null:Duration.between(b,w).toMillis()/60000.0);
 }
 void collisions(Map<String,Object> s){
  if(s.get("excludedAt")!=null)return;
  for(var other:documents("select document from sleep_sessions where owner_id=? and id<>? and excluded_at is null",owner(),uuid(s.get("id")))){
   String code=null;
   if("OPEN".equals(s.get("status"))&&"OPEN".equals(other.get("status")))code="ACTIVE_SESSION_EXISTS";
   if(s.get("logicalWakeDate")!=null&&s.get("logicalWakeDate").equals(other.get("logicalWakeDate")))code="LOGICAL_DAY_COLLISION";
   Instant b=instant(s.get("bedtimeIntentAt")),w=instant(s.get("wakeAt")),ob=instant(other.get("bedtimeIntentAt")),ow=instant(other.get("wakeAt"));
   if(b!=null&&ob!=null&&(w!=null||"OPEN".equals(s.get("status")))&&(ow!=null||"OPEN".equals(other.get("status")))&&
    (w==null||ob.isBefore(w))&&(ow==null||b.isBefore(ow)))code="SESSION_OVERLAP";
   if(code!=null)throw new SleepError(409,code,"기록을 비교하고 시각 또는 집계 제외 여부를 확인해주세요.","serverSnapshot",other,"serverRevision",other.get("revision"),"draftAccepted",false);
  }
 }
 void save(Map<String,Object> s){
  collisions(s);db.update("""
   insert into sleep_sessions(id,owner_id,cycle_id,status,bedtime_at,wake_at,logical_wake_date,expected_wake_date,excluded_at,revision,document)
   values(?,?,?,?,?,?,?,?,?,?,?::jsonb) on conflict(id) do update set status=excluded.status,bedtime_at=excluded.bedtime_at,
   wake_at=excluded.wake_at,logical_wake_date=excluded.logical_wake_date,excluded_at=excluded.excluded_at,
   revision=excluded.revision,document=excluded.document,updated_at=now()
   """,uuid(s.get("id")),owner(),s.get("cycleId"),s.get("status"),ts(s.get("bedtimeIntentAt")),ts(s.get("wakeAt")),
   s.get("logicalWakeDate")==null?null:LocalDate.parse(str(s.get("logicalWakeDate"))),LocalDate.parse(str(s.get("expectedWakeDate"))),
   ts(s.get("excludedAt")),number(s.get("revision")),encode(s));
 }
 static Timestamp ts(Object v){return v==null?null:Timestamp.from(instant(v));}
 Map<String,Object> audit(Map<String,Object> s,Map<String,Object> before,Map<String,Object> a){
  s.put("revision",number(s.get("revision"))+1);s.put("updatedAt",now().toString());s.put("serverReceivedAt",now().toString());
  save(s);UUID eid=UUID.randomUUID();var event=map("eventId",eid.toString(),"sessionId",s.get("id"),"operationId",a.get("operationId"),
   "actionType",a.get("actionType"),"previousRevision",before.getOrDefault("revision",0),"newRevision",s.get("revision"),
   "before",before,"after",new LinkedHashMap<>(s),"clientCapturedAt",a.get("capturedAt"),"serverCommittedAt",now().toString(),
   "deviceId",a.get("deviceId"),"entryPoint",a.get("entryPoint"),"correctionReason",obj(a.get("payload")).get("reason"));
  db.update("insert into sleep_events(event_id,owner_id,session_id,operation_id,previous_revision,new_revision,document) values(?,?,?,?,?,?,?::jsonb)",
   eid,owner(),uuid(s.get("id")),uuid(a.get("operationId")),number(event.get("previousRevision")),number(s.get("revision")),encode(event));
  var dates=new LinkedHashSet<String>();for(var r:List.of(before,s))for(String f:List.of("logicalWakeDate","expectedWakeDate"))if(r.get(f)!=null)dates.add(str(r.get(f)));
  invalidate(dates);return event;
 }
 void invalidate(Collection<String> dates){
  db.update("""
   insert into sleep_context_revisions(owner_id,revision,changed_dates) values(?,1,?::jsonb)
   on conflict(owner_id) do update set revision=sleep_context_revisions.revision+1,changed_dates=excluded.changed_dates,updated_at=now()
   """,owner(),encode(dates));
 }
 String requestHash(Map<String,Object> request){
  try{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(
   json.writer(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsBytes(request)));}
  catch(Exception e){throw new IllegalStateException(e);}
 }
 Map<String,Object> deleteFact(Map<String,Object> s,Map<String,Object> a){
  UUID id=uuid(s.get("id"));long revision=number(s.get("revision"))+1;
  // Scrub old wire/response snapshots while preserving receipt-first exact replay.
  for(var row:db.queryForList("select operation_id,request::text,receipt::text from sleep_receipts where owner_id=? and (request::text like ? or receipt::text like ?)",owner(),"%"+id+"%","%"+id+"%")){
   var oldRequest=decode(str(row.get("request")));var old=decode(str(row.get("receipt")));
   var minimal=map("operationId",row.get("operation_id").toString(),"sessionId",old.get("sessionId"),"newRevision",old.get("newRevision"),"eventId",old.get("eventId"),"deleted",true);
   db.update("update sleep_receipts set request=?::jsonb,receipt=?::jsonb where owner_id=? and operation_id=?",
    encode(map("redactedRequestHash",oldRequest.getOrDefault("redactedRequestHash",requestHash(oldRequest)))),encode(minimal),owner(),row.get("operation_id"));
  }
  db.update("update sleep_pending set document=document-'relatedSessionId'-'resolvedByEventId' || '{\"status\":\"DUE\"}'::jsonb where owner_id=? and document->>'relatedSessionId'=?",owner(),id.toString());
  db.update("delete from sleep_sessions where owner_id=? and id=?",owner(),id);
  db.update("insert into sleep_tombstones(owner_id,session_id,revision,operation_id) values(?,?,?,?)",owner(),id,revision,uuid(a.get("operationId")));
  var dates=new LinkedHashSet<String>();for(String f:List.of("logicalWakeDate","expectedWakeDate"))if(s.get(f)!=null)dates.add(str(s.get(f)));invalidate(dates);
  return map("id",id.toString(),"revision",revision,"deleted",true);
 }
 public Map<String,Object> action(Map<String,Object> a){
  lock();UUID op=uuid(a.get("operationId"));String request=encode(a);
  var replay=db.queryForList("select request::text,receipt::text from sleep_receipts where owner_id=? and operation_id=?",owner(),op);
  if(!replay.isEmpty()){var row=replay.getFirst();var previous=decode(str(row.get("request")));if(!(previous.containsKey("redactedRequestHash")?previous.get("redactedRequestHash").equals(requestHash(a)):previous.equals(a)))throw new SleepError(409,"IDEMPOTENCY_KEY_REUSED","같은 요청 식별자로 다른 내용을 보낼 수 없어요.");return decode(str(row.get("receipt")));}
  String type=str(a.get("actionType"));var p=obj(a.get("payload"));ZoneId z=zone(a.get("timezone"));Instant captured=instant(a.get("capturedAt"));
  if(captured==null||a.get("offsetMinutes")==null||str(a.get("deviceId"))==null||str(a.get("deviceId")).isBlank())throw new SleepError(422,"INVALID_ACTION","입력 정보를 확인해주세요.");
  offset(captured,z,(int)number(a.get("offsetMinutes")));
  if(!Set.of("HOME","NOTIFICATION","WIDGET","SHORTCUT","HISTORY_EDIT").contains(str(a.get("entryPoint"))))throw new SleepError(422,"INVALID_ACTION","입력 경로를 확인해주세요.");
  if(a.get("dependsOnOperationId")!=null&&db.queryForObject("select count(*) from sleep_receipts where owner_id=? and operation_id=?",Long.class,owner(),uuid(a.get("dependsOnOperationId")))==0)throw new SleepError(409,"DEPENDENCY_PENDING","앞선 기록을 먼저 전송해주세요.");
  if(a.get("sessionId")!=null&&db.queryForObject("select count(*) from sleep_sessions where id=? and owner_id<>?",Long.class,uuid(a.get("sessionId")),owner())>0)throw new SleepError(404,"NOT_FOUND","기록을 찾을 수 없어요.");
  ensureSettings(z);
  Map<String,Object> s=null,event=null;
  if(Set.of("SNOOZE_REMINDER","STOP_ALERTS_TODAY").contains(type)||(type.equals("MARK_TIME_UNKNOWN")&&a.get("sessionId")==null)){
   var candidates=due(z,now(),true);String occurrence=str(a.get("occurrenceId"));
   var target=candidates.stream().filter(x->Objects.equals(occurrence,x.get("occurrenceId"))&&Objects.equals(a.get("cycleId"),x.get("cycleId"))).findFirst().orElseThrow(()->new SleepError(404,"NOT_FOUND","알림 요구를 다시 확인해주세요."));
   if(type.equals("STOP_ALERTS_TODAY"))target.put("alertsStopped",true);
   else if(type.equals("SNOOZE_REMINDER")){long delay=number(p.getOrDefault("delayMinutes",10));if(delay<1||delay>40)throw new SleepError(422,"INVALID_SNOOZE","재알림 간격을 확인해주세요.");target.put("snoozeUntil",now().plusSeconds(delay*60).toString());}
   else {target.put("status","ACKNOWLEDGED_UNKNOWN");target.put("acknowledgedReason",p.getOrDefault("reason","UNKNOWN"));}
   target.put("revision",number(target.get("revision"))+1);
   db.update("update sleep_pending set document=?::jsonb where owner_id=? and occurrence_id=?",encode(target),owner(),occurrence);
   invalidate(List.of(str(target.get("expectedWakeDate"))));
  }else{
   UUID id=uuid(a.get("sessionId"));var existing=documents("select document from sleep_sessions where owner_id=? and id=?",owner(),id);
   if(existing.isEmpty()){
    if(db.queryForObject("select count(*) from sleep_tombstones where session_id=?",Long.class,id)>0)throw new SleepError(409,"SESSION_DELETED","삭제된 기록입니다. 내 입력을 확인해주세요.","serverSnapshot",map("id",id.toString(),"deleted",true),"draftAccepted",false);
    if(db.queryForObject("select count(*) from sleep_sessions where id=?",Long.class,id)>0)throw new SleepError(404,"NOT_FOUND","기록을 찾을 수 없어요.");
    if(!Set.of("CAPTURE_BEDTIME","CAPTURE_WAKE","CORRECT_SESSION","START_NEW_AFTER_UNRESOLVED").contains(type))throw new SleepError(404,"NOT_FOUND","기록을 찾을 수 없어요.");
    if(a.get("expectedRevision")==null||number(a.get("expectedRevision"))!=0)throw new SleepError(409,"REVISION_CONFLICT","새 기록 revision은 0이어야 합니다.");
    var act=active();if(act!=null&&!type.equals("START_NEW_AFTER_UNRESOLVED"))throw new SleepError(409,"ACTIVE_SESSION_EXISTS","진행 중인 기록을 먼저 확인해주세요.","serverSnapshot",act,"serverRevision",act.get("revision"));
    LocalTime wake=LocalTime.parse(str(obj(settings().get("wake")).get("localTime")));
    var fields=obj(p.get("fields"));boolean manualWake=type.equals("CORRECT_SESSION")&&fields.get("wakeAt")!=null;
    Instant intent=instant(manualWake?fields.get("wakeAt"):p.getOrDefault("bedtimeIntentAt",p.getOrDefault("wakeAt",fields.getOrDefault("bedtimeIntentAt",captured.toString()))));
    ZoneId cycleZone=manualWake?zone(obj(p.get("fieldTimezones")).getOrDefault("wakeAt",z.getId())):z;
    var day=manualWake?intent.atZone(cycleZone).toLocalDate():anchor(intent,cycleZone,wake,!type.equals("CAPTURE_WAKE"));
    var c=cycle(day,cycleZone,true);s=fresh(id,c);
   }else{s=existing.getFirst();version(s,a.get("expectedRevision"));}
   var before=new LinkedHashMap<>(s);boolean open="OPEN".equals(s.get("status"));
   boolean removed=false;
   switch(type){
    case "DELETE_SESSION" -> {s=deleteFact(s,a);removed=true;}
    case "CAPTURE_BEDTIME" -> {if(!existing.isEmpty()&&!open)throw new SleepError(409,"SESSION_NOT_ACTIVE","완료 기록은 수정 화면에서 변경해주세요.");
     if(open&&instant(s.get("bedtimeIntentAt")).isBefore(captured.minusSeconds(64800)))throw new SleepError(409,"STALE_OPEN","지난 기록 보완 또는 새 취침을 선택해주세요.","serverSnapshot",s);
     endpoint(s,"bedtime",p.getOrDefault("bedtimeIntentAt",captured.toString()),p.get("bedtimeTimezone"),"REPORTED_NOW",a);open=true;}
    case "CAPTURE_WAKE" -> {if(existing.isEmpty()&&!yes(p.get("createWakeOnly")))throw new SleepError(422,"WAKE_ONLY_CONFIRMATION_REQUIRED","취침 없는 기상 기록임을 선택해주세요.");
     if(!existing.isEmpty()&&!open)throw new SleepError(409,"SESSION_NOT_ACTIVE","기상 대상 기록을 다시 확인해주세요.","serverSnapshot",s);
     endpoint(s,"wake",p.getOrDefault("wakeAt",captured.toString()),p.get("wakeTimezone"),"REPORTED_NOW",a);open=false;}
    case "CORRECT_SESSION" -> {var fields=obj(p.get("fields"));if(fields.isEmpty())throw new SleepError(422,"INVALID_ACTION","수정할 시각을 입력해주세요.");
     for(String e:List.of("bedtime","wake")){String field=e.equals("bedtime")?"bedtimeIntentAt":"wakeAt";if(fields.containsKey(field))endpoint(s,e,fields.get(field),obj(p.get("fieldTimezones")).get(field),obj(p.get("fieldCertainties")).getOrDefault(field,"RECALLED"),a);}
     if(s.get("bedtimeIntentAt")==null&&s.get("wakeAt")==null)throw new SleepError(422,"NO_KNOWN_TIME","둘 다 모르면 기록 불가를 선택해주세요.");s.put("corrected",true);}
    case "MARK_TIME_UNKNOWN" -> {String e=str(p.get("endpoint"));if(!Set.of("bedtime","wake").contains(e))throw new SleepError(422,"INVALID_ENDPOINT","보완할 시각을 선택해주세요.");endpoint(s,e,null,z.getId(),"UNKNOWN",a);if(e.equals("wake"))open=false;s.put("corrected",true);}
    case "EXCLUDE_SESSION" -> {s.put("excludedAt",now().toString());s.put("excludeReason",p.get("reason"));}
    case "RESTORE_SESSION" -> s.put("excludedAt",null);
    case "UNDO_EVENT" -> {
     var target=documents("select document from sleep_events where owner_id=? and session_id=? and event_id=?",owner(),id,uuid(p.get("targetEventId")));
     if(target.isEmpty())throw new SleepError(404,"NOT_FOUND","변경 이력을 찾을 수 없어요.");var t=target.getFirst();
     if(number(t.get("newRevision"))!=number(s.get("revision")))throw new SleepError(409,"REVISION_CONFLICT","후속 변경이 있어 자동으로 되돌릴 수 없어요.","serverSnapshot",s);
     var old=obj(t.get("before"));long revision=number(s.get("revision"));s=new LinkedHashMap<>(old);s.put("revision",revision);
     if("START_NEW_AFTER_UNRESOLVED".equals(t.get("actionType"))){
      var priorEvents=documents("select document from sleep_events where owner_id=? and operation_id=? and session_id<>?",owner(),uuid(t.get("operationId")),id);
      if(priorEvents.size()!=1)throw new SleepError(409,"INVERSE_UNAVAILABLE","이 전환을 되돌릴 수 없어요.");
      var pe=priorEvents.getFirst();var prior=session(uuid(pe.get("sessionId")));version(prior,pe.get("newRevision"));
      s=deleteFact(before,a);removed=true;
      var restored=new LinkedHashMap<>(obj(pe.get("before")));restored.put("revision",prior.get("revision"));audit(restored,prior,a);
     }else if(number(old.get("revision"))==0){s=deleteFact(before,a);removed=true;}
     open="OPEN".equals(s.get("status"));
    }
    case "START_NEW_AFTER_UNRESOLVED" -> {
     if(!existing.isEmpty())throw new SleepError(409,"SESSION_EXISTS","새 기록 식별자를 사용해주세요.");
     var prior=session(uuid(p.get("priorSessionId")));version(prior,p.get("priorExpectedRevision"));
     if(!"OPEN".equals(prior.get("status")))throw new SleepError(409,"SESSION_NOT_ACTIVE","지난 활성 기록을 확인해주세요.");
     var pb=new LinkedHashMap<>(prior);normalize(prior,false,true);audit(prior,pb,a);
     endpoint(s,"bedtime",p.getOrDefault("bedtimeIntentAt",captured.toString()),p.get("bedtimeTimezone"),"REPORTED_NOW",a);open=true;
    }
    default -> throw new SleepError(422,"INVALID_ACTION","지원하지 않는 액션입니다.");
   }
   if(!removed){normalize(s,open,yes(p.get("confirmLongInterval"))||type.equals("UNDO_EVENT"));event=audit(s,before,a);}
  }
  var pending=due(z,now(),true);
  if(event!=null)db.update("update sleep_pending set document=jsonb_set(document,'{resolvedByEventId}',to_jsonb(?::text)) where owner_id=? and document->>'relatedSessionId'=? and document->>'status'='RESOLVED'",event.get("eventId"),owner(),s.get("id"));
  var receipt=map("operationId",op.toString(),"eventId",event==null?null:event.get("eventId"),"sessionId",s==null?null:s.get("id"),"session",s,"deleted",s!=null&&yes(s.get("deleted")),
   "newRevision",s==null?null:s.get("revision"),"pendingActions",pending,"contextRevision",contextRevision(),"serverCommittedAt",now().toString());
  db.update("insert into sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,?::jsonb,?::jsonb)",owner(),op,request,encode(receipt));return decode(encode(receipt));
 }
 public Map<String,Object> saveSettings(Map<String,Object> input,String timezone){
  lock();UUID op=input.get("operationId")==null?null:uuid(input.get("operationId"));
  if(op!=null){var rows=db.queryForList("select request::text,receipt::text from sleep_receipts where owner_id=? and operation_id=?",owner(),op);
   if(!rows.isEmpty()){if(!decode(str(rows.getFirst().get("request"))).equals(decode(encode(input))))throw new SleepError(409,"IDEMPOTENCY_KEY_REUSED","요청 식별자를 확인해주세요.");return decode(str(rows.getFirst().get("receipt")));}}
  var s=settings();version(s,input.get("expectedRevision"));ZoneId z=zone(timezone);
  if(number(s.get("revision"))>0){LocalDate d=now().atZone(z).toLocalDate();cycle(d,z,true);cycle(d.plusDays(1),z,true);}
  for(String e:List.of("bedtime","wake"))if(input.containsKey(e)){
   var next=new LinkedHashMap<>(obj(s.get(e)));next.putAll(obj(input.get(e)));LocalTime.parse(str(next.get("localTime")));
   if(!Set.of("SOUND_VIBRATION","SOUND","VIBRATION","SILENT").contains(str(next.get("profile"))))throw new SleepError(422,"INVALID_PROFILE","알림 방식을 선택해주세요.");
   if(!(next.get("weekdays") instanceof List<?> days)||days.stream().anyMatch(v->number(v)<1||number(v)>7))throw new SleepError(422,"INVALID_WEEKDAYS","요일을 확인해주세요.");s.put(e,next);
  }
  if(Objects.equals(obj(s.get("bedtime")).get("localTime"),obj(s.get("wake")).get("localTime")))throw new SleepError(422,"SAME_REMINDER_TIME","취침과 기상 알림 시각을 다르게 선택해주세요.");
  s.put("revision",number(s.get("revision"))+1);if(s.get("recordingStartDate")==null)s.put("recordingStartDate",now().atZone(z).toLocalDate().toString());
  db.update("insert into sleep_settings(owner_id,revision,document) values(?,?,?::jsonb) on conflict(owner_id) do update set revision=excluded.revision,document=excluded.document,updated_at=now()",owner(),number(s.get("revision")),encode(s));
  for(var c:documents("select document from sleep_cycles where owner_id=?",owner())){
   var next=constructCycle(LocalDate.parse(str(c.get("expectedWakeDate"))),zone(c.get("timezone")),s,false);
   for(String e:List.of("bedtime","wake"))if(instant(c.get(e+"DueAt")).isAfter(now())){c.put(e,s.get(e));c.put(e+"DueAt",next.get(e+"DueAt"));}
   db.update("update sleep_cycles set document=?::jsonb where owner_id=? and cycle_id=?",encode(c),owner(),c.get("cycleId"));
  }
  invalidate(List.of(now().atZone(z).toLocalDate().toString()));
  var receipt=map("settings",s,"appliesTo","FUTURE_UNSTARTED_OCCURRENCES","activeSession",active());
  if(op!=null)db.update("insert into sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,?::jsonb,?::jsonb)",owner(),op,encode(input),encode(receipt));return decode(encode(receipt));
 }
 public Map<String,Object> reminderDevice(Map<String,Object> input,String timezone){
  lock();UUID op=uuid(input.get("operationId"));var old=db.queryForList("select request::text,receipt::text from sleep_receipts where owner_id=? and operation_id=?",owner(),op);
  if(!old.isEmpty()){if(!decode(str(old.getFirst().get("request"))).equals(input))throw new SleepError(409,"IDEMPOTENCY_KEY_REUSED","요청 식별자를 확인해주세요.");return decode(str(old.getFirst().get("receipt")));}
  var s=settings();version(s,input.get("expectedRevision"));ensureSettings(zone(timezone));s=settings();
  if(str(input.get("deviceId"))==null||str(input.get("deviceId")).isBlank())throw new SleepError(422,"INVALID_DEVICE","기기를 확인해주세요.");
  s.put("reminderDeviceId",input.get("deviceId"));s.put("revision",number(s.get("revision"))+1);
  db.update("update sleep_settings set document=?::jsonb,revision=?,updated_at=now() where owner_id=?",encode(s),number(s.get("revision")),owner());
  var receipt=map("settings",s,"previousDeviceCancellation","ON_NEXT_SYNC","offlinePreviousDeviceMayDeliver",true);
  db.update("insert into sleep_receipts(owner_id,operation_id,request,receipt) values(?,?,?::jsonb,?::jsonb)",owner(),op,encode(input),encode(receipt));return receipt;
 }
 @Transactional(readOnly=true) public List<Map<String,Object>> metricRecords(Instant at){
  return documents("select snapshot from (select distinct on (session_id) document->'after' as snapshot from sleep_events where owner_id=? and (document->>'serverCommittedAt')::timestamptz<=? order by session_id,new_revision desc) e order by coalesce(snapshot->>'logicalWakeDate',snapshot->>'expectedWakeDate') desc",owner(),Timestamp.from(at));
 }
 @Transactional(readOnly=true) public Map<String,Object> metrics(int window,String timezone,Instant at){
  if(window!=7&&window!=30)throw new SleepError(422,"INVALID_WINDOW","7일 또는 30일을 선택해주세요.");
  if(at==null)at=now();if(at.isAfter(now().plusSeconds(300)))throw new SleepError(422,"FUTURE_TIME","조회 기준 시각을 확인해주세요.");
  ZoneId z=zone(timezone);LocalDate end=at.atZone(z).toLocalDate(),start=end.minusDays(window-1);
  var records=metricRecords(at);var b=new ArrayList<Instant>();var w=new ArrayList<Instant>();var bz=new ArrayList<String>();var wz=new ArrayList<String>();var complete=new ArrayList<Map<String,Object>>();
  for(var r:records){LocalDate date=LocalDate.parse(Objects.toString(r.get("logicalWakeDate"),str(r.get("expectedWakeDate"))));if(date.isBefore(start)||date.isAfter(end)||r.get("excludedAt")!=null)continue;
   if(r.get("bedtimeIntentAt")!=null){b.add(instant(r.get("bedtimeIntentAt")));bz.add(str(r.get("bedtimeTimezone")));}
   if(r.get("wakeAt")!=null){w.add(instant(r.get("wakeAt")));wz.add(str(r.get("wakeTimezone")));}
   if("CLOSED".equals(r.get("status")))complete.add(r);
  }
  var coverage=map("expectedDays",0,"complete",0,"partial",0,"missing",0,"unknown",0,"excluded",0,"currentPendingDays",0);
  var days=new ArrayList<Map<String,Object>>();var settings=settings();LocalDate tracking=settings.get("recordingStartDate")==null?end.plusDays(1):LocalDate.parse(str(settings.get("recordingStartDate")));
  var cycles=documents("select document from sleep_cycles where owner_id=? order by settings_revision",owner());
  var requirements=documents("select document from sleep_pending where owner_id=?",owner());
  for(LocalDate d=start;!d.isAfter(end);d=d.plusDays(1)){
   final String day=d.toString();var r=records.stream().filter(x->day.equals(Objects.toString(x.get("logicalWakeDate"),str(x.get("expectedWakeDate"))))).sorted(Comparator.comparing(x->x.get("excludedAt")!=null)).findFirst().orElse(null);
   var cycle=cycles.stream().filter(x->day.equals(x.get("expectedWakeDate"))).findFirst().orElseGet(()->constructCycle(LocalDate.parse(day),z,settings,false));String quality;
   if(d.isBefore(tracking)&&r==null)quality="NOT_TRACKED";
   else if(r!=null&&r.get("excludedAt")!=null)quality="excluded";
   else if((r!=null&&("UNKNOWN".equals(r.get("bedtimeCertainty"))||"UNKNOWN".equals(r.get("wakeCertainty"))))||
    projectPending(cycle,at,false,records,requirements).stream().anyMatch(p->"ACKNOWLEDGED_UNKNOWN".equals(p.get("status"))))quality="unknown";
   else if(r!=null&&"CLOSED".equals(r.get("status")))quality="complete";
   else if(at.isBefore(instant(cycle.get("wakeDueAt")).plusSeconds(7200)))quality="currentPendingDays";
   else quality=r==null?"missing":"partial";
   if(!d.isBefore(tracking)&&!quality.equals("NOT_TRACKED")){coverage.put(quality,number(coverage.get(quality))+1);if(!quality.equals("currentPendingDays"))coverage.put("expectedDays",number(coverage.get("expectedDays"))+1);}
   days.add(map("date",day,"quality",quality,"sessionId",r==null?null:r.get("id"),"intervalMinutes",r==null||!quality.equals("complete")?null:r.get("intervalMinutes")));
  }
  var recent=records.stream().filter(r->r.get("excludedAt")==null&&"CLOSED".equals(r.get("status"))&&r.get("logicalWakeDate")!=null&&LocalDate.parse(str(r.get("logicalWakeDate"))).isAfter(end.minusDays(3))).toList();
  var baseline=records.stream().filter(r->r.get("excludedAt")==null&&"CLOSED".equals(r.get("status"))&&r.get("logicalWakeDate")!=null&&
   !LocalDate.parse(str(r.get("logicalWakeDate"))).isAfter(end.minusDays(3))&&!LocalDate.parse(str(r.get("logicalWakeDate"))).isBefore(end.minusDays(16))).toList();
  var trend=map("status",recent.size()<3||baseline.size()<7?"INSUFFICIENT_BASELINE":"AVAILABLE","comparisonMinutes",recent.size()<3||baseline.size()<7?null:mean(recent)-mean(baseline),
   "recentN",recent.size(),"baselineN",baseline.size(),"baselineFrom",end.minusDays(16).toString(),"baselineTo",end.minusDays(3).toString());
  return map("windowDays",window,"from",start.toString(),"to",end.toString(),"asOf",at.toString(),"contextRevision",contextRevision(),"metricVersion","reported-interval.v1",
   "metricMeaning",MEANING,"completeCount",complete.size(),"meanIntervalMinutes",complete.isEmpty()?null:mean(complete),"bedtime",circular(b,bz),"wake",circular(w,wz),"trend",trend,"coverage",coverage,"days",days);
 }
 static double mean(List<Map<String,Object>> rows){return rows.stream().mapToDouble(r->((Number)r.get("intervalMinutes")).doubleValue()).average().orElse(Double.NaN);}
 @Transactional(readOnly=true) public Map<String,Object> context(String timezone,Instant at){
  if(at==null)at=now();var metrics=metrics(7,timezone,at);var records=metricRecords(at);
  var last=records.stream().filter(r->"CLOSED".equals(r.get("status"))&&r.get("excludedAt")==null).findFirst().orElse(null);
  var source=db.queryForList("select updated_at from sleep_context_revisions where owner_id=?",Timestamp.class,owner());
  String updated=source.isEmpty()?null:source.getFirst().toInstant().toString();
  var compactLast=last==null?null:map("sessionId",last.get("id"),"revision",last.get("revision"),"logicalWakeDate",last.get("logicalWakeDate"),
   "bedtimeIntentAt",last.get("bedtimeIntentAt"),"wakeAt",last.get("wakeAt"),"intervalMinutes",last.get("intervalMinutes"),"bedtimeSource",last.get("bedtimeSource"),"wakeSource",last.get("wakeSource"),
   "bedtimeCertainty",last.get("bedtimeCertainty"),"wakeCertainty",last.get("wakeCertainty"),"corrected",last.get("corrected"));
  var pending=due(zone(timezone),at,false);var compactPending=pending.stream().filter(p->"DUE".equals(p.get("status"))).sorted(Comparator.comparing(p->str(p.get("dueAt")),Comparator.reverseOrder())).limit(10).toList();
  metrics.remove("days");
  return map("schemaVersion","sleep.context.v1","generatedAt",now().toString(),"asOf",at.toString(),"timezone",timezone,"contextRevision",contextRevision(),
   "metricVersion","reported-interval.v1","metricMeaning",MEANING,"lastCompleted",compactLast,"recent",metrics,"coverage",metrics.get("coverage"),
   "activeSession",active(),"pendingActions",compactPending,"pendingCount",pending.size(),
   "freshness",map("status",updated==null?"UNAVAILABLE":instant(updated).isBefore(at.minusSeconds(86400))?"STALE":"FRESH","sourceUpdatedAt",updated,"unsubmittedDeviceDataKnown",false),
   "dataQuality",map("objectiveMeasurement",false,"healthConnectAvailable",false,"physiologicalSleepOnsetKnown",false,"containsRecall",records.stream().anyMatch(r->"RECALLED".equals(r.get("bedtimeCertainty"))||"RECALLED".equals(r.get("wakeCertainty")))),
   "caveats",List.of("취침·기상 간격은 측정된 수면 시간이 아닙니다.","누락은 0시간으로 계산하지 않습니다.","서버는 미전송 단말 기록을 알 수 없습니다."));
 }
}
