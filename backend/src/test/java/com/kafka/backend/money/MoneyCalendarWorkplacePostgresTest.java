package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.nio.file.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarWorkplacePostgresTest {
 final MoneyCalendarCompanionPostgresTest f=new MoneyCalendarCompanionPostgresTest();
 final UUID place=UUID.randomUUID(),preset=UUID.randomUUID(),template=UUID.randomUUID();
 WorkplaceInput place(long version,boolean active,long amount){return new WorkplaceInput(version,"카페",active,List.of(new Preset(preset,"공유 일급",amount,true)));}
 TemplateInput template(long version,UUID placeId,UUID defaultId){return new TemplateInput(version,"오전",240,"09:00","13:00",0,false,"오전","",true,List.of(),defaultId,placeId);}
 EarningsInput work(long version,UUID templateId,UUID presetId,long pay){return new EarningsInput(version,f.day,"COMPLETED",templateId,presetId,"09:00","13:00",false,0,240,null,2000L,null,"보존",null,pay,4,1L,false,true);}
 @SuppressWarnings("unchecked") Map<String,Object> object(Map<String,Object> row,String key){return (Map<String,Object>)row.get(key);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> list(Map<String,Object> row,String key){return (List<Map<String,Object>>)row.get(key);}
 @Test void sameDateIndependentWritesAndExactReplayPreserveOtherRecordsAndReceipts()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);var a=s.saveEarnings(f.work,f.edit(0,"COMPLETED",38410L,2000,true));var second=UUID.randomUUID();var request=f.edit(0,"COMPLETED",74560L,2000,false);var b=s.saveEarnings(second,request);
  assertThat(s.saveEarnings(second,request)).isEqualTo(b);assertThat(list(s.earningsCalendar("2026-09"),"records")).hasSize(2);assertThat(object(s.earningsCalendar("2026-09"),"summary")).containsEntry("workdays",1).containsEntry("completedWorkdays",1L);
  s.saveEarnings(second,f.edit(1,"COMPLETED",40000L,2000,false));assertThat(s.earningsRecord(f.work)).isEqualTo(a);
  assertThatThrownBy(()->s.saveEarnings(second,f.edit(0,"COMPLETED",999L,0,false))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(s.earningsWeek(f.sunday)).containsEntry("dailyTotal",78410L).containsEntry("incentiveTotal",4000L).containsEntry("finalPay",78410L);
  s.saveEarnings(second,f.edit(2,"CANCELLED",0L,0,false));assertThat(s.earningsRecord(f.work)).isEqualTo(a);assertThat(s.earningsWeek(f.sunday)).containsEntry("finalPay",38410L);
 });}
 @Test void sharedPresetsMoveArchiveAndRenameNeverRewriteHistoricalFacts()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWorkplace(place,place(0,true,65000));s.saveTemplate(template,template(0,place,preset));var other=UUID.randomUUID();s.saveTemplate(other,template(0,place,preset));
  var saved=s.saveEarnings(UUID.randomUUID(),work(0,template,preset,38410));var id=(UUID)saved.get("id");var facts=db.queryForMap("select data::text,version,updated_at from money_coupang_work_records where id=?",id);
  s.saveWorkplace(place,place(1,true,90000));assertThat(list(s.template(other),"presets")).singleElement().satisfies(v->assertThat(v).containsEntry("amount",90000));
  var renamed=new WorkplaceInput(2L,"새 카페 이름",false,List.of(new Preset(preset,"공유 일급",90000L,true)));s.saveWorkplace(place,renamed);
  assertThat(s.earningsRecord(id)).isEqualTo(saved);assertThat(db.queryForMap("select data::text,version,updated_at from money_coupang_work_records where id=?",id)).isEqualTo(facts);
  assertThat(s.template(template)).containsEntry("workplaceActive",false);assertThatThrownBy(()->s.saveEarnings(UUID.randomUUID(),work(0,template,preset,38410))).isInstanceOf(InvalidRequestException.class);
  s.saveWorkplace(place,new WorkplaceInput(3L,"새 카페 이름",true,List.of(new Preset(preset,"공유 일급",90000L,true))));assertThat(s.template(template)).containsEntry("active",true).containsEntry("workplaceActive",true);
  var defaultPlace=MoneyCalendarRepository.defaultWorkplaceId(MoneyPostgresIntegrationTest.OWNER);var moved=s.saveTemplate(template,template(((Number)s.template(template).get("version")).longValue(),defaultPlace,preset));assertThat(moved).containsEntry("defaultPresetId",null);
  assertThat(s.earningsRecord(id)).containsEntry("workplaceId",place.toString()).containsEntry("confirmedDailyPay",38410);
  assertThatThrownBy(()->s.saveTemplate(other,template(((Number)s.template(other).get("version")).longValue(),place,f.preset))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void scopedWeeklyAllowancesFiltersAndMonthBoundaryNeverPoolOrDoubleAddIncentives()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWorkplace(place,place(0,true,70000));s.saveTemplate(template,template(0,place,preset));s.saveEarnings(f.work,f.edit(0,"COMPLETED",38410L,2000,true));s.saveEarnings(UUID.randomUUID(),work(0,template,preset,74560));
  UUID defaultPlace=MoneyCalendarRepository.defaultWorkplaceId(MoneyPostgresIntegrationTest.OWNER);var first=s.earningsWeek(f.sunday,defaultPlace);s.saveEarningsWeek(f.sunday,new EarningsWeekInput(0L,first.get("dailyFingerprint").toString(),10000L,15000L),defaultPlace);
  var second=s.earningsWeek(f.sunday,place);s.saveEarningsWeek(f.sunday,new EarningsWeekInput(0L,second.get("dailyFingerprint").toString(),3000L,0L),place);
  var all=s.earningsWeek(f.sunday);assertThat(all).containsEntry("finalPay",140970L).containsEntry("dailyTotal",112970L).containsEntry("incentiveTotal",4000L);assertThat(list(all,"workplaceBreakdowns")).hasSize(2);
  assertThat(s.earningsWeek(f.sunday,defaultPlace)).containsEntry("finalPay",63410L);assertThat(s.earningsWeek(f.sunday,place)).containsEntry("finalPay",77560L);
  for(String month:List.of("2026-09","2026-10"))assertThat(list(s.earningsCalendar(month),"weeks").stream().filter(v->v.get("start").equals(f.sunday.toString())).findFirst().orElseThrow()).containsEntry("finalPay",140970L);
  var filtered=s.earningsCalendar("2026-09",place,"ALL");assertThat(list(filtered,"records")).hasSize(1);assertThat(list(filtered,"allRecords")).hasSize(2);assertThat(object(filtered,"summary")).containsEntry("confirmedDailyPay",74560L);
  assertThat(object(s.earningsCalendar("2026-09",place,"OFF"),"summary")).containsEntry("confirmedDailyPay",0L);assertThat(list(s.earningsCalendar("2026-09",place,"OFF"),"weeks").stream().mapToLong(v->((Number)v.get("finalPay")).longValue()).sum()).isZero();
  assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void workplaceOwnershipReplayAndInvalidCatalogAreSafe()throws Exception{f.f.scenario((db,s,w,m,p)->{
  var in=place(0,true,0);var created=s.saveWorkplace(place,in);assertThat(s.saveWorkplace(place,in)).isEqualTo(created);
  var json=JsonMapper.builder().build();var outsider=new MoneyCalendarService(new MoneyCalendarRepository(db,json),UUID::randomUUID,json);assertThat(outsider.workplaces()).isEmpty();assertThatThrownBy(()->outsider.saveWorkplace(place,in)).isInstanceOf(ResourceNotFoundException.class);
  assertThatThrownBy(()->s.saveWorkplace(place,place(0,true,100))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveWorkplace(place,new WorkplaceInput(1L,"카페",true,List.of()))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.saveWorkplace(UUID.randomUUID(),new WorkplaceInput(0L,"도용",true,in.presets()))).isInstanceOf(InvalidRequestException.class);
  assertThat(s.workplaces()).singleElement().satisfies(v->assertThat(v).containsEntry("name","카페"));
 });}
 @Test void migrationIsIdempotentAndPreservesEveryLegacyPayloadVersionTimestampAndPayment()throws Exception{
  new MoneyMobilePostgresTest().isolated((db,m,p,w,mobile)->{
   for(String file:List.of("V84__money_calendar_work.sql","V85__money_work_pay_weeks.sql","V86__money_work_earnings_weeks.sql"))db.execute(Files.readString(Path.of("src/main/resources/db/migration/"+file)));
   UUID owner=MoneyPostgresIntegrationTest.OWNER,tid=UUID.randomUUID(),rid=UUID.randomUUID(),pid=UUID.randomUUID();
   db.update("insert into money_work_templates(id,user_id,data,version,last_request) values(?,?,?::jsonb,7,'legacy')",tid,owner,"{\"name\":\"야간\",\"active\":false,\"presets\":[{\"id\":\""+pid+"\",\"name\":\"기본\",\"amount\":65000,\"active\":true}]}");
   db.update("insert into money_coupang_work_records(id,user_id,work_date,data,version,last_request) values(?,?,date '2026-09-30',?::jsonb,4,'legacy')",rid,owner,"{\"confirmedDailyPay\":38410,\"dailyIncentive\":2000,\"receiptConfirmation\":{\"confirmed\":true,\"amount\":38410},\"memo\":\"보존\"}");
   db.update("insert into money_work_earnings_weeks(id,user_id,week_start,data,version,last_request) values(?,?,date '2026-09-27','{\"specialWorkAllowance\":10000,\"weeklyHolidayAllowance\":15000}',3,'legacy')",UUID.randomUUID(),owner);
   db.update("insert into money_work_payments values(?,?,?,date '2026-10-01',10000)",UUID.randomUUID(),owner,rid);
   var before=new LinkedHashMap<String,Object>();for(String table:List.of("money_work_templates","money_coupang_work_records","money_work_earnings_weeks"))before.put(table,db.queryForList("select id,data::text,version,last_request,updated_at from "+table));var payments=db.queryForList("select ctid::text,to_jsonb(p)::text from money_work_payments p");
   String sql=Files.readString(Path.of("src/main/resources/db/migration/V99__money_workplaces_multi_shift.sql"));db.execute(sql);db.execute(sql);
   for(String table:before.keySet())assertThat(db.queryForList("select id,data::text,version,last_request,updated_at from "+table)).isEqualTo(before.get(table));assertThat(db.queryForList("select ctid::text,to_jsonb(p)::text from money_work_payments p")).isEqualTo(payments);
   assertThat(db.queryForObject("select count(*) from money_workplaces",Long.class)).isEqualTo(1);assertThat(db.queryForObject("select workplace_id from money_coupang_work_records where id=?",UUID.class,rid)).isEqualTo(MoneyCalendarRepository.defaultWorkplaceId(owner));
   db.update("insert into money_coupang_work_records(id,user_id,work_date,data,last_request) values(?,?,date '2026-09-30','{}','retry')",UUID.randomUUID(),owner);
   assertThat(db.queryForObject("select count(*) from money_coupang_work_records",Long.class)).isEqualTo(2);
   // A still-running older API can add/update nested presets during backend-first rollout.
   db.update("update money_work_templates set data=jsonb_set(data,'{presets,0,amount}','70000'::jsonb),version=version+1 where id=?",tid);
   assertThat(db.queryForObject("select data->'presets'->0->>'amount' from money_workplaces where user_id=?",String.class,owner)).isEqualTo("70000");
   assertThat(db.queryForMap("select id,data::text,version,last_request,updated_at from money_coupang_work_records where id=?",rid)).isEqualTo(((List<Map<String,Object>>)before.get("money_coupang_work_records")).getFirst());
  });
 }
}
