package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Additive V4 contract; all fixtures use a synthetic schema and are rolled back. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarCompanionPostgresTest {
 final MoneyCalendarEarningsPostgresTest f=new MoneyCalendarEarningsPostgresTest();
 final UUID template=UUID.randomUUID(),preset=UUID.randomUUID(),alternative=UUID.randomUUID(),other=UUID.randomUUID(),otherPreset=UUID.randomUUID(),work=UUID.randomUUID();
 final LocalDate day=LocalDate.of(2026,9,30),sunday=LocalDate.of(2026,9,27);
 TemplateInput template(long version,long amount,boolean active){return new TemplateInput(version,"야간",240,"22:00","02:30",30,true,"","",active,List.of(new Preset(preset,"기본",amount,true),new Preset(alternative,"다른 일급",38410L,true)),preset);}
 void setup(MoneyCalendarService s){s.saveTemplate(template,template(0,42140,true));s.saveTemplate(other,new TemplateInput(0L,"다른 근무",240,"22:00","02:30",30,true,"","",true,List.of(new Preset(otherPreset,"기본",84280L,true)),otherPreset));}
 EarningsInput input(long version,LocalDate date,String status,Long pay,long incentive,Boolean receipt,Long selectedVersion,boolean reselect,UUID templateId,UUID presetId){return new EarningsInput(version,date,status,templateId,presetId,"22:00","02:30",true,30,240,null,incentive,null,"초안 메모",null,pay,4,selectedVersion,reselect,receipt);}
 EarningsInput edit(long version,String status,Long pay,long incentive,Boolean receipt){return input(version,day,status,pay,incentive,receipt,1L,false,template,preset);}
 @SuppressWarnings("unchecked") Map<String,Object> object(Map<String,Object> row,String key){return (Map<String,Object>)row.get(key);}
 @SuppressWarnings("unchecked") List<Map<String,Object>> list(Map<String,Object> row,String key){return (List<Map<String,Object>>)row.get(key);}
 @Test void nullScheduleUsesActualPresetAndUnrelatedEditsKeepImmutableSnapshot()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);var scheduled=s.saveEarnings(work,edit(0,"SCHEDULED",null,0,false));assertThat(scheduled).containsEntry("expectedAmount",42140).containsEntry("confirmedDailyPay",null).containsEntry("dailyIncentive",0L).containsEntry("receiptConfirmed",false).containsEntry("selectedTemplateVersion",1);
  var snapshot=scheduled.get("templateSnapshot");var expected=scheduled.get("expectedSnapshot");s.saveTemplate(template,template(1,99999,true));
  var completed=s.saveEarnings(work,edit(1,"COMPLETED",null,0,null));assertThat(completed).containsEntry("expectedAmount",42140).containsEntry("confirmedDailyPay",null);assertThat(completed.get("templateSnapshot")).isEqualTo(snapshot);assertThat(completed.get("expectedSnapshot")).isEqualTo(expected);
  assertThatThrownBy(()->s.saveEarnings(work,input(2,day,"COMPLETED",null,0,false,1L,true,template,preset))).isInstanceOf(OptimisticLockConflictException.class);assertThat(s.earningsRecord(work)).isEqualTo(completed);
  var reselected=s.saveEarnings(work,input(2,day,"COMPLETED",null,0,false,2L,true,template,preset));assertThat(reselected).containsEntry("expectedAmount",99999).containsEntry("selectedTemplateVersion",2);assertThat(object(reselected,"expectedSnapshot")).containsEntry("amount",99999);
  var alt=s.saveEarnings(UUID.randomUUID(),input(0,day.minusDays(1),"COMPLETED",null,0,false,2L,false,template,alternative));assertThat(alt).containsEntry("expectedAmount",38410);
  assertThat(s.saveEarnings(UUID.randomUUID(),input(0,day.plusDays(1),"SCHEDULED",null,0,false,((Number)s.template(other).get("version")).longValue(),false,other,otherPreset))).containsEntry("expectedAmount",84280);
 });}
 @Test void missingStaleInvalidOrDeactivatedSelectionNeverFallsBack()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);for(Long version:new Long[]{null,0L,2L})assertThatThrownBy(()->s.saveEarnings(work,input(0,day,"SCHEDULED",null,0,false,version,false,template,preset))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveEarnings(work,input(0,day,"SCHEDULED",null,0,false,1L,false,template,UUID.randomUUID()))).isInstanceOf(InvalidRequestException.class);
  var saved=s.saveEarnings(work,edit(0,"SCHEDULED",null,0,false));s.saveTemplate(template,template(1,42140,false));
  assertThat(s.saveEarnings(work,edit(1,"SCHEDULED",null,0,null))).containsEntry("expectedAmount",42140);assertThatThrownBy(()->s.saveEarnings(work,input(2,day,"SCHEDULED",null,0,false,2L,true,template,preset))).isInstanceOf(InvalidRequestException.class);
  assertThat(db.queryForObject("select count(*) from money_coupang_work_records",Long.class)).isEqualTo(1);
 });}
 @Test void receiptOnCorrectionOffAndReplayAreAtomicAndDateFree()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);var request=edit(0,"COMPLETED",38410L,2000,true);var paid=s.saveEarnings(work,request);assertThat(paid).containsEntry("confirmedDailyPay",38410).containsEntry("receiptConfirmed",true).containsEntry("receiptConfirmedAmount",38410L);assertThat(object(paid,"receiptConfirmation")).containsEntry("confirmed",true).containsEntry("amount",38410).containsEntry("revision",1).doesNotContainKeys("depositDate","paymentDate");assertThat(list(paid,"receiptConfirmationHistory")).isEmpty();assertThat(s.saveEarnings(work,request)).isEqualTo(paid);
  var correction=edit(1,"COMPLETED",40000L,2000,null);var corrected=s.saveEarnings(work,correction);assertThat(corrected).containsEntry("receiptConfirmedAmount",40000L);assertThat(list(corrected,"receiptConfirmationHistory")).singleElement().satisfies(prior->assertThat(prior).containsEntry("amount",38410).containsEntry("revision",1));assertThat(s.saveEarnings(work,correction)).isEqualTo(corrected);
  assertThatThrownBy(()->s.saveEarnings(work,edit(2,"COMPLETED",null,0,null))).isInstanceOf(InvalidRequestException.class);assertThat(s.earningsRecord(work)).isEqualTo(corrected);
  var off=edit(2,"COMPLETED",40000L,2000,false);var unpaid=s.saveEarnings(work,off);assertThat(unpaid).containsEntry("confirmedDailyPay",40000).containsEntry("receiptConfirmed",false).containsEntry("receiptConfirmedAmount",0L);assertThat(list(unpaid,"receiptConfirmationHistory")).hasSize(2);assertThat(s.saveEarnings(work,off)).isEqualTo(unpaid);
  assertThatThrownBy(()->s.saveEarnings(work,edit(2,"COMPLETED",999L,0,true))).isInstanceOf(OptimisticLockConflictException.class);assertThat(s.earningsRecord(work)).isEqualTo(unpaid);
  assertThat(db.queryForObject("select count(*) from money_work_payments",Long.class)).isZero();assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void positiveWageDoesNotImplyPaymentAndOnRequiresPositiveCompletedWage()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);for(String status:List.of("SCHEDULED","OFF","CANCELLED"))assertThatThrownBy(()->s.saveEarnings(work,edit(0,status,38410L,0,true))).isInstanceOf(InvalidRequestException.class);
  for(Long pay:new Long[]{null,0L})assertThatThrownBy(()->s.saveEarnings(work,edit(0,"COMPLETED",pay,0,true))).isInstanceOf(InvalidRequestException.class);
  assertThatThrownBy(()->s.saveEarnings(work,edit(0,"COMPLETED",null,1,false))).isInstanceOf(InvalidRequestException.class);
  assertThat(s.saveEarnings(UUID.randomUUID(),input(0,day.minusDays(1),"SCHEDULED",38410L,2000,false,1L,false,template,preset))).containsEntry("status","SCHEDULED").containsEntry("receiptConfirmed",false).containsEntry("confirmedDailyPay",38410);
  var unpaid=s.saveEarnings(work,edit(0,"COMPLETED",38410L,2000,false));assertThat(unpaid).containsEntry("receiptConfirmed",false).containsEntry("status","COMPLETED");assertThat(s.earningsRecord(work)).isEqualTo(unpaid);
  assertThat(s.saveEarnings(work,edit(1,"COMPLETED",0L,0,null))).containsEntry("confirmedDailyPay",0).containsEntry("receiptConfirmed",false);
 });}
 @Test void oldConfirmedWagesAndHistoricalPartialRowsAreNeverAutoPaidOrRewritten()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);var legacy=new WorkInput(0L,day,"COMPLETED",template,preset,"22:00","02:30",true,30,240,42140L,"historical",List.of(new PaymentInput(UUID.randomUUID(),day.plusDays(1),10000L),new PaymentInput(UUID.randomUUID(),day.plusDays(2),5000L)),null);s.saveWork(work,legacy);
  s.saveEarnings(work,new EarningsInput(1L,day,"COMPLETED",template,preset,"22:00","02:30",true,30,240,null,2000L,null,"V3",null,38410L));var old=s.earningsRecord(work);assertThat(old).containsEntry("receiptConfirmed",false).containsEntry("legacyPaymentsReadOnly",true);
  var rows=db.queryForList("select ctid::text as position,to_jsonb(p)::text as payload from money_work_payments p order by id");var snap=old.get("templateSnapshot");var original=old.get("legacyWageSnapshot");
  var updated=s.saveEarnings(work,edit(2,"COMPLETED",38410L,2000,null));assertThat(updated).containsEntry("receiptConfirmed",false).containsEntry("expectedAmount",42140);assertThat(updated.get("templateSnapshot")).isEqualTo(snap);assertThat(updated.get("legacyWageSnapshot")).isEqualTo(original);
  for(var action:List.of(edit(3,"COMPLETED",38410L,2000,true),edit(4,"COMPLETED",40000L,2000,null),edit(5,"COMPLETED",40000L,2000,false))){s.saveEarnings(work,action);assertThat(db.queryForList("select ctid::text as position,to_jsonb(p)::text as payload from money_work_payments p order by id")).isEqualTo(rows);assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();}
  assertThat(db.queryForList("select ctid::text as position,to_jsonb(p)::text as payload from money_work_payments p order by id")).isEqualTo(rows);assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void oldWritersAndOtherOwnersCannotStripNewFields()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);var paid=s.saveEarnings(work,edit(0,"COMPLETED",38410L,2000,true));
  assertThatThrownBy(()->s.saveWork(work,new WorkInput(1L,day,"COMPLETED",template,preset,"22:00","02:30",true,30,240,1L,"",List.of(),null))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveEarnings(work,new EarningsInput(1L,day,"COMPLETED",template,preset,"22:00","02:30",true,30,240,null,0L,null,"",null,1L))).isInstanceOf(OptimisticLockConflictException.class);
  var json=JsonMapper.builder().build();var otherUser=new MoneyCalendarService(new MoneyCalendarRepository(db,json),UUID::randomUUID,json);assertThatThrownBy(()->otherUser.earningsRecord(work)).isInstanceOf(ResourceNotFoundException.class);assertThatThrownBy(()->otherUser.saveEarnings(work,edit(0,"COMPLETED",1L,0,true))).isInstanceOf(ResourceNotFoundException.class);assertThat(s.earningsRecord(work)).isEqualTo(paid);
 });}
 @Test void unchangedHistoricalV2ExceptionPreservesComponentsWhileNewDirectChangesValidate()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);var historic=s.saveEarnings(work,new EarningsInput(0L,day,"COMPLETED",template,preset,"22:00","02:30",true,30,240,0L,5000L,4000L,"historic exception",null));assertThat(historic).containsEntry("confirmedDailyPay",1000).containsEntry("dailyIncentive",5000);
  var edited=s.saveEarnings(work,edit(1,"COMPLETED",1000L,5000,false));assertThat(edited).containsEntry("wageModel","CONFIRMED_V2").containsEntry("basePay",0).containsEntry("totalDeduction",4000).containsEntry("dailyIncentive",5000).containsEntry("confirmedDailyPay",1000);assertThat(edited.get("templateSnapshot")).isEqualTo(historic.get("templateSnapshot"));
  assertThatThrownBy(()->s.saveEarnings(work,edit(2,"COMPLETED",999L,5000,false))).isInstanceOf(InvalidRequestException.class);assertThat(s.earningsRecord(work)).isEqualTo(edited);
 });}
 @Test void weeklyFormulaAndReceiptSummaryUseWorkDateAndNeverAddIncludedIncentive()throws Exception{f.scenario((db,s,w,m,p)->{
  setup(s);s.saveEarnings(work,edit(0,"COMPLETED",38410L,2000,true));s.saveEarnings(UUID.randomUUID(),input(0,day.plusDays(1),"COMPLETED",74560L,0,false,1L,false,template,preset));var current=s.earningsWeek(sunday);var week=s.saveEarningsWeek(sunday,new EarningsWeekInput(0L,current.get("dailyFingerprint").toString(),10000L,15000L));assertThat(week).containsEntry("dailyTotal",112970L).containsEntry("incentiveTotal",2000L).containsEntry("finalPay",137970L).containsEntry("receiptConfirmedAmount",38410L).containsEntry("receiptAggregationBasis","WORK_DATE");
  assertThat(object(s.earningsCalendar("2026-09"),"summary")).containsEntry("confirmedDailyPay",38410L).containsEntry("receiptConfirmedAmount",38410L).containsEntry("expectedAmount",42140L);assertThat(object(s.earningsCalendar("2026-10"),"summary")).containsEntry("confirmedDailyPay",74560L).containsEntry("receiptConfirmedAmount",0L);
 });}
}
