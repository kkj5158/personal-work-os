package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Real PostgreSQL, each scenario in a new synthetic schema rolled back in full. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarPostgresTest {
 final MoneyMobilePostgresTest fixture=new MoneyMobilePostgresTest();
 final UUID template=UUID.randomUUID(),preset=UUID.randomUUID(),work=UUID.randomUUID(),payment=UUID.randomUUID();
 final LocalDate day=LocalDate.of(2026,9,30),deposit=LocalDate.of(2026,10,1),monday=LocalDate.of(2026,9,28);
 interface Scenario{void run(org.springframework.jdbc.core.JdbcTemplate db,MoneyCalendarService s,MoneyWebService ledger,MoneyService m,MoneyProductService p)throws Exception;}
 void scenario(Scenario test)throws Exception{fixture.isolated((db,m,p,w,mobile)->{for(String migration:List.of("V84__money_calendar_work.sql","V85__money_work_pay_weeks.sql","V86__money_work_earnings_weeks.sql","V99__money_workplaces_multi_shift.sql","V103__money_work_calendar_preferences.sql"))db.execute(Files.readString(Path.of("src/main/resources/db/migration/"+migration)));var json=JsonMapper.builder().build();test.run(db,new MoneyCalendarService(new MoneyCalendarRepository(db,json),()->MoneyPostgresIntegrationTest.OWNER,json),w,m,p);});}
 TemplateInput template(long v,String name,long amount){return new TemplateInput(v,name,240,"22:00","02:30",30,true,"야간","2조",true,List.of(new Preset(preset,"기본",amount,true)),preset);}
 WorkInput record(long v,LocalDate date,long expected,List<PaymentInput> payments){return new WorkInput(v,date,"COMPLETED",template,preset,"22:00","02:30",true,30,240,expected,"memo",payments,null);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> records(MoneyCalendarService s,String month){return (List<Map<String,Object>>)s.month(month).get("records");}
 @Test void migrationCreateEditSnapshotAndIdempotentReplay()throws Exception{scenario((db,s,w,m,p)->{
  assertThat(s.templates()).singleElement().satisfies(t->assertThat(t).containsEntry("builtIn","OFF"));var t=s.saveTemplate(template,template(0,"야간",65000));assertThat(t.get("version")).isEqualTo(1L);assertThat(s.saveTemplate(template,template(0,"야간",65000))).isEqualTo(t);
  var first=record(0,day,64000,List.of());var saved=s.saveWork(work,first);assertThat(s.saveWork(work,first)).isEqualTo(saved);
  s.saveTemplate(template,template(1,"변경",70000));var original=records(s,"2026-09").getFirst();assertThat(original.get("templateName")).isEqualTo("야간");assertThat(original.get("presetAmount")).isEqualTo(65000);assertThat(original.get("expectedAmount")).isEqualTo(64000);
  var edited=s.saveWork(work,record(1,day,63000,List.of()));assertThat(edited.get("templateName")).isEqualTo("야간");assertThat(edited.get("presetAmount")).isEqualTo(65000);assertThat(edited.get("expectedAmount")).isEqualTo(63000);
  assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void multiplePartialPaymentsGroupByDepositAndNeverModifyLedger()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));var first=new PaymentInput(payment,deposit,20000L);var second=new PaymentInput(UUID.randomUUID(),deposit.plusDays(1),30000L);var input=record(0,day,65000,List.of(first,second));
  s.saveWork(work,input);s.saveWork(work,input);assertThat(db.queryForObject("select count(*) from money_work_payments",Long.class)).isEqualTo(2);
  assertThat((Map<String,Object>)s.month("2026-09").get("summary")).containsEntry("receivedAmount",0L).containsEntry("outstandingAmount",15000L).containsEntry("completedMinutes",240L);
  assertThat((Map<String,Object>)s.month("2026-10").get("summary")).containsEntry("receivedAmount",50000L).containsEntry("completedWorkdays",0);
  assertThat(s.week(monday)).containsEntry("totalPay",50000L).containsEntry("outstandingAmount",15000L);
  assertThat(w.calendarLedger("2026-10","INCOME",null,null).get("total")).isEqualTo(0L);assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void fourAllowancesZerosIncompleteAndPaymentCorrectionReview()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));s.saveWork(work,record(0,day,65000,List.of(new PaymentInput(payment,deposit,65000L))));
  var saved=s.saveWeek(monday,new WeekInput(0L,1000L,2000L,3000L,4000L,65000L));assertThat(saved).containsEntry("totalPay",65000L).containsEntry("basePay",55000L).containsEntry("allowancesConfirmed",true);
  assertThat(s.saveWeek(monday,new WeekInput(1L,0L,0L,0L,0L,65000L))).containsEntry("basePay",65000L).containsEntry("allowancesConfirmed",true);
  assertThat(s.saveWeek(monday,new WeekInput(2L,0L,null,0L,0L,65000L))).containsEntry("basePay",null).containsEntry("allowancesConfirmed",false);
  s.saveWeek(monday,new WeekInput(3L,1000L,2000L,3000L,4000L,65000L));s.saveWork(work,record(1,day,65000,List.of(new PaymentInput(payment,deposit,60000L))));
  assertThat(s.week(monday)).containsEntry("needsReview",true).containsEntry("basePay",null).containsEntry("totalPay",60000L);
  assertThatThrownBy(()->s.saveWeek(monday,new WeekInput(4L,1000L,2000L,3000L,4000L,65000L))).isInstanceOf(OptimisticLockConflictException.class);
  s.saveWork(work,record(2,day,65000,List.of(new PaymentInput(payment,deposit,5000L))));
  assertThat(s.week(monday)).containsEntry("needsReview",true).containsEntry("basePay",null).containsEntry("specialWorkAllowance",1000).containsEntry("totalPay",5000L);
 });}
 @Test void invalidAmountsAllowancesAndStaleVersionsFailWithoutOverwrite()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));s.saveWork(work,record(0,day,65000,List.of()));
  assertThatThrownBy(()->s.saveWork(work,record(0,day,999,List.of()))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveTemplate(template,template(0,"changed",1))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveWeek(monday,new WeekInput(0L,-1L,0L,0L,0L,0L))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.saveWeek(monday,new WeekInput(0L,1L,0L,0L,0L,0L))).isInstanceOf(InvalidRequestException.class);
  s.saveWeek(monday,new WeekInput(0L,0L,0L,0L,0L,0L));assertThatThrownBy(()->s.saveWeek(monday,new WeekInput(0L,null,0L,0L,0L,0L))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(s.saveWork(UUID.randomUUID(),record(0,day,65000,List.of()))).containsEntry("expectedAmount",65000);
  assertThat(records(s,"2026-09").getFirst()).containsEntry("expectedAmount",65000);
 });}
 @Test void invalidPaymentsAndFutureStatusNeverPersist()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));
  for(var payments:List.of(List.of(new PaymentInput(payment,day.minusDays(1),1L)),List.of(new PaymentInput(payment,deposit,-1L)),List.of(new PaymentInput(payment,deposit,0L)),List.of(new PaymentInput(payment,LocalDate.now().plusYears(1),1L)),List.of(new PaymentInput(payment,deposit,1L),new PaymentInput(payment,deposit,2L))))assertThatThrownBy(()->s.saveWork(work,record(0,day,65000,payments))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.saveWork(work,record(0,LocalDate.now().plusYears(1),65000,List.of()))).isInstanceOf(InvalidRequestException.class);assertThat(records(s,"2026-09")).isEmpty();
 });}
 @Test void outsiderCannotReadOrOverwriteTemplateWorkPaymentsOrWeek()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));s.saveWork(work,record(0,day,65000,List.of(new PaymentInput(payment,deposit,10000L))));s.saveWeek(monday,new WeekInput(0L,0L,0L,0L,0L,10000L));
  var other=new MoneyCalendarService(new MoneyCalendarRepository(db,JsonMapper.builder().build()),UUID::randomUUID,JsonMapper.builder().build());
  assertThat(other.templates()).singleElement().satisfies(t->assertThat(t).containsEntry("builtIn","OFF"));assertThat(other.month("2026-10").get("payments")).isEqualTo(List.of());assertThat(other.week(monday)).containsEntry("totalPay",0L);
  assertThatThrownBy(()->other.saveTemplate(template,template(0,"steal",1))).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->other.saveWork(work,record(0,day,1,List.of()))).isInstanceOf(ResourceNotFoundException.class);
  assertThat(s.week(monday)).containsEntry("totalPay",10000L);
 });}
 @Test void presetCreationExplicitDefaultUnchangedAndDeactivationKeepsHistory()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));var in=record(0,day,64000,List.of());var request=new WorkInput(0L,day,in.status(),template,preset,in.startTime(),in.endTime(),true,30,240,64000L,"",List.of(),"새 금액");
  var saved=s.saveWork(work,request);s.saveWork(work,request);assertThat(saved).containsEntry("presetName","새 금액");var t=s.templates().getFirst();assertThat(t.get("defaultPresetId")).isEqualTo(preset.toString());assertThat((List<?>)t.get("presets")).hasSize(2);
  assertThatThrownBy(()->s.saveTemplate(template,template(2,"cannot remove presets",1))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void ledgerSameProjectionFiltersRefundLoanKstAndForeignBoundary()throws Exception{scenario((db,s,w,m,p)->{
  var account=fixture.account(m,AccountRole.SPENDING);var hub=fixture.account(m,AccountRole.INCOME_HUB);new MoneyMeaningService(db,()->MoneyPostgresIntegrationTest.OWNER,JsonMapper.builder().build()).saveTracking(new MoneyMeaningService.TrackingInput(List.of(account.id()),List.of(hub.id()),0L));
  var root=p.saveCategory(null,new MoneyProductService.CategoryInput("Root","#123456",false,null));var child=p.saveCategory(null,new MoneyProductService.CategoryInput("Child","#123456",false,null,"EXPENSE",null,0,root.id(),false));
  var tx=p.save(null,new MoneyProductService.Entry(TransactionType.EXPENSE,account.id(),null,new BigDecimal("10000"),Instant.parse("2026-09-30T15:00:00Z"),"KST Oct1",child.id(),null,false,null,null));
  p.save(null,new MoneyProductService.Entry(TransactionType.REFUND,null,account.id(),new BigDecimal("2000"),Instant.parse("2026-10-01T15:00:00Z"),"Refund Oct2",null,null,false,tx.id(),null));
  p.save(null,new MoneyProductService.Entry(TransactionType.TRANSFER,account.id(),hub.id(),new BigDecimal("3000"),Instant.parse("2026-10-02T00:00:00Z"),"Transfer",null,null,false,null,null));
  var books=w.bookkeeping("2026-10-01","2026-10-31","EXPENSE",null,50,0,false,account.id().toString(),root.id().toString(),null,null);var calendar=w.calendarLedger("2026-10","EXPENSE",account.id().toString(),root.id().toString());
  assertThat(calendar.get("trend")).isEqualTo(books.get("trend"));assertThat(calendar.get("composition")).isEqualTo(books.get("composition"));assertThat(calendar.get("total")).isEqualTo(2L);
  assertThat((Map<String,Object>)calendar.get("summary")).containsEntry("total",new BigDecimal("8000.00")).containsEntry("spendingDayCount",1L).containsEntry("refundCount",1L).containsEntry("transactionCount",1L);
  assertThat(w.calendarLedger("2026-09","EXPENSE",null,null).get("total")).isEqualTo(0L);assertThat(w.calendarLedger("2026-10","EXPENSE",null,"direct:"+root.id()).get("total")).isEqualTo(0L);
  db.update("update money_transactions set currency='USD' where id=?",tx.id());var mixed=w.calendarLedger("2026-10","EXPENSE",null,null);assertThat(mixed).containsEntry("analyticsUnavailable",true);assertThat((Map<String,Object>)mixed.get("summary")).containsEntry("total",null).containsEntry("averageDailySpending",null);assertThat((List<?>)mixed.get("trend")).isEmpty();
 });}
 @Test void inactiveTemplateAndPresetCannotBeNewSelectionsButHistoryEditable()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));s.saveWork(work,record(0,day,65000,List.of()));var in=template(1,"비활성",1);s.saveTemplate(template,new TemplateInput(1L,in.name(),240,in.startTime(),in.endTime(),30,true,"","",false,List.of(new Preset(preset,"old",1L,false)),null));
  assertThat(s.saveWork(work,record(1,day,64000,List.of()))).containsEntry("templateName","야간");assertThatThrownBy(()->s.saveWork(UUID.randomUUID(),record(0,day.plusDays(1),1,List.of()))).isInstanceOf(InvalidRequestException.class);
 });}
 @Test void scheduledMetricIncludesTodayAndFutureKstButNotPastAndOffNeedsNoTemplate()throws Exception{scenario((db,s,w,m,p)->{
  s.saveTemplate(template,template(0,"야간",65000));var today=LocalDate.now(ZoneId.of("Asia/Seoul"));var dates=List.of(today.minusDays(1),today,today.plusDays(1));
  for(int i=0;i<3;i++){var r=record(0,dates.get(i),(i+1)*1000,List.of());s.saveWork(UUID.randomUUID(),new WorkInput(0L,r.workDate(),"SCHEDULED",template,preset,r.startTime(),r.endTime(),true,30,240,r.expectedAmount(),"",List.of(),null));}
  for(var month:dates.stream().map(YearMonth::from).distinct().toList()){long expected=0;for(int i=1;i<3;i++)if(YearMonth.from(dates.get(i)).equals(month))expected+=(i+1)*1000;assertThat((Map<String,Object>)s.month(month.toString()).get("summary")).containsEntry("scheduledAmount",expected);}
  var off=s.saveWork(UUID.randomUUID(),new WorkInput(0L,today.plusDays(2),"OFF",null,null,null,null,false,0,0,0L,"",List.of(),null));assertThat(off).containsEntry("durationMinutes",0).containsEntry("expectedAmount",0);
 });}
 @Test void nullArrayMembersAndPaymentReassignmentAreRejectedBeforeWrites()throws Exception{scenario((db,s,w,m,p)->{
  assertThatThrownBy(()->s.saveTemplate(template,new TemplateInput(0L,"name",240,null,null,0,false,"","",true,Arrays.asList((Preset)null),preset))).isInstanceOf(InvalidRequestException.class);
  s.saveTemplate(template,template(0,"야간",65000));assertThatThrownBy(()->s.saveWork(work,record(0,day,65000,Arrays.asList((PaymentInput)null)))).isInstanceOf(InvalidRequestException.class);
  s.saveWork(work,record(0,day,65000,List.of(new PaymentInput(payment,deposit,10000L))));var other=UUID.randomUUID();
  assertThatThrownBy(()->s.saveWork(other,record(0,day.plusDays(1),65000,List.of(new PaymentInput(payment,deposit,10000L))))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.record(other)).isInstanceOf(ResourceNotFoundException.class);assertThat(s.record(work).get("payments")).asList().hasSize(1);
 });}
}
