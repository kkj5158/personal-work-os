package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@EnabledIfEnvironmentVariable(named="APP_DEV_USER_ID",matches=".+")
class MoneyCalendarPreferencesPostgresTest {
 final MoneyCalendarCompanionPostgresTest f=new MoneyCalendarCompanionPostgresTest();
 @Test void oneOwnerDefaultUsesExistingPresetAndReplacingItNeverChangesWorkOrSettlements()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveEarnings(f.work,f.edit(0,"COMPLETED",38410L,2000,true));
  var week=s.earningsWeek(f.sunday);s.saveEarningsWeek(f.sunday,new EarningsWeekInput(0L,week.get("dailyFingerprint").toString(),10000L,20000L));
  var workBefore=s.earningsRecord(f.work);var payBefore=s.earningsWeek(f.sunday);
  assertThat(s.preferences()).isEqualTo(new CalendarPreferences(0,"SUNDAY",false,null));
  var first=s.saveDefaultTemplate(new DefaultTemplateInput(0L,f.template));assertThat(first.defaultTemplateId()).isEqualTo(f.template);
  var other=f.other;
  var second=s.saveDefaultTemplate(new DefaultTemplateInput(1L,other));assertThat(second.defaultTemplateId()).isEqualTo(other);
  assertThat(db.queryForObject("select count(*) from money_work_calendar_preferences",Long.class)).isEqualTo(1);
  assertThat(s.saveWeekStart(new WeekStartInput(2L,"MONDAY"))).isEqualTo(new CalendarPreferences(3,"MONDAY",true,other));
  assertThat(s.saveWeekStart(new WeekStartInput(3L,"SUNDAY"))).isEqualTo(new CalendarPreferences(4,"SUNDAY",true,other));
  assertThat(s.earningsRecord(f.work)).isEqualTo(workBefore);assertThat(s.earningsWeek(f.sunday)).isEqualTo(payBefore);
  assertThat(db.queryForObject("select count(*) from money_transactions",Long.class)).isZero();
 });}
 @Test void staleSessionsCannotOverwriteAChoiceOrUnrelatedSettingAndReadsSurviveNewService()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWeekStart(new WeekStartInput(0L,"MONDAY"));
  assertThatThrownBy(()->s.saveWeekStart(new WeekStartInput(0L,"SUNDAY"))).isInstanceOf(OptimisticLockConflictException.class);
  assertThatThrownBy(()->s.saveDefaultTemplate(new DefaultTemplateInput(0L,f.template))).isInstanceOf(OptimisticLockConflictException.class);
  s.saveDefaultTemplate(new DefaultTemplateInput(1L,f.template));var json=JsonMapper.builder().build();
  var session=new MoneyCalendarService(new MoneyCalendarRepository(db,json),()->MoneyPostgresIntegrationTest.OWNER,json);
  assertThat(session.preferences()).isEqualTo(new CalendarPreferences(2,"MONDAY",true,f.template));
  assertThatThrownBy(()->session.saveWeekStart(new WeekStartInput(2L,"FRIDAY"))).isInstanceOf(InvalidRequestException.class);
  var outsider=new MoneyCalendarService(new MoneyCalendarRepository(db,json),UUID::randomUUID,json);
  assertThat(outsider.preferences()).isEqualTo(new CalendarPreferences(0,"SUNDAY",false,null));
  assertThatThrownBy(()->outsider.saveDefaultTemplate(new DefaultTemplateInput(0L,f.template))).isInstanceOf(ResourceNotFoundException.class);
  assertThatThrownBy(()->s.saveDefaultTemplate(new DefaultTemplateInput(2L,UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);
  assertThatThrownBy(()->s.saveDefaultTemplate(new DefaultTemplateInput(2L,MoneyCalendarService.OFF_TEMPLATE_ID))).isInstanceOf(ResourceNotFoundException.class);
 });}
 @Test void archivingTemplateOrParentClearsDefaultPermanentlyWithoutSelectingReplacement()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveWeekStart(new WeekStartInput(0L,"MONDAY"));s.saveDefaultTemplate(new DefaultTemplateInput(1L,f.template));
  var before=s.template(f.template);var inactive=f.template(((Number)before.get("version")).longValue(),42140,false);
  s.saveTemplate(f.template,inactive);assertThat(s.preferences()).isEqualTo(new CalendarPreferences(3,"MONDAY",true,null));
  assertThatThrownBy(()->s.saveDefaultTemplate(new DefaultTemplateInput(3L,f.template))).isInstanceOf(InvalidRequestException.class);
  s.saveTemplate(f.template,new TemplateInput(((Number)s.template(f.template).get("version")).longValue(),"복원",240,"22:00","02:30",30,true,"","",true,List.of(),f.preset,MoneyCalendarRepository.defaultWorkplaceId(MoneyPostgresIntegrationTest.OWNER)));assertThat(s.preferences().defaultTemplateId()).isNull();
  s.saveDefaultTemplate(new DefaultTemplateInput(3L,f.template));var place=s.workplaces().getFirst();
  var presets=List.of(new Preset(f.preset,"기본",42140L,true),new Preset(f.alternative,"다른 일급",38410L,true),new Preset(f.otherPreset,"기본",84280L,true));
  s.saveWorkplace((UUID)place.get("id"),new WorkplaceInput(((Number)place.get("version")).longValue(),"근무지",false,presets));
  assertThat(s.preferences()).isEqualTo(new CalendarPreferences(5,"MONDAY",true,null));
  s.saveWorkplace((UUID)place.get("id"),new WorkplaceInput(((Number)s.workplaces().getFirst().get("version")).longValue(),"복원",true,presets));
  assertThat(s.preferences().defaultTemplateId()).isNull();
 });}
 @Test void additiveMigrationAndPhysicalTemplateRemovalPreserveHistoricalRowsAndOwnerBoundary()throws Exception{f.f.scenario((db,s,w,m,p)->{
  f.setup(s);s.saveDefaultTemplate(new DefaultTemplateInput(0L,f.template));
  assertThat(db.queryForObject("select relrowsecurity from pg_class where oid='money_work_calendar_preferences'::regclass",Boolean.class)).isTrue();
  assertThat(db.queryForObject("select count(*) from pg_policies where tablename='money_work_calendar_preferences' and schemaname=current_schema()",Long.class)).isEqualTo(1);
  db.update("delete from money_work_templates where id=?",f.template);assertThat(s.preferences().defaultTemplateId()).isNull();
  assertThat(s.preferences().weekStartConfigured()).isFalse();
 });}
}
