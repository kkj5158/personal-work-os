package com.kafka.backend.calendarvisualgroup;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CalendarVisualGroupServiceTest {
    final CalendarVisualGroupRepository repository=mock(CalendarVisualGroupRepository.class);
    final CurrentUserProvider users=mock(CurrentUserProvider.class);
    final CalendarVisualGroupService service=new CalendarVisualGroupService(repository,users);
    final UUID owner=UUID.randomUUID();
    final LocalDate start=LocalDate.of(2026,9,14),end=LocalDate.of(2026,10,15);
    @BeforeEach void setup(){when(users.getCurrentUserId()).thenReturn(owner);when(repository.saveAndFlush(any())).thenAnswer(i->i.getArgument(0));}
    VisualGroupRequest request(VisualGroupTimeRule rule,LocalTime from,LocalTime to,List<Integer> weekdays,List<VisualGroupRequest.Day> days){return new VisualGroupRequest("  Context  ",start,end,rule,"#7F91A3",from,to,weekdays,days);}
    VisualGroupRequest allDay(){return request(VisualGroupTimeRule.ALL_DAY,null,null,null,null);}
    @Test void allDayCanSpanWeeksAndBeEmptyWithoutAnyActivityDependency(){
        var result=service.create(allDay());assertThat(result.title()).isEqualTo("Context");assertThat(result.startDate()).isEqualTo(start);assertThat(result.endDate()).isEqualTo(end);
        assertThat(result.startTime()).isNull();assertThat(result.days()).isEmpty();assertThat(result.color()).isEqualTo("#7f91a3");
        assertThat(result.createdAt()).isNotNull();assertThat(result.updatedAt()).isNotNull();
    }
    @Test void sameTimeRequiresValidPairAndAtLeastOneIsoWeekday(){
        var result=service.create(request(VisualGroupTimeRule.SAME_TIME_EACH_DAY,LocalTime.of(9,5),LocalTime.of(18,5),List.of(5,1,3,1),null));
        assertThat(result.weekdays()).containsExactly(1,3,5);assertThat(result.startTime()).isEqualTo(LocalTime.of(9,5));
        assertThatThrownBy(()->service.create(request(VisualGroupTimeRule.SAME_TIME_EACH_DAY,LocalTime.NOON,LocalTime.of(18,0),List.of(),null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.create(request(VisualGroupTimeRule.SAME_TIME_EACH_DAY,LocalTime.NOON,LocalTime.of(18,0),List.of(0),null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.create(request(VisualGroupTimeRule.SAME_TIME_EACH_DAY,LocalTime.NOON,LocalTime.of(11,0),List.of(1),null))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void perDayStoresEnabledAndOffOverridesAndLeavesMissingDatesOff(){
        var result=service.create(request(VisualGroupTimeRule.PER_DAY,null,null,null,List.of(
                new VisualGroupRequest.Day(start,true,LocalTime.of(9,0),LocalTime.of(18,0)),
                new VisualGroupRequest.Day(start.plusDays(2),false,LocalTime.NOON,null))));
        assertThat(result.days()).hasSize(2);assertThat(result.days().get(1).enabled()).isFalse();assertThat(result.days().get(1).startTime()).isNull();
        assertThat(result.days()).noneMatch(d->d.date().equals(start.plusDays(1)));
    }
    @Test void perDayRejectsOutOfRangeDuplicateAndIncompleteOverrides(){
        for(var days:List.of(List.of(new VisualGroupRequest.Day(start.minusDays(1),false,null,null)),
                List.of(new VisualGroupRequest.Day(start,true,LocalTime.NOON,null)),
                List.of(new VisualGroupRequest.Day(start,false,null,null),new VisualGroupRequest.Day(start,false,null,null))))
            assertThatThrownBy(()->service.create(request(VisualGroupTimeRule.PER_DAY,null,null,null,days))).isInstanceOf(InvalidRequestException.class);
        verify(repository,never()).saveAndFlush(any());
    }
    @Test void continuousAcceptsCrossMidnightAndRejectsReversedSingleDay(){
        var result=service.create(request(VisualGroupTimeRule.CONTINUOUS,LocalTime.of(15,0),LocalTime.NOON,null,null));
        assertThat(result.endDate()).isEqualTo(end);assertThat(result.endTime()).isEqualTo(LocalTime.NOON);
        assertThatThrownBy(()->service.create(new VisualGroupRequest("Trip",start,start,VisualGroupTimeRule.CONTINUOUS,"#789abc",LocalTime.of(15,0),LocalTime.NOON,null,null))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void rejectsInvalidRangeTitleColorAndPrecision(){
        assertThatThrownBy(()->service.create(new VisualGroupRequest("Title",end,start,VisualGroupTimeRule.ALL_DAY,"#789abc",null,null,null,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.create(new VisualGroupRequest(" ",start,end,VisualGroupTimeRule.ALL_DAY,"#789abc",null,null,null,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.create(new VisualGroupRequest("Title",start,end,VisualGroupTimeRule.ALL_DAY,"url(bad)",null,null,null,null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.create(request(VisualGroupTimeRule.CONTINUOUS,LocalTime.of(15,1),LocalTime.NOON,null,null))).isInstanceOf(InvalidRequestException.class);
        verify(repository,never()).saveAndFlush(any());
    }
    @Test void queriesIntersectingRangeWithOwnerAndPreservesWholeGroupBoundaries(){
        var group=new CalendarVisualGroup(UUID.randomUUID(),owner);group.apply(service.normalize(allDay()));
        when(repository.findIntersecting(owner,start.plusWeeks(1),start.plusWeeks(2))).thenReturn(List.of(group));
        var result=service.list(start.plusWeeks(1),start.plusWeeks(2)).getFirst();assertThat(result.startDate()).isEqualTo(start);assertThat(result.endDate()).isEqualTo(end);
    }
    @Test void foreignGroupCannotBeReadUpdatedOrDeleted(){
        UUID foreign=UUID.randomUUID();
        assertThatThrownBy(()->service.get(foreign)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.update(foreign,allDay())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.delete(foreign)).isInstanceOf(ResourceNotFoundException.class);
        verify(repository,never()).saveAndFlush(any());verify(repository,never()).delete(any());
    }
    @Test void invalidUpdateDoesNotModifySavedGroup(){
        var group=new CalendarVisualGroup(UUID.randomUUID(),owner);group.apply(service.normalize(allDay()));when(repository.findByIdAndUserId(group.getId(),owner)).thenReturn(Optional.of(group));
        assertThatThrownBy(()->service.update(group.getId(),request(VisualGroupTimeRule.SAME_TIME_EACH_DAY,null,null,List.of(1),null))).isInstanceOf(InvalidRequestException.class);
        assertThat(group.getTimeRule()).isEqualTo(VisualGroupTimeRule.ALL_DAY);
    }
    @Test void deleteUndoPreservesIdentityAndOverridesAndIsOwnerScopedSingleUse(){
        var group=new CalendarVisualGroup(UUID.randomUUID(),owner);group.apply(service.normalize(request(VisualGroupTimeRule.PER_DAY,null,null,null,List.of(new VisualGroupRequest.Day(start,true,LocalTime.NOON,LocalTime.of(13,0))))));
        when(repository.findByIdAndUserId(group.getId(),owner)).thenReturn(Optional.of(group));
        var token=service.delete(group.getId()).undoToken();verify(repository).delete(group);
        when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
        when(users.getCurrentUserId()).thenReturn(owner);var restored=service.restore(token);
        assertThat(restored.id()).isEqualTo(group.getId());assertThat(restored.days()).hasSize(1);assertThat(restored.createdAt()).isEqualTo(group.getCreatedAt());
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void failedRestoreKeepsTokenAndCannotOverwriteAnExistingId(){
        var group=new CalendarVisualGroup(UUID.randomUUID(),owner);group.apply(service.normalize(allDay()));when(repository.findByIdAndUserId(group.getId(),owner)).thenReturn(Optional.of(group));
        var token=service.delete(group.getId()).undoToken();when(repository.existsById(group.getId())).thenReturn(true);
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(InvalidRequestException.class);
        when(repository.existsById(group.getId())).thenReturn(false);assertThat(service.restore(token).id()).isEqualTo(group.getId());
    }
}
