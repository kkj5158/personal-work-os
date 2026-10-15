package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarEarningsPostgresTest {
 final MoneyCalendarPayPostgresTest f=new MoneyCalendarPayPostgresTest();
 void scenario(MoneyCalendarPostgresTest.Scenario test)throws Exception{f.scenario((db,s,w,m,p)->{db.execute(Files.readString(Path.of("src/main/resources/db/migration/V86__money_work_earnings_weeks.sql")));test.run(db,s,w,m,p);});}
 EarningsInput input(long version,LocalDate day,String status,long base,long incentive,long deduction){return new EarningsInput(version,day,status,f.f.template,f.f.preset,"22:00","02:30",true,30,240,base,incentive,deduction,"explicit confirmed earnings",null);}
 EarningsWeekInput addons(MoneyCalendarService s,LocalDate sunday,long version,long special,long rest){return new EarningsWeekInput(version,s.earningsWeek(sunday).get("dailyFingerprint").toString(),special,rest);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> list(Map<String,Object> result,String field){return (List<Map<String,Object>>)result.get(field);}
 @Test void legacyForecastIsReadOnlyUntilExplicitConversionAndOriginalSnapshotNeverChanges()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWork(f.f.work,f.work(0,f.f.day,"COMPLETED",65000,List.of(new PaymentInput(f.f.payment,f.f.deposit,42140L))));var before=s.record(f.f.work);var timestamp=db.queryForObject("select updated_at::text from money_coupang_work_records where id=?",String.class,f.f.work);var paymentRows=db.queryForList("select ctid::text as position,to_jsonb(p)::text as payload from money_work_payments p order by id");
  var legacy=s.earningsRecord(f.f.work);assertThat(legacy).containsEntry("wageCompatibility","LEGACY_REVIEW_REQUIRED").containsEntry("basePay",null).containsEntry("dailyIncentive",null).containsEntry("totalDeduction",null).containsEntry("confirmedDailyPay",null).containsEntry("expectedAmount",65000);
  assertThat((Map<String,Object>)s.earningsCalendar("2026-09").get("summary")).containsEntry("confirmedDailyPay",0L).containsEntry("legacyReviewCount",1).containsEntry("legacyRecordedAmount",65000L);
  var in=input(1,f.f.day,"COMPLETED",60000,5000,1000);var saved=s.saveEarnings(f.f.work,in);assertThat(saved).containsEntry("confirmedDailyPay",64000).containsEntry("expectedAmount",65000).containsEntry("wageModel","CONFIRMED_V2");assertThat(s.saveEarnings(f.f.work,in)).isEqualTo(saved);
  var snapshot=(Map<String,Object>)saved.get("legacyWageSnapshot");assertThat(snapshot).containsEntry("expectedAmount",65000).containsEntry("sourceUpdatedAt",timestamp).containsEntry("version",1);assertThat(snapshot.get("templateSnapshot")).isEqualTo(before.get("templateSnapshot"));
  var edited=s.saveEarnings(f.f.work,input(2,f.f.day,"COMPLETED",62000,5000,1000));assertThat(edited.get("legacyWageSnapshot")).isEqualTo(snapshot);assertThat(edited).containsEntry("expectedAmount",65000).containsEntry("confirmedDailyPay",66000);
  assertThat(db.queryForList("select ctid::text as position,to_jsonb(p)::text as payload from money_work_payments p order by id")).isEqualTo(paymentRows);assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void sundaySaturdayAcrossYearAndScheduledStatusesSumConfirmedComponentsOnce()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);var sunday=LocalDate.of(2026,12,27);s.saveEarnings(f.f.work,input(0,LocalDate.of(2026,12,31),"SCHEDULED",100,20,5));s.saveEarnings(UUID.randomUUID(),input(0,LocalDate.of(2027,1,2),"SCHEDULED",200,10,20));s.saveEarnings(UUID.randomUUID(),input(0,LocalDate.of(2027,1,3),"SCHEDULED",999,0,0));
  var week=s.saveEarningsWeek(sunday,addons(s,sunday,0,30,40));assertThat(week).containsEntry("baseTotal",300L).containsEntry("incentiveTotal",30L).containsEntry("deductionTotal",25L).containsEntry("dailyTotal",305L).containsEntry("finalPay",375L).containsEntry("specialWorkAllowance",30L).containsEntry("weeklyHolidayAllowance",40L);assertThat(list(week,"workEntries")).hasSize(2);assertThat(week).doesNotContainKeys("publicHolidayAllowance","incentive","basePay");
  long independently=list(week,"workEntries").stream().mapToLong(r->((Number)r.get("confirmedDailyPay")).longValue()).sum()+30+40;assertThat(independently).isEqualTo((Long)week.get("finalPay"));
  var month=s.earningsCalendar("2027-01");assertThat(list(month,"records").stream().map(r->r.get("workDate"))).contains("2026-12-31","2027-01-02","2027-01-03");assertThat((Map<String,Object>)month.get("summary")).containsEntry("confirmedDailyPay",1189L).containsEntry("workdays",2).containsEntry("legacyReviewCount",0);
 });}
 @Test void zeroNegativeAndMissingDailyAmountsAndNegativeResultAreValidated()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);for(var values:new long[][]{{-1,0,0},{0,-1,0},{0,0,-1},{10,2,13},{1000000000000L,0,0},{999999999999L,1,0}})assertThatThrownBy(()->s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",values[0],values[1],values[2]))).isInstanceOf(InvalidRequestException.class);
  var missing=new EarningsInput(0L,f.f.day,"COMPLETED",f.f.template,f.f.preset,"22:00","02:30",true,30,240,null,0L,0L,"",null);assertThatThrownBy(()->s.saveEarnings(f.f.work,missing)).isInstanceOf(InvalidRequestException.class);
  assertThat(s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",0,0,0))).containsEntry("confirmedDailyPay",0);assertThat(s.earningsWeek(f.sunday)).containsEntry("dailyTotal",0L);assertThat(db.queryForObject("select count(*) from money_coupang_work_records",Long.class)).isEqualTo(1);
 });}
 @Test void offAndCancelledRequireExplicitZeroAndPreservePriorConfirmedPayload()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",60000,5000,1000));assertThatThrownBy(()->s.saveEarnings(f.f.work,input(1,f.f.day,"OFF",60000,5000,1000))).isInstanceOf(InvalidRequestException.class);assertThat(s.earningsRecord(f.f.work)).containsEntry("confirmedDailyPay",64000).containsEntry("version",1L);
  var off=s.saveEarnings(f.f.work,input(1,f.f.day,"OFF",0,0,0));assertThat(off).containsEntry("confirmedDailyPay",0).containsEntry("durationMinutes",0).containsEntry("startTime",null);assertThat(list(off,"offTransitionHistory")).singleElement().satisfies(old->assertThat(old).containsEntry("basePay",60000).containsEntry("dailyIncentive",5000).containsEntry("totalDeduction",1000));
  s.removeOff(f.f.work,new RemoveOffInput(2L));assertThat(list(s.earningsCalendar("2026-09"),"archivedRecords")).singleElement().satisfies(r->assertThat(r).containsEntry("wageCompatibility","CONFIRMED_V2").containsEntry("confirmedDailyPay",0));
  var restored=s.saveEarnings(f.f.work,input(3,f.f.day,"COMPLETED",60000,5000,1000));assertThat(restored).containsEntry("confirmedDailyPay",64000).containsEntry("removed",false);assertThat(s.earningsWeek(f.sunday)).containsEntry("dailyTotal",64000L);
  assertThatThrownBy(()->s.saveEarnings(f.f.work,input(4,f.f.day,"CANCELLED",60000,0,0))).isInstanceOf(InvalidRequestException.class);var cancelled=s.saveEarnings(f.f.work,input(4,f.f.day,"CANCELLED",0,0,0));assertThat(list(cancelled,"earningsTransitionHistory")).singleElement().satisfies(old->assertThat(old).containsEntry("confirmedDailyPay",64000).doesNotContainKeys("offTransitionHistory","earningsTransitionHistory","legacyWageSnapshot"));assertThat(s.earningsWeek(f.sunday)).containsEntry("dailyTotal",0L);
 });}
 @Test void legacyWriterCannotStripV2EarningsOrSnapshotsEvenWithCurrentVersion()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWork(f.f.work,f.work(0,f.f.day,"COMPLETED",65000,null));s.saveEarnings(f.f.work,input(1,f.f.day,"COMPLETED",60000,5000,1000));var before=s.earningsRecord(f.f.work);assertThatThrownBy(()->s.saveWork(f.f.work,f.work(2,f.f.day,"COMPLETED",99999,List.of()))).isInstanceOf(OptimisticLockConflictException.class);assertThatThrownBy(()->s.saveWork(f.f.work,f.work(2,f.f.day,"OFF",0,null))).isInstanceOf(OptimisticLockConflictException.class);assertThat(s.earningsRecord(f.f.work)).isEqualTo(before);
  assertThatThrownBy(()->s.removeOff(f.f.work,new RemoveOffInput(2L))).isInstanceOf(InvalidRequestException.class);assertThat(s.earningsRecord(f.f.work)).isEqualTo(before);
 });}
 @Test void componentFingerprintRejectsSameNetChangesAndWeeklyAddonsAreIndependent()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",100,0,0));var stale=addons(s,f.sunday,0,30,40);s.saveEarnings(f.f.work,input(1,f.f.day,"COMPLETED",90,10,0));assertThat(s.earningsWeek(f.sunday)).containsEntry("dailyTotal",100L);assertThatThrownBy(()->s.saveEarningsWeek(f.sunday,stale)).isInstanceOf(OptimisticLockConflictException.class);
  var valid=addons(s,f.sunday,0,300,400);var saved=s.saveEarningsWeek(f.sunday,valid);assertThat(saved).containsEntry("finalPay",800L);assertThat(s.saveEarningsWeek(f.sunday,valid)).isEqualTo(saved);assertThatThrownBy(()->s.saveEarningsWeek(f.sunday,addons(s,f.sunday,0,0,0))).isInstanceOf(OptimisticLockConflictException.class);
  s.saveEarnings(f.f.work,input(2,f.f.day,"COMPLETED",200,0,0));assertThat(s.earningsWeek(f.sunday)).containsEntry("finalPay",900L).containsEntry("specialWorkAllowance",300L).containsEntry("weeklyHolidayAllowance",400L);
  assertThatThrownBy(()->s.saveEarningsWeek(f.sunday,addons(s,f.sunday,1,-1,0))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void legacyWeeklyFourComponentsRemainExactAndAreNeverAddedToV2Totals()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWork(f.f.work,f.work(0,f.f.day,"COMPLETED",65000,List.of(new PaymentInput(f.f.payment,f.f.deposit,50000L))));s.saveWeek(f.f.monday,f.allowances(0,50000,1000L,2000L,3000L,4000L));s.savePayWeek(f.sunday,f.allowances(0,65000,1100L,2200L,3300L,4400L));var old=db.queryForList("select to_jsonb(w)::text from money_work_weeks w");var pay=db.queryForList("select to_jsonb(w)::text from money_work_pay_weeks w");
  s.saveEarnings(f.f.work,input(1,f.f.day,"COMPLETED",60000,5000,1000));s.saveEarningsWeek(f.sunday,addons(s,f.sunday,0,30,40));var historical=s.earningsCalendar("2030-01");assertThat(list(historical,"legacyWeeks")).singleElement().satisfies(row->assertThat(row).containsEntry("publicHolidayAllowance",3300).containsEntry("incentive",4400).containsEntry("readOnly",true));assertThat(list(historical,"legacyDepositWeeks")).singleElement().satisfies(row->assertThat(row).containsEntry("publicHolidayAllowance",3000).containsEntry("incentive",4000));
  assertThat(s.earningsWeek(f.sunday)).containsEntry("finalPay",64070L);assertThat(db.queryForList("select to_jsonb(w)::text from money_work_weeks w")).isEqualTo(old);assertThat(db.queryForList("select to_jsonb(w)::text from money_work_pay_weeks w")).isEqualTo(pay);
 });}
 @Test void templatesRemainSnapshotsAndSaveAsPresetStoresOnlyExplicitDailyBase()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);var in=input(0,f.f.day,"COMPLETED",60000,5000,1000);var withPreset=new EarningsInput(0L,in.workDate(),in.status(),in.templateId(),in.presetId(),in.startTime(),in.endTime(),true,30,240,60000L,5000L,1000L,"","명시적 기본급");var saved=s.saveEarnings(f.f.work,withPreset);s.saveEarnings(f.f.work,withPreset);var template=s.template(f.f.template);assertThat(list(template,"presets")).hasSize(2);assertThat(list(template,"presets").get(1)).containsEntry("amount",60000);assertThat(template).containsEntry("defaultPresetId",f.f.preset.toString());assertThat(saved).containsEntry("confirmedDailyPay",64000).containsEntry("presetAmount",60000).containsEntry("expectedAmount",0);
 });}
 @Test void ownershipAndVersionChecksProtectEarningsRecordsAndWeeks()throws Exception{scenario((db,s,w,m,p)->{
  f.setup(s);s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",100,20,5));UUID otherId=UUID.randomUUID();var json=JsonMapper.builder().build();var other=new MoneyCalendarService(new MoneyCalendarRepository(db,json),()->otherId,json);assertThatThrownBy(()->other.earningsRecord(f.f.work)).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->other.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",1,0,0))).isInstanceOf(ResourceNotFoundException.class);assertThat(list(other.earningsCalendar("2026-09"),"records")).isEmpty();assertThat(other.earningsWeek(f.sunday)).containsEntry("dailyTotal",0L);assertThatThrownBy(()->s.saveEarnings(f.f.work,input(0,f.f.day,"COMPLETED",999,0,0))).isInstanceOf(OptimisticLockConflictException.class);assertThatThrownBy(()->s.earningsWeek(f.sunday.plusDays(1))).isInstanceOf(InvalidRequestException.class);
 });}
}
