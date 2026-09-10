package com.kafka.backend.calendar;

import com.kafka.backend.activitycategory.*;
import com.kafka.backend.common.*;
import com.kafka.backend.lifecategory.*;
import com.kafka.backend.lifetime.*;
import com.kafka.backend.project.PhaseRepository;
import com.kafka.backend.supplementalwork.*;
import com.kafka.backend.workrecord.*;
import com.kafka.backend.worktimeentry.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CalendarActualEditorServiceTest {
    final UUID user=UUID.randomUUID();
    final LocalDate day=LocalDate.of(2026,9,9);
    final WorkTimeEntryRepository work=mock(WorkTimeEntryRepository.class);
    final SupplementalWorkEntryRepository supplemental=mock(SupplementalWorkEntryRepository.class);
    final LifeTimeEntryRepository life=mock(LifeTimeEntryRepository.class);
    final WorkRecordRepository records=mock(WorkRecordRepository.class);
    final ActivityCategoryRepository workCategories=mock(ActivityCategoryRepository.class);
    final LifeCategoryRepository lifeCategories=mock(LifeCategoryRepository.class);
    final CurrentUserProvider users=mock(CurrentUserProvider.class);
    final ActualOverlapChecker overlap=mock(ActualOverlapChecker.class);
    final PhaseRepository phases=mock(PhaseRepository.class);
    CalendarActualEditorService service=new CalendarActualEditorService(work,supplemental,life,records,workCategories,lifeCategories,users,overlap,phases);
    final ActivityCategory category=new ActivityCategory(user,"Work",UUID.randomUUID(),false);
    WorkRecord original=new WorkRecord(user,day),target=new WorkRecord(user,day.plusDays(1));
    @BeforeEach void setup(){
        when(users.getCurrentUserId()).thenReturn(user);
        when(records.findById(original.getId())).thenReturn(Optional.of(original));
        when(records.findById(target.getId())).thenReturn(Optional.of(target));
        when(records.findByUserIdAndWorkDate(user,day.plusDays(1))).thenReturn(Optional.of(target));
        when(workCategories.findByIdAndUserId(category.getId(),user)).thenReturn(Optional.of(category));
        when(work.save(any())).thenAnswer(i->i.getArgument(0));
        when(supplemental.save(any())).thenAnswer(i->i.getArgument(0));
        when(life.save(any())).thenAnswer(i->i.getArgument(0));
    }
    CalendarActualEditRequest request(ActualSourceType type){return new CalendarActualEditRequest(day.plusDays(1),type==ActualSourceType.LIFE_TIME_ENTRY ? null:category.getId()," Edited ",75,LocalTime.of(9,0),LocalTime.of(10,0)," Memo ",null);}
    UUID existing(ActualSourceType type){
        UUID id=UUID.randomUUID();
        switch(type){
            case WORK_TIME_ENTRY -> when(work.findByIdAndUserId(id,user)).thenReturn(Optional.of(new WorkTimeEntry(id,user,original.getId(),category.getId(),"Before",30,"Old",0)));
            case SUPPLEMENTAL_WORK_ENTRY -> when(supplemental.findByIdAndUserId(id,user)).thenReturn(Optional.of(new SupplementalWorkEntry(id,user,original.getId(),category.getId(),"Before",30,null,null,"Old",0)));
            case LIFE_TIME_ENTRY -> {LifeTimeEntry e=new LifeTimeEntry(user,day,null,"Before",30,null,null,"Old");id=e.getId();when(life.findByIdAndUserId(id,user)).thenReturn(Optional.of(e));}
        }
        return id;
    }
    @ParameterizedTest @EnumSource(ActualSourceType.class)
    void fullEditorMovesOriginalSourceIdentityAndPreservesExplicitDuration(ActualSourceType type){
        UUID id=existing(type);
        var result=service.save(type,id,request(type));
        assertThat(result.id()).isEqualTo(id);assertThat(result.date()).isEqualTo(day.plusDays(1));
        assertThat(result.title()).isEqualTo("Edited");assertThat(result.memo()).isEqualTo("Memo");
        assertThat(result.durationMinutes()).isEqualTo(75);
        verify(overlap).assertNoConflict(eq(user),eq(day.plusDays(1)),any(),any(),eq(type),eq(id));
        verify(records,never()).save(any());
    }
    @ParameterizedTest @EnumSource(ActualSourceType.class)
    void globalConflictPreventsMutation(ActualSourceType type){
        UUID id=existing(type);
        doThrow(new InvalidRequestException("overlap")).when(overlap).assertNoConflict(any(),any(),any(),any(),any(),any());
        assertThatThrownBy(()->service.save(type,id,request(type))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.get(type,id).title()).isEqualTo("Before");
        verify(work,never()).save(any());verify(supplemental,never()).save(any());verify(life,never()).save(any());
    }
    @ParameterizedTest @EnumSource(ActualSourceType.class)
    void deleteUndoRetainsSourceIdentityAndIsUserScoped(ActualSourceType type){
        UUID id=existing(type);UUID token=service.delete(type,id).undoToken();
        when(users.getCurrentUserId()).thenReturn(UUID.randomUUID());
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
        when(users.getCurrentUserId()).thenReturn(user);
        var restored=service.restore(token);assertThat(restored.id()).isEqualTo(id);assertThat(restored.title()).isEqualTo("Before");
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void workCreationNeverFabricatesAttendance(){
        when(records.findByUserIdAndWorkDate(user,day.plusDays(1))).thenReturn(Optional.empty());
        assertThatThrownBy(()->service.save(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY,null,request(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY))).isInstanceOf(InvalidRequestException.class);
        verify(records,never()).save(any());verify(supplemental,never()).save(any());
    }
    @Test void rejectsRegularWorkOnNonworkingDate(){
        target.applyChanges(WorkAttendanceStatus.DAY_OFF,null,null,null,null,null,null,null,null,null,null,false,null);
        UUID id=existing(ActualSourceType.WORK_TIME_ENTRY);
        assertThatThrownBy(()->service.save(ActualSourceType.WORK_TIME_ENTRY,id,request(ActualSourceType.WORK_TIME_ENTRY))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void rejectsSupplementalOverlapWithRegularAttendance(){
        target.applyChanges(WorkAttendanceStatus.WORK,AppTimeZone.toStored(day.plusDays(1).atTime(8,0)),AppTimeZone.toStored(day.plusDays(1).atTime(18,0)),null,null,null,null,null,null,null,null,false,null);
        UUID id=existing(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY);
        assertThatThrownBy(()->service.save(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY,id,request(ActualSourceType.SUPPLEMENTAL_WORK_ENTRY))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void foreignSourceCannotBeReadOrDeleted(){
        assertThatThrownBy(()->service.get(ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.delete(ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void partialScheduleRejected(){
        var r=new CalendarActualEditRequest(day,null,"Bad",30,LocalTime.NOON,null,null,null);
        assertThatThrownBy(()->service.save(ActualSourceType.LIFE_TIME_ENTRY,null,r)).isInstanceOf(InvalidRequestException.class);
    }
    @Test void appendAfterDeletionUsesMaximumPositionNotListSize(){
        when(work.findByWorkRecordIdOrderByPositionAsc(target.getId())).thenReturn(List.of(
            new WorkTimeEntry(UUID.randomUUID(),user,target.getId(),category.getId(),"Sibling",30,null,4)));
        var result=service.save(ActualSourceType.WORK_TIME_ENTRY,null,request(ActualSourceType.WORK_TIME_ENTRY));
        var captor=org.mockito.ArgumentCaptor.forClass(WorkTimeEntry.class);
        verify(work).save(captor.capture());assertThat(captor.getValue().getPosition()).isEqualTo(5);
    }
    @Test void undoConflictRetainsTokenForRetry(){
        UUID id=existing(ActualSourceType.LIFE_TIME_ENTRY);
        LifeTimeEntry entry=life.findByIdAndUserId(id,user).orElseThrow();
        entry.schedule(AppTimeZone.toStored(day.atTime(9,0)),AppTimeZone.toStored(day.atTime(10,0)));
        UUID token=service.delete(ActualSourceType.LIFE_TIME_ENTRY,id).undoToken();
        doThrow(new InvalidRequestException("overlap")).when(overlap).assertNoConflict(any(),any(),any(),any(),any(),isNull());
        assertThatThrownBy(()->service.restore(token)).isInstanceOf(InvalidRequestException.class);
        verify(life,never()).save(any());
        doNothing().when(overlap).assertNoConflict(any(),any(),any(),any(),any(),isNull());
        assertThat(service.restore(token).id()).isEqualTo(id);
    }
    @Test void concurrentUndoCannotConsumeTheSameTokenTwice() throws Exception {
        UUID id=existing(ActualSourceType.LIFE_TIME_ENTRY);
        UUID token=service.delete(ActualSourceType.LIFE_TIME_ENTRY,id).undoToken();
        var entered=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        when(life.save(any())).thenAnswer(i->{entered.countDown();
            if(!release.await(5,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Timed out");
            return i.getArgument(0);});
        try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var first=executor.submit(()->service.restore(token));
            try {
                assertThat(entered.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(()->service.restore(token)).isInstanceOf(ResourceNotFoundException.class);
            } finally { release.countDown(); }
            assertThat(first.get(5,java.util.concurrent.TimeUnit.SECONDS).id()).isEqualTo(id);
        }
        verify(life,times(1)).save(any());
    }
}
