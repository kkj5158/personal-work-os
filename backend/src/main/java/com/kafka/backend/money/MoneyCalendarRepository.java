package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;

/** All SQL ownership checks live at the persistence boundary, including payment IDs. */
@Repository
public class MoneyCalendarRepository {
 final JdbcTemplate db; private final ObjectMapper json;
 public MoneyCalendarRepository(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
 void lock(UUID owner){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money-calendar:"+owner);}
 boolean exists(String kind,UUID id){return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from "+table(kind)+" where id=?)",Boolean.class,id));}
 boolean workDateOccupied(UUID owner,LocalDate date,UUID id){return Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_coupang_work_records where user_id=? and work_date=? and id<>?)",Boolean.class,owner,date,id));}
 private String table(String kind){return switch(kind){case "template"->"money_work_templates";case "work"->"money_coupang_work_records";case "week"->"money_work_weeks";default->throw new IllegalArgumentException();};}
 @SuppressWarnings("unchecked") private Map<String,Object> decode(Map<String,Object> row){var out=new LinkedHashMap<String,Object>(json.readValue(row.get("data").toString(),Map.class));out.put("id",row.get("id"));out.put("version",((Number)row.get("version")).longValue());out.put("_request",row.get("last_request"));return out;}
 Map<String,Object> find(String kind,UUID owner,UUID id){var rows=db.queryForList("select * from "+table(kind)+" where user_id=? and id=?",owner,id);return rows.isEmpty()?null:decode(rows.getFirst());}
 List<Map<String,Object>> list(String kind,UUID owner){return db.queryForList("select * from "+table(kind)+" where user_id=? order by updated_at,id",owner).stream().map(this::decode).toList();}
 Map<String,Object> week(UUID owner,LocalDate date){var rows=db.queryForList("select * from money_work_weeks where user_id=? and week_start=?",owner,date);return rows.isEmpty()?null:decode(rows.getFirst());}
 void save(String kind,UUID owner,UUID id,Map<String,Object> data,long version,String hash,LocalDate date,boolean create){
  String field=kind.equals("work")?"work_date":kind.equals("week")?"week_start":null;
  if(create){if(field==null)db.update("insert into "+table(kind)+"(id,user_id,data,version,last_request) values(?,?,?::jsonb,?,?)",id,owner,json.writeValueAsString(data),version,hash);
   else db.update("insert into "+table(kind)+"(id,user_id,data,version,last_request,"+field+") values(?,?,?::jsonb,?,?,?)",id,owner,json.writeValueAsString(data),version,hash,date);
  }else if(field==null)db.update("update "+table(kind)+" set data=?::jsonb,version=?,last_request=?,updated_at=now() where user_id=? and id=?",json.writeValueAsString(data),version,hash,owner,id);
  else db.update("update "+table(kind)+" set data=?::jsonb,version=?,last_request=?,"+field+"=?,updated_at=now() where user_id=? and id=?",json.writeValueAsString(data),version,hash,date,owner,id);
 }
 List<Map<String,Object>> payments(UUID owner){return db.queryForList("select p.id,p.work_record_id as \"workRecordId\",p.deposit_date::text as \"depositDate\",p.amount,w.work_date::text as \"workDate\" from money_work_payments p join money_coupang_work_records w on w.id=p.work_record_id and w.user_id=p.user_id where p.user_id=? order by p.deposit_date,p.id",owner);}
 void validatePayments(UUID owner,UUID work,List<MoneyCalendarTypes.PaymentInput> inputs){
  for(var p:inputs){var existing=db.queryForList("select user_id,work_record_id from money_work_payments where id=?",p.id());if(!existing.isEmpty()&&(!owner.equals(existing.getFirst().get("user_id"))||!work.equals(existing.getFirst().get("work_record_id"))))throw new com.kafka.backend.common.InvalidRequestException("입금 식별자가 이미 사용 중입니다.");}
 }
 void payments(UUID owner,UUID work,List<MoneyCalendarTypes.PaymentInput> inputs){
  db.update("delete from money_work_payments where user_id=? and work_record_id=?",owner,work);
  for(var p:inputs)db.update("insert into money_work_payments(id,user_id,work_record_id,deposit_date,amount) values(?,?,?,?,?)",p.id(),owner,work,p.depositDate(),p.amount());
 }
}
