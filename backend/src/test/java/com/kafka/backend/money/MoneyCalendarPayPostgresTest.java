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

/** Sunday receivables are tested against actual PostgreSQL, preserving legacy rows byte-for-byte. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarPayPostgresTest {
 final MoneyCalendarPostgresTest f=new MoneyCalendarPostgresTest();
 final LocalDate sunday=LocalDate.of(2026,9,27);
 void scenario(MoneyCalendarPostgresTest.Scenario test)throws Exception{f.scenario((db,s,w,m,p)->{db.execute(Files.readString(Path.of("src/main/resources/db/migration/V85__money_work_pay_weeks.sql")));test.run(db,s,w,m,p);});}
 WorkInput work(long v,LocalDate date,String status,long expected,List<PaymentInput> payments){return new WorkInput(v,date,status,f.template,f.preset,"22:00","02:30",true,30,240,expected,"audit memo",payments,null);}
 WeekInput allowances(long v,long total,Long a,Long b,Long c,Long d){return new WeekInput(v,a,b,c,d,total);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> list(Map<String,Object> result,String field){return (List<Map<String,Object>>)result.get(field);}
 void setup(MoneyCalendarService s){s.saveTemplate(f.template,f.template(0,"기존 야간",65000));}
 @Test void sundayGrossCountsCompletedWorkDatesOnceAcrossMonthBoundariesNotDeposits()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,List.of(new PaymentInput(f.payment,f.deposit,10000L))));
  s.saveWork(UUID.randomUUID(),work(0,LocalDate.of(2026,10,3),"COMPLETED",40000,null));s.saveWork(UUID.randomUUID(),work(0,LocalDate.of(2026,10,4),"COMPLETED",50000,null));
  s.saveWork(UUID.randomUUID(),work(0,LocalDate.of(2026,11,7),"SCHEDULED",70000,null));
  s.saveWork(UUID.randomUUID(),work(0,LocalDate.of(2026,9,26),"COMPLETED",1000,List.of(new PaymentInput(UUID.randomUUID(),LocalDate.of(2026,10,5),1000L))));
  var month=s.payCalendar("2026-10");assertThat(month).containsEntry("gridStart","2026-09-27").containsEntry("gridEnd","2026-10-31");assertThat(list(month,"records")).hasSize(3);var september=s.payCalendar("2026-09");assertThat(september).containsEntry("gridStart","2026-08-30").containsEntry("gridEnd","2026-10-03");assertThat(list(september,"records").stream().map(r->r.get("workDate"))).contains("2026-10-03");
  assertThat((Map<String,Object>)month.get("summary")).containsEntry("completedWorkdays",2).containsEntry("completedMinutes",480L).containsEntry("receivableAmount",90000L).containsEntry("scheduledAmount",0L);
  var week=s.payWeek(sunday);assertThat(week).containsEntry("totalPay",105000L).containsEntry("completedWorkdays",2).containsEntry("aggregationBasis","WORK_DATE_RECEIVABLE");assertThat(list(week,"workEntries")).hasSize(2);assertThat(list(week,"payments")).isEmpty();
  assertThat(s.payWeek(sunday.plusWeeks(1))).containsEntry("totalPay",50000L);assertThat(s.week(f.monday)).containsEntry("totalPay",10000L);assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void allowanceComponentsNeverIncreaseGrossAndChangedWorkBasisRequiresReview()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,null));
  var initial=allowances(0,65000,1000L,2000L,3000L,4000L);var saved=s.savePayWeek(sunday,initial);assertThat(saved).containsEntry("totalPay",65000L).containsEntry("basePay",55000L).containsEntry("allowancesConfirmed",true);assertThat(s.savePayWeek(sunday,initial)).isEqualTo(saved);
  assertThatThrownBy(()->s.savePayWeek(sunday,allowances(1,65000,-1L,0L,0L,0L))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->s.savePayWeek(sunday,allowances(1,65000,65001L,0L,0L,0L))).isInstanceOf(InvalidRequestException.class);
  s.saveWork(f.work,work(1,f.day,"COMPLETED",60000,null));assertThat(s.payWeek(sunday)).containsEntry("needsReview",true).containsEntry("basePay",null).containsEntry("specialWorkAllowance",1000);
  assertThatThrownBy(()->s.savePayWeek(sunday,allowances(1,65000,1000L,2000L,3000L,4000L))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(s.savePayWeek(sunday,allowances(1,60000,0L,0L,0L,0L))).containsEntry("basePay",60000L).containsEntry("allowancesConfirmed",true);
  assertThat(s.savePayWeek(sunday,allowances(2,60000,0L,null,0L,0L))).containsEntry("basePay",null).containsEntry("allowancesConfirmed",false);
  assertThat(db.queryForObject("select count(*) from money_work_weeks",Long.class)).isZero();
 });}
 @Test void legacyDepositRowsAndMondaySettlementsSurviveNewWritesOffAndRemovalExactly()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,List.of(new PaymentInput(f.payment,f.deposit,10000L))));s.saveWeek(f.monday,allowances(0,10000,1000L,0L,0L,0L));
  var payments=db.queryForList("select ctid::text as row_location,xmin::text as row_version,to_jsonb(p)::text as payload from money_work_payments p order by id");var oldWeeks=db.queryForList("select to_jsonb(w)::text from money_work_weeks w order by id");
  s.saveWork(f.work,work(1,f.day,"COMPLETED",66000,null));s.savePayWeek(sunday,allowances(0,66000,1000L,0L,0L,0L));
  var off=s.saveWork(f.work,work(2,f.day,"OFF",99999,null));assertThat(off).containsEntry("templateName","휴무").containsEntry("expectedAmount",0).containsEntry("durationMinutes",0).containsEntry("breakMinutes",0).containsEntry("startTime",null).containsEntry("endTime",null).containsEntry("templateId",null);
  assertThat(list(off,"offTransitionHistory")).singleElement().satisfies(before->assertThat(before).containsEntry("expectedAmount",66000).containsEntry("status","COMPLETED"));
  s.removeOff(f.work,new RemoveOffInput(3L));assertThat(s.payWeek(sunday)).containsEntry("totalPay",0L);assertThat(s.week(f.monday)).containsEntry("totalPay",10000L).containsEntry("basePay",9000L);
  var legacy=list(s.payCalendar("2030-01"),"legacyWeeks");assertThat(legacy).singleElement().satisfies(row->assertThat(row).containsEntry("start",f.monday.toString()).containsEntry("readOnly",true).containsEntry("totalPay",10000L));assertThat(list(legacy.getFirst(),"payments")).hasSize(1);
  assertThat(db.queryForList("select ctid::text as row_location,xmin::text as row_version,to_jsonb(p)::text as payload from money_work_payments p order by id")).isEqualTo(payments);assertThat(db.queryForList("select to_jsonb(w)::text from money_work_weeks w order by id")).isEqualTo(oldWeeks);
 });}
 @Test void builtinOffTemplateIsStableImmutableAndNeverSeededIntoDatabase()throws Exception{scenario((db,s,w,m,p)->{
  var once=s.templates();assertThat(s.templates()).isEqualTo(once);assertThat(once).singleElement().satisfies(t->assertThat(t).containsEntry("id",MoneyCalendarService.OFF_TEMPLATE_ID).containsEntry("builtIn","OFF").containsEntry("durationMinutes",0));assertThat(s.template(MoneyCalendarService.OFF_TEMPLATE_ID)).isEqualTo(once.getFirst());assertThat(db.queryForObject("select count(*) from money_work_templates",Long.class)).isZero();
  assertThatThrownBy(()->s.saveTemplate(MoneyCalendarService.OFF_TEMPLATE_ID,f.template(0,"overwrite",1))).isInstanceOf(InvalidRequestException.class);
  var off=s.saveWork(f.work,new WorkInput(0L,f.day,"OFF",MoneyCalendarService.OFF_TEMPLATE_ID,MoneyCalendarService.OFF_PRESET_ID,null,null,null,null,null,null,"",null,null));assertThat(off).containsEntry("templateName","휴무").containsEntry("expectedAmount",0).containsEntry("templateId",null);assertThat(s.payCalendar("2026-09").get("summary")).asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.MAP).containsEntry("completedWorkdays",0).containsEntry("receivableAmount",0L);
 });}
 @Test void offRemovalIsVersionedIdempotentAndDateRecreationReusesStableId()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"OFF",0,null));var input=new RemoveOffInput(1L);var removed=s.removeOff(f.work,input);assertThat(s.removeOff(f.work,input)).isEqualTo(removed);assertThat(list(s.payCalendar("2026-09"),"records")).isEmpty();assertThat(list(s.payCalendar("2026-09"),"archivedRecords")).singleElement().satisfies(r->assertThat(r).containsEntry("id",f.work).containsEntry("removed",true));
  assertThatThrownBy(()->s.removeOff(f.work,new RemoveOffInput(0L))).isInstanceOf(OptimisticLockConflictException.class);assertThatThrownBy(()->s.saveWork(UUID.randomUUID(),work(0,f.day,"OFF",0,null))).isInstanceOf(OptimisticLockConflictException.class);
  var restored=s.saveWork(f.work,work(2,f.day,"COMPLETED",65000,null));assertThat(restored).containsEntry("removed",false).containsEntry("templateName","기존 야간").containsEntry("durationMinutes",240).containsEntry("expectedAmount",65000);assertThat(list(s.payCalendar("2026-09"),"archivedRecords")).isEmpty();assertThatThrownBy(()->s.removeOff(f.work,new RemoveOffInput(3L))).isInstanceOf(InvalidRequestException.class);
  assertThat(db.queryForObject("select count(*) from money_coupang_work_records",Long.class)).isEqualTo(1);
 });}
 @Test void suppliedLegacyPaymentListsKeepExplicitCorrectionSemanticsAndNullMeansPreserve()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,List.of(new PaymentInput(f.payment,f.deposit,10000L))));s.saveWork(f.work,work(1,f.day,"COMPLETED",65000,null));assertThat(list(s.record(f.work),"payments")).hasSize(1);s.saveWork(f.work,work(2,f.day,"COMPLETED",65000,List.of()));assertThat(list(s.record(f.work),"payments")).isEmpty();
 });}
 @Test void legacyHistoryIncludesSavedZeroAndDepositDerivedWeeksFromEveryMonth()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWeek(LocalDate.of(2025,1,6),allowances(0,0,0L,0L,0L,0L));s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,List.of(new PaymentInput(f.payment,LocalDate.of(2026,10,6),10000L))));
  var legacy=list(s.payCalendar("2031-12"),"legacyWeeks");assertThat(legacy).hasSize(2);assertThat(legacy.stream().map(r->r.get("start"))).containsExactly("2025-01-06","2026-10-05");assertThat(list(legacy.get(1),"payments")).singleElement().satisfies(pmt->assertThat(pmt).containsEntry("id",f.payment));
 });}
 @Test void ownerIsolationVersionsAndSundayValidationProtectNewDomain()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);s.saveWork(f.work,work(0,f.day,"OFF",0,null));s.savePayWeek(sunday,allowances(0,0,0L,0L,0L,0L));UUID otherId=UUID.randomUUID();var json=JsonMapper.builder().build();var other=new MoneyCalendarService(new MoneyCalendarRepository(db,json),()->otherId,json);
  assertThat(list(other.payCalendar("2026-09"),"records")).isEmpty();assertThat(list(other.payCalendar("2026-09"),"legacyWeeks")).isEmpty();assertThat(other.payWeek(sunday)).containsEntry("totalPay",0L).containsEntry("version",0L);assertThatThrownBy(()->other.removeOff(f.work,new RemoveOffInput(1L))).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->other.savePayWeek(sunday,allowances(1,0,0L,0L,0L,0L))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.payWeek(sunday.plusDays(1))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->s.savePayWeek(sunday.plusDays(1),allowances(0,0,0L,0L,0L,0L))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void omittedPaymentsCannotSilentlyMovePaidWorkDateButExplicitLegacyCorrectionCan()throws Exception{scenario((db,s,w,m,p)->{
  setup(s);var payments=List.of(new PaymentInput(f.payment,f.deposit,10000L));s.saveWork(f.work,work(0,f.day,"COMPLETED",65000,payments));var original=db.queryForList("select ctid::text as row_location,to_jsonb(p)::text as payload from money_work_payments p order by id");
  assertThatThrownBy(()->s.saveWork(f.work,work(1,f.day.plusDays(1),"COMPLETED",65000,null))).isInstanceOf(InvalidRequestException.class);assertThat(s.record(f.work)).containsEntry("workDate",f.day.toString()).containsEntry("version",1L);assertThat(db.queryForList("select ctid::text as row_location,to_jsonb(p)::text as payload from money_work_payments p order by id")).isEqualTo(original);
  assertThat(s.saveWork(f.work,work(1,f.day.minusDays(1),"COMPLETED",65000,payments))).containsEntry("workDate",f.day.minusDays(1).toString());
 });}
}
