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
    final CalendarExecutionService executions=mock(CalendarExecutionService.class);
    CalendarClipboardService service; JdbcTemplate jdbc;
    final LocalDate date=LocalDate.of(2026,9,14);
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
        jdbc=new JdbcTemplate(ds);jdbc.execute("create table clipboard_rows(id varchar(36) primary key, kind varchar(20))");
        when(users.getCurrentUserId()).thenReturn(user);
        var proxy=new ProxyFactory(new CalendarClipboardService(actuals,plans,rows,groups,users,executions));
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds),new AnnotationTransactionAttributeSource()));
        service=(CalendarClipboardService)proxy.getProxy();
        when(plans.saveRequest(isNull(),any())).thenAnswer(i->{
            PlannedTimeBlockRequest r=i.getArgument(1);
            var p=new PlannedTimeBlock(user,r.domainType(),r.title(),AppTimeZone.toStored(r.startAt()),AppTimeZone.toStored(r.endAt()),null,null,null,null);
            jdbc.update("insert into clipboard_rows values (?, 'PLAN')",p.getId().toString());return p;
        });
        when(plans.restoreRequest(any(),any())).thenAnswer(i->{PlannedTimeBlockRequest r=i.getArgument(1);var p=new PlannedTimeBlock(user,r.domainType(),r.title(),AppTimeZone.toStored(r.startAt()),AppTimeZone.toStored(r.endAt()),null,null,null,null);p.restoreIdentity(i.getArgument(0));jdbc.update("insert into clipboard_rows values (?, 'PLAN')",p.getId().toString());return p;});
        when(actuals.saveAllowOverlap(any(),isNull(),any())).thenAnswer(i->{var a=(CalendarActualEditRequest)i.getArgument(2);var id=UUID.randomUUID();jdbc.update("insert into clipboard_rows values (?, 'ACTUAL')",id.toString());return new CalendarActualEditorDto(i.getArgument(0),id,a.date(),a.categoryId(),a.title(),a.durationMinutes(),a.startTime(),a.endTime(),a.memo(),a.phaseId());});
    }
    Item plan(){return new Item(Kind.PLAN,new PlannedTimeBlockRequest(PlanDomainType.WORK,"Plan",date.atTime(9,5),date.atTime(9,40),null,null,null,"memo"),null,null,null);}
    Item actual(int hour){return new Item(Kind.ACTUAL,null,ActualSourceType.LIFE_TIME_ENTRY,new CalendarActualEditRequest(date,null,"Actual",35,LocalTime.of(hour,5),LocalTime.of(hour,40),"memo",null),null);}
    int count(){return jdbc.queryForObject("select count(*) from clipboard_rows",Integer.class);}
    @Test void invalidDomainMetadataCancelsMixedBatchAndExplicitRecoverySkipsOnlyInvalid() {
        Item bad=actual(10),good=actual(11);
        doThrow(new InvalidRequestException("유효한 카테고리가 필요합니다.")).when(actuals).validateNewAllowOverlap(bad.sourceType(),bad.actual());
        var request=List.of(plan(),good,bad);
        var rejected=service.paste(new Paste(request,false));assertThat(rejected.committed()).isFalse();assertThat(count()).isZero();
        verify(actuals,never()).saveAllowOverlap(any(),any(),any());verify(plans,never()).create(any(),any(),any(),any(),any(),any(),any(),any());
        var accepted=service.paste(new Paste(request,true));assertThat(accepted.committed()).isTrue();assertThat(count()).isEqualTo(2);
        assertThat(accepted.results().get(2).created()).isNull();assertThat(accepted.results().get(0).created().id()).isNotEqualTo(accepted.results().get(1).created().id());
    }
    @Test void overlapsWithinBatchAreAllowed() {
        var result=service.paste(new Paste(List.of(plan(),actual(10),actual(10)),false));
        assertThat(result.committed()).isTrue();assertThat(count()).isEqualTo(3);assertThat(result.results().get(2).error()).isNull();
    }
    @Test void invalidNonActualIsPreflightedAndCannotBeSilentlyExcluded() {
        doThrow(new InvalidRequestException("invalid Planning time")).when(plans).validateNew(any());
        var result=service.paste(new Paste(List.of(actual(10),plan()),true));
        assertThat(result.committed()).isFalse();assertThat(count()).isZero();verify(actuals,never()).saveAllowOverlap(any(),any(),any());
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
        verify(actuals,times(2)).saveAllowOverlap(item.sourceType(),null,item.actual());
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
        when(users.getCurrentUserId()).thenReturn(user);assertThat(service.restore(token)).containsExactly(ref);assertThat(count()).isEqualTo(1);
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void snapshotRejectsOtherOwnersAndDoesNotIncludeSourceIdentity() {
        assertThatThrownBy(()->service.snapshot(List.of(new Ref(Kind.PLAN,UUID.randomUUID(),null)))).isInstanceOf(ResourceNotFoundException.class);
        var id=UUID.randomUUID();when(actuals.get(ActualSourceType.LIFE_TIME_ENTRY,id)).thenReturn(new CalendarActualEditorDto(ActualSourceType.LIFE_TIME_ENTRY,id,date,null,"Original",35,LocalTime.of(9,5),LocalTime.of(9,40),"Memo",null));
        assertThat(service.snapshot(List.of(new Ref(Kind.ACTUAL,id,ActualSourceType.LIFE_TIME_ENTRY))).getFirst().actual().durationMinutes()).isEqualTo(35);
    }
    @Test void planUndoRestoresOriginalIdentityAndExecutionRelationship() {
        var p=new PlannedTimeBlock(user,PlanDomainType.LIFE,"Linked",AppTimeZone.toStored(date.atTime(9,0)),AppTimeZone.toStored(date.atTime(10,0)),null,null,null,null);
        var link=new CalendarExecutionService.Execution(p.getId(),ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID(),false,null,null);
        when(executions.list()).thenReturn(List.of(link));when(rows.findByIdAndUserId(p.getId(),user)).thenReturn(Optional.of(p));
        var ref=new Ref(Kind.PLAN,p.getId(),null);var token=service.delete(List.of(ref)).undoToken();
        assertThat(service.restore(token)).containsExactly(ref);verify(executions).restoreLink(link);
    }
    @Test void runningActualRequiresExecutionCancelAndCannotBeOrphanedByDeleteUndo() {
        var link=new CalendarExecutionService.Execution(UUID.randomUUID(),ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID(),true,date.atTime(9,0),null);
        when(executions.list()).thenReturn(List.of(link));
        assertThatThrownBy(()->service.delete(List.of(new Ref(Kind.ACTUAL,link.sourceId(),link.sourceType())))).isInstanceOf(InvalidRequestException.class);
        verify(actuals,never()).delete(any(),any());
    }
    @Test void mixedPasteEvaluatesEachActualTargetDateAndRetainsFuturePlanMetadata() {
        var today=LocalDate.now(AppTimeZone.ZONE);
        var items=List.of(today.minusDays(1),today,today.plusDays(1)).stream().map(day->new Item(Kind.ACTUAL,null,ActualSourceType.LIFE_TIME_ENTRY,new CalendarActualEditRequest(day,null,"Copy",35,LocalTime.of(9,5),LocalTime.of(9,40),"Memo",null),null)).toList();
        var result=service.paste(new Paste(items,false));
        assertThat(result.committed()).isTrue();
        assertThat(result.results().stream().map(r->r.created().kind())).containsExactly(Kind.ACTUAL,Kind.ACTUAL,Kind.PLAN);
        var captor=org.mockito.ArgumentCaptor.forClass(PlannedTimeBlockRequest.class);verify(plans).saveRequest(isNull(),captor.capture());
        var p=captor.getValue();assertThat(p.startAt()).isEqualTo(today.plusDays(1).atTime(9,5));assertThat(p.endAt()).isEqualTo(today.plusDays(1).atTime(9,40));assertThat(p.durationMinutes()).isEqualTo(35);assertThat(p.memo()).isEqualTo("Memo");
    }
}
