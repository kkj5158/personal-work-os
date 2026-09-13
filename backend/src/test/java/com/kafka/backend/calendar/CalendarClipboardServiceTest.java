package com.kafka.backend.calendar;

import com.kafka.backend.common.*;
import com.kafka.backend.plannedtimeblock.*;
import com.kafka.backend.calendarvisualgroup.*;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.kafka.backend.calendar.CalendarClipboardService.*;

/** Isolated H2 transaction: saves execute SQL so a mid-batch rollback is observable. */
class CalendarClipboardServiceTest {
    final UUID user=UUID.randomUUID();
    final CurrentUserProvider users=mock(CurrentUserProvider.class);
    final CalendarActualEditorService actuals=mock(CalendarActualEditorService.class);
    final PlannedTimeBlockService plans=mock(PlannedTimeBlockService.class);
    final PlannedTimeBlockRepository rows=mock(PlannedTimeBlockRepository.class);
    final CalendarVisualGroupService groups=mock(CalendarVisualGroupService.class);
    CalendarClipboardService service; JdbcTemplate jdbc;
    final LocalDate date=LocalDate.of(2026,9,14);
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
        jdbc=new JdbcTemplate(ds);jdbc.execute("create table clipboard_rows(id varchar(36) primary key, kind varchar(20))");
        when(users.getCurrentUserId()).thenReturn(user);
        var proxy=new ProxyFactory(new CalendarClipboardService(actuals,plans,rows,groups,users));
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds),new AnnotationTransactionAttributeSource()));
        service=(CalendarClipboardService)proxy.getProxy();
        when(plans.create(any(),any(),any(),any(),any(),any(),any(),any())).thenAnswer(i->{
            var p=new PlannedTimeBlock(user,i.getArgument(0),i.getArgument(1),i.getArgument(2),i.getArgument(3),null,null,null,null);
            jdbc.update("insert into clipboard_rows values (?, 'PLAN')",p.getId().toString());return p;
        });
        when(actuals.save(any(),isNull(),any())).thenAnswer(i->{var a=(CalendarActualEditRequest)i.getArgument(2);var id=UUID.randomUUID();jdbc.update("insert into clipboard_rows values (?, 'ACTUAL')",id.toString());return new CalendarActualEditorDto(i.getArgument(0),id,a.date(),a.categoryId(),a.title(),a.durationMinutes(),a.startTime(),a.endTime(),a.memo(),a.phaseId());});
    }
    Item plan(){return new Item(Kind.PLAN,new PlannedTimeBlockRequest(PlanDomainType.WORK,"Plan",date.atTime(9,5),date.atTime(9,40),null,null,null,"memo"),null,null,null);}
    Item actual(int hour){return new Item(Kind.ACTUAL,null,ActualSourceType.LIFE_TIME_ENTRY,new CalendarActualEditRequest(date,null,"Actual",35,LocalTime.of(hour,5),LocalTime.of(hour,40),"memo",null),null);}
    int count(){return jdbc.queryForObject("select count(*) from clipboard_rows",Integer.class);}
    @Test void collisionCancelsMixedBatchAndExplicitRecoverySkipsOnlyInvalid() {
        Item bad=actual(10),good=actual(11);
        doThrow(new InvalidRequestException("10:00–11:00 기존 WORK 기록과 겹칩니다.")).when(actuals).validateNew(bad.sourceType(),bad.actual());
        var request=List.of(plan(),good,bad);
        var rejected=service.paste(new Paste(request,false));assertThat(rejected.committed()).isFalse();assertThat(count()).isZero();
        verify(actuals,never()).save(any(),any(),any());verify(plans,never()).create(any(),any(),any(),any(),any(),any(),any(),any());
        var accepted=service.paste(new Paste(request,true));assertThat(accepted.committed()).isTrue();assertThat(count()).isEqualTo(2);
        assertThat(accepted.results().get(2).created()).isNull();assertThat(accepted.results().get(0).created().id()).isNotEqualTo(accepted.results().get(1).created().id());
    }
    @Test void conflictsWithinBatchAlsoCancelAll() {
        var result=service.paste(new Paste(List.of(plan(),actual(10),actual(10)),false));
        assertThat(result.committed()).isFalse();assertThat(count()).isZero();assertThat(result.results().get(2).error()).contains("붙여넣기 항목");
    }
    @Test void invalidNonActualIsPreflightedAndCannotBeSilentlyExcluded() {
        doThrow(new InvalidRequestException("invalid Planning time")).when(plans).validateNew(any());
        var result=service.paste(new Paste(List.of(actual(10),plan()),true));
        assertThat(result.committed()).isFalse();assertThat(count()).isZero();verify(actuals,never()).save(any(),any(),any());
    }
    @Test void saveFailureAfterSuccessfulPreflightRollsBackEarlierSqlWrites() {
        doThrow(new InvalidRequestException("late persistence failure")).when(groups).create(any());
        var group=new Item(Kind.GROUP,null,null,null,new VisualGroupRequest("Group",date,date,VisualGroupTimeRule.ALL_DAY,"#64748b",null,null,List.of(),List.of()));
        assertThatThrownBy(()->service.paste(new Paste(List.of(plan(),actual(10),group),false))).hasMessageContaining("late persistence");
        assertThat(count()).isZero();
    }
    @Test void newActualIdentityAndUnscheduledDurationArePreserved() {
        var item=new Item(Kind.ACTUAL,null,ActualSourceType.LIFE_TIME_ENTRY,new CalendarActualEditRequest(date,null,"Unscheduled",65,null,null,"memo",null),null);
        var first=service.paste(new Paste(List.of(item),false));var second=service.paste(new Paste(List.of(item),false));
        assertThat(first.results().getFirst().created().id()).isNotEqualTo(second.results().getFirst().created().id());
        verify(actuals,times(2)).save(item.sourceType(),null,item.actual());
    }
    @Test void multiDeleteUndoIsAtomicAndOwnerScoped() {
        var p=new PlannedTimeBlock(user,PlanDomainType.WORK,"Plan",AppTimeZone.toStored(date.atTime(9,0)),AppTimeZone.toStored(date.atTime(10,0)),null,null,null,null);
        jdbc.update("insert into clipboard_rows values (?, 'PLAN')",p.getId().toString());
        when(rows.findByIdAndUserId(p.getId(),user)).thenReturn(Optional.of(p));
        doAnswer(i->{jdbc.update("delete from clipboard_rows where id=?",p.getId().toString());return null;}).when(plans).delete(p.getId());
        var bad=new Ref(Kind.GROUP,UUID.randomUUID(),null);doThrow(new ResourceNotFoundException("not owned")).when(groups).delete(bad.id());
        var ref=new Ref(Kind.PLAN,p.getId(),null);
        assertThatThrownBy(()->service.delete(List.of(ref,bad))).hasMessage("not owned");assertThat(count()).isEqualTo(1);
        var token=service.delete(List.of(ref)).undoToken();assertThat(count()).isZero();
        when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
        when(users.getCurrentUserId()).thenReturn(user);assertThat(service.restore(token)).hasSize(1);assertThat(count()).isEqualTo(1);
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void snapshotRejectsOtherOwnersAndDoesNotIncludeSourceIdentity() {
        assertThatThrownBy(()->service.snapshot(List.of(new Ref(Kind.PLAN,UUID.randomUUID(),null)))).isInstanceOf(ResourceNotFoundException.class);
        var id=UUID.randomUUID();when(actuals.get(ActualSourceType.LIFE_TIME_ENTRY,id)).thenReturn(new CalendarActualEditorDto(ActualSourceType.LIFE_TIME_ENTRY,id,date,null,"Original",35,LocalTime.of(9,5),LocalTime.of(9,40),"Memo",null));
        assertThat(service.snapshot(List.of(new Ref(Kind.ACTUAL,id,ActualSourceType.LIFE_TIME_ENTRY))).getFirst().actual().durationMinutes()).isEqualTo(35);
    }
}
