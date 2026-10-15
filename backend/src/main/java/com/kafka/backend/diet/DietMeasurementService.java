package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.*;
import java.time.*;
import java.util.*;

/** Owner-scoped, versioned measurement facts with an atomic legacy-day projection. */
@Service @Transactional
public class DietMeasurementService {
 public record Measurement(UUID id,String metric,LocalDate date,LocalDateTime measuredAt,Double value,String unit,String slot,long revision,String source,Map<String,Object> metadata) {}
 public record Input(UUID operationId,UUID id,String metric,LocalDate date,LocalDateTime measuredAt,Double value,String slot,Long expectedRevision) {}
 public record Page(List<Measurement> records,String nextCursor) {}
 private final JdbcTemplate db; private final CurrentUserProvider users; private final ObjectMapper json;
 public DietMeasurementService(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){this.db=db;this.users=users;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private static void require(boolean ok,String message){if(!ok)throw new InvalidRequestException(message);}
 private static String unit(String metric){return switch(metric){case "weight"->"kg";case "glucose"->"mg/dL";case "bloodKetone"->"mmol/L";case "breathKetone"->"ppm";default->throw new InvalidRequestException("측정 종류를 확인하세요.");};}
 static void validate(UUID path,Input in){
  require(in!=null&&in.operationId()!=null&&path.equals(in.id())&&in.metric()!=null,"측정 ID를 확인하세요.");unit(in.metric());
  require(in.date()!=null&&!in.date().isAfter(LocalDate.now(AppTimeZone.ZONE)),"미래 날짜에는 측정할 수 없습니다.");
  require(in.measuredAt()!=null&&in.measuredAt().toLocalDate().equals(in.date()),"측정 날짜와 시간을 확인하세요.");
  require(in.value()!=null&&Double.isFinite(in.value())&&in.value()>0&&in.value()<=1000000,"0보다 크고 1,000,000 이하인 값을 입력하세요.");
  require(Set.of("MORNING","BEFORE_SLEEP").contains(Objects.requireNonNullElse(in.slot(),"")),"측정 구분을 확인하세요.");
  require(!in.metric().equals("weight")||in.slot().equals("MORNING"),"체중은 하루 한 건입니다.");
  require(in.expectedRevision()==null||in.expectedRevision()>0,"수정 버전을 확인하세요.");
 }
 private void lock(){db.update("insert into diet_settings(owner_id) values(?) on conflict(owner_id) do nothing",owner());db.queryForList("select owner_id from diet_settings where owner_id=? for update",owner());}
 @SuppressWarnings("unchecked") private Measurement row(ResultSet r,int n)throws SQLException{return new Measurement(r.getObject("id",UUID.class),r.getString("metric"),r.getObject("entry_date",LocalDate.class),AppTimeZone.toDisplay(r.getObject("measured_at",OffsetDateTime.class)),r.getDouble("value"),r.getString("unit"),r.getString("slot"),r.getLong("revision"),r.getString("source"),json.readValue(r.getString("metadata"),Map.class));}
 @Transactional(readOnly=true) public Page list(String before,int limit){
  require(limit>=1&&limit<=500,"기록 개수는 1~500입니다.");
  var args=new ArrayList<Object>();args.add(owner());String cursor="";
  if(before!=null){try{var parts=before.split("/",-1);require(parts.length==2,"조회 위치를 확인하세요.");var date=LocalDate.parse(parts[0]);var id=UUID.fromString(parts[1]);cursor=" and (entry_date,id)<(?,?)";args.add(date);args.add(id);}catch(RuntimeException e){throw new InvalidRequestException("조회 위치를 확인하세요.");}}
  args.add(limit+1);var rows=db.query("select * from diet_measurements where owner_id=? and deleted_at is null"+cursor+" order by entry_date desc,id desc limit ?",this::row,args.toArray());
  boolean more=rows.size()>limit;var visible=rows.subList(0,Math.min(limit,rows.size()));var last=visible.isEmpty()?null:visible.getLast();return new Page(visible,more?last.date()+"/"+last.id():null);
 }
 private Measurement find(UUID id){var rows=db.query("select * from diet_measurements where owner_id=? and id=? and deleted_at is null",this::row,owner(),id);return rows.isEmpty()?null:rows.getFirst();}
 @Transactional(readOnly=true) public LocalDate dateOf(UUID id){var row=find(id);return row==null?null:row.date();}
 public Measurement save(UUID path,Input in){
  validate(path,in);lock();String request=json.writeValueAsString(in);
  var previous=db.queryForList("select request::text,response::text from diet_measurement_operations where owner_id=? and operation_id=?",owner(),in.operationId());
  if(!previous.isEmpty()){
   var prior=previous.getFirst();require(json.readTree((String)prior.get("request")).equals(json.readTree(request)),"재시도 내용이 변경되었습니다. 최신 기록을 확인하세요.");
   return json.readValue((String)prior.get("response"),Measurement.class);
  }
  var old=find(path);
  if(old==null&&db.queryForObject("select count(*) from diet_measurements where id=?",Integer.class,path)>0)throw new ResourceNotFoundException("기록을 찾을 수 없습니다.");
  if(old==null?in.expectedRevision()!=null:!Objects.equals(in.expectedRevision(),old.revision()))throw new OptimisticLockConflictException("다른 화면에서 변경되었습니다. 입력을 보존하고 최신 기록을 불러오세요.");
  require(old==null||old.metric().equals(in.metric()),"측정 종류는 변경할 수 없습니다.");
  double factor=in.metric().equals("glucose")?1:10;
  require(old!=null&&old.value().equals(in.value())||Math.abs(in.value()*factor-Math.rint(in.value()*factor))<0.0000001,"혈당은 정수, 나머지는 소수 첫째 자리까지 입력하세요.");
  if(in.metric().equals("weight")){
   var collision=db.queryForList("select id from diet_measurements where owner_id=? and entry_date=? and metric='weight' and deleted_at is null and id<>?",UUID.class,owner(),in.date(),path);
   if(!collision.isEmpty())throw new OptimisticLockConflictException("선택한 날짜에 다른 체중 기록이 있습니다. 해당 날짜의 기록을 수정하세요.");
  }
  if(old==null)db.update("insert into diet_measurements(id,owner_id,metric,entry_date,measured_at,value,unit,slot,source) values(?,?,?,?,?,?,?,?,'MOBILE_V2')",path,owner(),in.metric(),in.date(),AppTimeZone.toStored(in.measuredAt()),in.value(),unit(in.metric()),in.slot());
  else db.update("update diet_measurements set entry_date=?,measured_at=?,value=?,slot=?,legacy_field=null,revision=revision+1 where owner_id=? and id=?",in.date(),AppTimeZone.toStored(in.measuredAt()),in.value(),in.slot(),owner(),path);
  // Only touched metric/slot columns change; breath, fasting, waist and targets survive.
  if(old!=null&&(!old.date().equals(in.date())||!old.slot().equals(in.slot())))project(old.date(),old.metric(),old.slot());
  project(in.date(),in.metric(),in.slot());
  var saved=find(path);db.update("insert into diet_measurement_operations(owner_id,operation_id,request,response) values(?,?,cast(? as jsonb),cast(? as jsonb))",owner(),in.operationId(),request,json.writeValueAsString(saved));return saved;
 }
 private void project(LocalDate date,String metric,String slot){
  String field=(slot.equals("MORNING")?"morning_":"bedtime_")+switch(metric){case "weight"->"weight";case "glucose"->"glucose";case "bloodKetone"->"blood_ketone";case "breathKetone"->"breath_ketone";default->throw new IllegalStateException();};
  var rows=db.query("select * from diet_measurements where owner_id=? and entry_date=? and metric=? and slot=? and deleted_at is null order by measured_at desc nulls last,id desc limit 1",this::row,owner(),date,metric,slot);var latest=rows.isEmpty()?null:rows.getFirst();
  db.update("update diet_measurements set legacy_field=null where owner_id=? and entry_date=? and legacy_field=?",owner(),date,field);
  if(latest!=null)db.update("update diet_measurements set legacy_field=? where owner_id=? and id=?",field,owner(),latest.id());
  db.queryForObject("select set_config('app.diet_projection','1',true)",String.class);
  try{
   db.update("insert into diet_days(owner_id,entry_date) values(?,?) on conflict(owner_id,entry_date) do nothing",owner(),date);
   db.update("update diet_days set "+field+"=?,updated_at=now() where owner_id=? and entry_date=?",latest==null?null:latest.value(),owner(),date);
   // A legacy slot has one shared time. Represent its latest actual event; unknown stays null.
   var times=db.queryForList("select max(measured_at) as at from diet_measurements where owner_id=? and entry_date=? and slot=? and deleted_at is null",owner(),date,slot);
   String timeField=slot.equals("MORNING")?"morning_measured_at":"bedtime_measured_at";
   db.update("update diet_days set "+timeField+"=? where owner_id=? and entry_date=?",times.getFirst().get("at"),owner(),date);
  }finally{db.queryForObject("select set_config('app.diet_projection','0',true)",String.class);}
 }
}
