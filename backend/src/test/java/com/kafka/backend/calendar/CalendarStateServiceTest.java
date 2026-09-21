package com.kafka.backend.calendar;
import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.core.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.data.jpa.repository.Query;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.kafka.backend.calendar.CalendarClipboardService.*;

/** Isolated real SQL transactions verify projection, counting and rollback without shared DEV writes. */
class CalendarStateServiceTest {
 final UUID user=UUID.randomUUID();
 final CurrentUserProvider users=mock(CurrentUserProvider.class);
 final PlannedTimeBlockRepository rows=mock(PlannedTimeBlockRepository.class);
 final PlannedTimeBlockService plans=mock(PlannedTimeBlockService.class);
 final CalendarActualEditorService actuals=mock(CalendarActualEditorService.class);
 final EntityManager entities=mock(EntityManager.class);
 JdbcTemplate db;CalendarStateService service;
 final LocalDate today=LocalDate.now(AppTimeZone.ZONE);
 @BeforeEach void setup() {
  var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);
  db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values (?)",user);
  db.execute("create table planned_time_blocks(id uuid primary key,user_id uuid,domain_type varchar,title varchar,plan_date date,start_at timestamp with time zone,end_at timestamp with time zone,converted_source_type varchar,converted_source_id uuid,preferred_actual_source_type varchar,retained_duration_minutes int)");
  for(var table:List.of("life_time_entries","work_time_entries","supplemental_work_entries"))db.execute("create table "+table+"(id uuid primary key,user_id uuid,entry_date date,title varchar,minutes int,start_time time,end_time time)");
  db.execute("create table calendar_plan_executions(plan_id uuid,user_id uuid,work_id uuid,life_id uuid,running boolean)");
  when(users.getCurrentUserId()).thenReturn(user);
  when(rows.findByIdAndUserId(any(),any())).thenAnswer(i->readPlan(i.getArgument(0),i.getArgument(1)));
  when(rows.findByUserIdAndConvertedSourceTypeAndConvertedSourceId(any(),any(),any())).thenAnswer(i->{var ids=db.query("select id from planned_time_blocks where user_id=? and converted_source_type=? and converted_source_id=?",(rs,n)->rs.getObject(1,UUID.class),i.getArgument(0),i.getArgument(1),i.getArgument(2));return ids.isEmpty()?Optional.empty():readPlan(ids.getFirst(),user);});
  when(rows.save(any())).thenAnswer(i->{var p=(PlannedTimeBlock)i.getArgument(0);persist(p);return p;});
  when(plans.saveRequest(any(),any())).thenAnswer(i->{UUID id=i.getArgument(0);PlannedTimeBlockRequest r=i.getArgument(1);var p=new PlannedTimeBlock(user,r.domainType(),r.title(),AppTimeZone.toStored(r.startAt()),AppTimeZone.toStored(r.endAt()),null,null,null,r.memo());if(id!=null)p.restoreIdentity(id);p.setPlanDate(r.date());persist(p);return p;});
  when(actuals.saveAllowOverlap(any(),isNull(),any())).thenAnswer(i->{ActualSourceType type=i.getArgument(0);CalendarActualEditRequest r=i.getArgument(2);if(r.durationMinutes()==null || r.durationMinutes()<=0)throw new InvalidRequestException("positive duration required");var id=UUID.randomUUID();db.update("insert into "+table(type)+" values (?,?,?,?,?,?,?)",id,user,r.date(),r.title(),r.durationMinutes(),r.startTime(),r.endTime());return actual(type,id);});
  when(actuals.get(any(),any())).thenAnswer(i->actual(i.getArgument(0),i.getArgument(1)));
  when(actuals.delete(any(),any())).thenAnswer(i->{ActualSourceType type=i.getArgument(0);UUID id=i.getArgument(1);db.update("delete from "+table(type)+" where id=? and user_id=?",id,user);db.update("delete from calendar_plan_executions where work_id=? or life_id=?",id,id);return new CalendarActualEditorService.DeleteResult(UUID.randomUUID());});
  var proxy=new ProxyFactory(new CalendarStateService(db,entities,rows,plans,actuals,users));proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds),new AnnotationTransactionAttributeSource()));service=(CalendarStateService)proxy.getProxy();
 }
 String table(ActualSourceType t){return switch(t){case LIFE_TIME_ENTRY->"life_time_entries";case WORK_TIME_ENTRY->"work_time_entries";case SUPPLEMENTAL_WORK_ENTRY->"supplemental_work_entries";};}
 CalendarActualEditorDto actual(ActualSourceType t,UUID id){var list=db.query("select * from "+table(t)+" where id=? and user_id=?",(rs,n)->new CalendarActualEditorDto(t,id,rs.getObject("entry_date",LocalDate.class),null,rs.getString("title"),rs.getInt("minutes"),rs.getObject("start_time",LocalTime.class),rs.getObject("end_time",LocalTime.class),"memo",null),id,users.getCurrentUserId());if(list.isEmpty())throw new ResourceNotFoundException("Actual not found");return list.getFirst();}
 Optional<PlannedTimeBlock> readPlan(UUID id,UUID owner){return db.query("select * from planned_time_blocks where id=? and user_id=?",(rs,n)->{var p=new PlannedTimeBlock(owner,PlanDomainType.valueOf(rs.getString("domain_type")),rs.getString("title"),rs.getObject("start_at",OffsetDateTime.class),rs.getObject("end_at",OffsetDateTime.class),null,null,null,"memo");p.restoreIdentity(id);p.setPlanDate(rs.getObject("plan_date",LocalDate.class));p.retainActualDefaults(rs.getString("preferred_actual_source_type"),rs.getObject("retained_duration_minutes",Integer.class));p.convertToActual(rs.getString("converted_source_type"),rs.getObject("converted_source_id",UUID.class));return p;},id,owner).stream().findFirst();}
 void persist(PlannedTimeBlock p){db.update("merge into planned_time_blocks key(id) values (?,?,?,?,?,?,?,?,?,?,?)",p.getId(),p.getUserId(),p.getDomainType().name(),p.getTitle(),p.getPlanDate(),p.getStartAt(),p.getEndAt(),p.getConvertedSourceType(),p.getConvertedSourceId(),p.getPreferredActualSourceType(),p.getRetainedDurationMinutes());}
 PlannedTimeBlock plan(LocalDate date){var p=new PlannedTimeBlock(user,PlanDomainType.LIFE,"Block",AppTimeZone.toStored(date.atTime(22,0)),AppTimeZone.toStored(date.atTime(23,0)),null,null,null,"memo");persist(p);return p;}
 Ref toActual(UUID id){return service.change(new CalendarStateService.Change(Kind.PLAN,id,null,Kind.ACTUAL,null,null));}
 Ref toPlan(Ref ref){return service.change(new CalendarStateService.Change(Kind.ACTUAL,ref.id(),ref.sourceType(),Kind.PLAN,null,null));}
 int total(){return db.queryForObject("select coalesce(sum(minutes),0) from life_time_entries",Integer.class);}
 int visible() throws Exception {String sql=PlannedTimeBlockRepository.class.getMethod("findOverlapping",UUID.class,OffsetDateTime.class,OffsetDateTime.class).getAnnotation(Query.class).value();return new NamedParameterJdbcTemplate(db).queryForList(sql,Map.of("userId",user,"rangeStart",AppTimeZone.toStored(today.minusDays(30).atStartOfDay()),"rangeEnd",AppTimeZone.toStored(today.plusDays(30).atStartOfDay()))).size();}
 @Test void todayFutureClockRoundtripHasOneVisibleLogicalBlockAndStatisticsCountOnceAfterReload() throws Exception {
  var p=plan(today);assertThat(total()).isZero();assertThat(visible()).isEqualTo(1);
  var a=toActual(p.getId());assertThat(total()).isEqualTo(60);assertThat(visible()).isZero();
  assertThat(toActual(p.getId())).isEqualTo(a);assertThat(total()).isEqualTo(60);
  var restored=toPlan(a);assertThat(restored.id()).isEqualTo(p.getId());assertThat(total()).isZero();assertThat(visible()).isEqualTo(1);
  assertThat(readPlan(p.getId(),user).orElseThrow().getStartAt()).isEqualTo(p.getStartAt());
 }
 @Test void pastAllowedTomorrowRejectedWithoutMutation() {
  toActual(plan(today.minusDays(1)).getId());assertThat(total()).isEqualTo(60);
  var future=plan(today.plusDays(1));assertThatThrownBy(()->toActual(future.getId())).hasMessage("내일 이후 일정은 Plan으로 기록됩니다.");assertThat(total()).isEqualTo(60);assertThat(readPlan(future.getId(),user).orElseThrow().getConvertedSourceId()).isNull();
 }
 @Test void lateFailureRollsBackSourceCreationAndPlanRetirement() throws Exception {
  var p=plan(today);doThrow(new IllegalStateException("flush failed")).when(entities).flush();
  assertThatThrownBy(()->toActual(p.getId())).hasMessage("flush failed");assertThat(total()).isZero();assertThat(visible()).isEqualTo(1);assertThat(readPlan(p.getId(),user).orElseThrow().getConvertedSourceId()).isNull();
 }
 @Test void lateFailureRollsBackActualToPlanAndPreservesStatistics() {
  var a=toActual(plan(today).getId());doNothing().doThrow(new IllegalStateException("flush failed")).when(entities).flush();assertThatThrownBy(()->toPlan(a)).hasMessage("flush failed");assertThat(total()).isEqualTo(60);
 }
 @Test void supplementalSubtypeAndManualDurationSurviveUnscheduledAndScheduledRoundtrip() {
  for(boolean scheduled:List.of(false,true)) {
   UUID id=UUID.randomUUID();db.update("insert into supplemental_work_entries values (?,?,?,?,?,?,?)",id,user,today,"Supplemental",30,scheduled?LocalTime.of(9,0):null,scheduled?LocalTime.of(10,0):null);
   var p=toPlan(new Ref(Kind.ACTUAL,id,ActualSourceType.SUPPLEMENTAL_WORK_ENTRY));var a=toActual(p.id());assertThat(a.sourceType()).isEqualTo(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY);assertThat(actual(a.sourceType(),a.id()).durationMinutes()).isEqualTo(30);
  }
 }
 @Test void actualMoveToFuturePlanUsesNewTimingAndCanUndoToOriginalActual() {
  var a=toActual(plan(today).getId());var moved=service.change(new CalendarStateService.Change(Kind.ACTUAL,a.id(),a.sourceType(),Kind.PLAN,new CalendarActualEditRequest(today.plusDays(1),null,"Moved",60,LocalTime.of(13,0),LocalTime.of(14,0),null,null),null));assertThat(total()).isZero();assertThat(readPlan(moved.id(),user).orElseThrow().getPlanDate()).isEqualTo(today.plusDays(1));
  var restored=service.change(new CalendarStateService.Change(Kind.PLAN,moved.id(),null,Kind.ACTUAL,new CalendarActualEditRequest(today,null,"Block",60,LocalTime.of(22,0),LocalTime.of(23,0),null,null),null));assertThat(actual(restored.sourceType(),restored.id()).date()).isEqualTo(today);assertThat(total()).isEqualTo(60);
 }
 @Test void deletedSourceDoesNotResurfacePlanAndForeignOwnerCannotConvert() throws Exception {
  var p=plan(today);var a=toActual(p.getId());actuals.delete(a.sourceType(),a.id());assertThat(visible()).isZero();
  when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());assertThatThrownBy(()->toActual(p.getId())).isInstanceOf(ResourceNotFoundException.class);
 }
 @Test void legacyRunningActualCanBecomePlanWithoutTimerFlow() throws Exception {
  var p=plan(today);UUID id=UUID.randomUUID();db.update("insert into life_time_entries values (?,?,?,?,?,?,?)",id,user,today,"Legacy",0,null,null);db.update("insert into calendar_plan_executions values (?,?,?,?,true)",p.getId(),user,null,id);assertThat(visible()).isZero();var result=toPlan(new Ref(Kind.ACTUAL,id,ActualSourceType.LIFE_TIME_ENTRY));assertThat(result.id()).isEqualTo(p.getId());assertThat(visible()).isZero();assertThat(readPlan(p.getId(),user).orElseThrow().getStartAt()).isNull();assertThat(db.queryForObject("select count(*) from calendar_plan_executions",Integer.class)).isZero();
 }
}
