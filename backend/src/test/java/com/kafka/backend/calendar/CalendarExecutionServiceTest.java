package com.kafka.backend.calendar;
import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real isolated transactions/user row locks: no shared DEV data is touched. */
class CalendarExecutionServiceTest {
 final UUID user=UUID.randomUUID();final CurrentUserProvider users=mock(CurrentUserProvider.class);
 final PlannedTimeBlockRepository plans=mock(PlannedTimeBlockRepository.class);
 final CalendarActualEditorService actuals=mock(CalendarActualEditorService.class);
 final Map<UUID,CalendarActualEditRequest> content=new ConcurrentHashMap<>();
 JdbcTemplate db;DriverManagerDataSource ds;CalendarExecutionService service;
 @BeforeEach void setup(){
  ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000","sa","");db=new JdbcTemplate(ds);
  db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values (?)",user);
  db.execute("create table life_time_entries(id uuid primary key,user_id uuid,execution_start_at timestamp with time zone,start_at timestamp with time zone,end_at timestamp with time zone,duration_minutes int)");
  db.execute("create table calendar_plan_executions(plan_id uuid primary key,user_id uuid,work_id uuid,life_id uuid,running boolean)");
  when(users.getCurrentUserId()).thenReturn(user);
  when(actuals.save(eq(ActualSourceType.LIFE_TIME_ENTRY),isNull(),any())).thenAnswer(i->{var r=(CalendarActualEditRequest)i.getArgument(2);UUID id=UUID.randomUUID();content.put(id,r);db.update("insert into life_time_entries(id,user_id,duration_minutes) values (?,?,?)",id,user,1);return dto(id);});
  when(actuals.get(eq(ActualSourceType.LIFE_TIME_ENTRY),any())).thenAnswer(i->dto(i.getArgument(1)));
  doAnswer(i->{db.update("delete from life_time_entries where id=?",(UUID)i.getArgument(1));return null;}).when(actuals).delete(eq(ActualSourceType.LIFE_TIME_ENTRY),any());
  when(actuals.saveAllowOverlap(eq(ActualSourceType.LIFE_TIME_ENTRY),isNull(),any())).thenAnswer(i->{var r=(CalendarActualEditRequest)i.getArgument(2);UUID id=UUID.randomUUID();content.put(id,r);db.update("insert into life_time_entries(id,user_id,duration_minutes,start_at,end_at) values (?,?,?,?,?)",id,user,r.durationMinutes(),AppTimeZone.toStored(r.date().atTime(r.startTime())),AppTimeZone.toStored(r.date().atTime(r.endTime())));return dto(id);});
  service=instance();
 }
 CalendarExecutionService instance(){var proxy=new ProxyFactory(new CalendarExecutionService(db,mock(EntityManager.class),plans,actuals,users));proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds),new AnnotationTransactionAttributeSource()));return (CalendarExecutionService)proxy.getProxy();}
 CalendarActualEditorDto dto(UUID id){var r=content.get(id);var times=db.queryForMap("select start_at,end_at,duration_minutes from life_time_entries where id=?",id);var start=(OffsetDateTime)times.get("START_AT");var end=(OffsetDateTime)times.get("END_AT");return new CalendarActualEditorDto(ActualSourceType.LIFE_TIME_ENTRY,id,r.date(),r.categoryId(),r.title(),(Integer)times.get("DURATION_MINUTES"),start==null?null:start.toLocalTime(),end==null?null:end.toLocalTime(),r.memo(),r.phaseId());}
 PlannedTimeBlock plan(){var day=LocalDate.now(AppTimeZone.ZONE).minusDays(1);var p=new PlannedTimeBlock(user,PlanDomainType.LIFE,"Plan",AppTimeZone.toStored(day.atTime(9,0)),AppTimeZone.toStored(day.atTime(10,0)),null,null,null,"memo");when(plans.findByIdAndUserId(p.getId(),user)).thenReturn(Optional.of(p));return p;}
 @Test void planSurvivesStartFinishAndHasOnlyOneActual(){
  var p=plan();var original=p.getStartAt();var started=service.start(p.getId(),new CalendarExecutionService.Start(null));
  assertThat(started.running()).isTrue();assertThat(started.startAt().toLocalDate()).isEqualTo(LocalDate.now(AppTimeZone.ZONE));assertThat(p.getStartAt()).isEqualTo(original);
  var ended=service.finish(p.getId());assertThat(ended.running()).isFalse();assertThat(ended.actual().startTime()).isNotNull();assertThat(ended.actual().endTime()).isNotNull();
  assertThatThrownBy(()->service.start(p.getId(),null)).isInstanceOf(InvalidRequestException.class);
  assertThat(db.queryForObject("select count(*) from life_time_entries",Integer.class)).isEqualTo(1);
 }
 @Test void concurrentStartsAcrossServiceInstancesCannotCreateTwoRunningActuals() throws Exception {
  var a=plan();var b=plan();var other=instance();var gate=new CyclicBarrier(2);var pool=Executors.newFixedThreadPool(2);
  try {Callable<Boolean> one=()->{gate.await();try{service.start(a.getId(),null);return true;}catch(InvalidRequestException expected){return false;}};
   Callable<Boolean> two=()->{gate.await();try{other.start(b.getId(),null);return true;}catch(InvalidRequestException expected){return false;}};
   var x=pool.submit(one);var y=pool.submit(two);assertThat(List.of(x.get(15,TimeUnit.SECONDS),y.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
   assertThat(db.queryForObject("select count(*) from calendar_plan_executions where running",Integer.class)).isEqualTo(1);
   assertThat(db.queryForObject("select count(*) from life_time_entries",Integer.class)).isEqualTo(1);
  }finally{pool.shutdownNow();}
 }
 @Test void switchingRequiresMatchingConfirmationAndCancelKeepsPlan(){
  var a=plan();var b=plan();service.start(a.getId(),null);
  assertThatThrownBy(()->service.start(b.getId(),new CalendarExecutionService.Start(UUID.randomUUID()))).isInstanceOf(InvalidRequestException.class);
  service.start(b.getId(),new CalendarExecutionService.Start(a.getId()));assertThat(service.list().stream().filter(CalendarExecutionService.Execution::running)).hasSize(1);
  service.cancel(b.getId());assertThat(service.list()).hasSize(1);verify(plans,never()).delete(any());
 }
 @Test void rejectsForeignOwnerAndFuturePlanWithoutSourceWrite(){
  assertThatThrownBy(()->service.start(UUID.randomUUID(),null)).isInstanceOf(ResourceNotFoundException.class);
  var p=plan();when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());assertThatThrownBy(()->service.start(p.getId(),null)).isInstanceOf(ResourceNotFoundException.class);
  when(users.getCurrentUserId()).thenReturn(user);var tomorrow=LocalDate.now(AppTimeZone.ZONE).plusDays(1);p.reschedule(AppTimeZone.toStored(tomorrow.atTime(9,0)),AppTimeZone.toStored(tomorrow.atTime(10,0)));
  assertThatThrownBy(()->service.start(p.getId(),null)).isInstanceOf(InvalidRequestException.class);verify(actuals,never()).save(any(),any(),any());
 }
 @Test void historyRejectsFutureAndForeignLinks(){
  var p=plan();var tomorrow=LocalDateTime.now(AppTimeZone.ZONE).plusDays(1);
  assertThatThrownBy(()->service.history(p.getId(),new CalendarExecutionService.History(tomorrow,tomorrow.plusHours(1)))).isInstanceOf(InvalidRequestException.class);
  service.start(p.getId(),null);when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());assertThat(service.list()).isEmpty();assertThatThrownBy(()->service.cancel(p.getId())).isInstanceOf(ResourceNotFoundException.class);
 }
 @Test void historicalActualPreservesOriginalPlanAndTiming(){
  var p=plan();var start=AppTimeZone.toDisplay(p.getStartAt()).plusMinutes(17);
  var result=service.history(p.getId(),new CalendarExecutionService.History(start,start.plusMinutes(35)));
  assertThat(result.running()).isFalse();assertThat(result.actual().startTime()).isEqualTo(start.toLocalTime());assertThat(p.getStartAt()).isEqualTo(AppTimeZone.toStored(start.minusMinutes(17)));
  assertThatThrownBy(()->service.history(p.getId(),new CalendarExecutionService.History(start,start.plusMinutes(35)))).isInstanceOf(InvalidRequestException.class);
 }
 @Test void failedReplacementStartRollsBackConfirmedFinish(){
  var first=plan();service.start(first.getId(),null);var second=plan();
  when(actuals.save(eq(ActualSourceType.LIFE_TIME_ENTRY),isNull(),any())).thenThrow(new InvalidRequestException("source validation"));
  assertThatThrownBy(()->service.start(second.getId(),new CalendarExecutionService.Start(first.getId()))).hasMessage("source validation");
  assertThat(service.list().getFirst().running()).isTrue();assertThat(service.list().getFirst().startAt()).isNotNull();
 }
}
