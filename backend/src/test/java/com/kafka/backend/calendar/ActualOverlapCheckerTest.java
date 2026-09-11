package com.kafka.backend.calendar;
import com.kafka.backend.common.*;
import com.kafka.backend.lifetime.*;
import com.kafka.backend.supplementalwork.*;
import com.kafka.backend.workrecord.*;
import com.kafka.backend.worktimeentry.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ActualOverlapCheckerTest {
    @ParameterizedTest @EnumSource(ActualSourceType.class)
    void rejectsEverySourceAgainstWorkAndLifeButAllowsTouchingAndSelf(ActualSourceType source){
        UUID user=UUID.randomUUID();LocalDate day=LocalDate.of(2026,9,9);
        var records=mock(WorkRecordRepository.class);var work=mock(WorkTimeEntryRepository.class);
        var supplemental=mock(SupplementalWorkEntryRepository.class);var life=mock(LifeTimeEntryRepository.class);
        var checker=new ActualOverlapChecker(records,work,supplemental,life);
        WorkRecord record=new WorkRecord(user,day);when(records.findByUserIdAndWorkDate(user,day)).thenReturn(Optional.of(record));
        OffsetDateTime start=AppTimeZone.toStored(day.atTime(9,0)),end=AppTimeZone.toStored(day.atTime(10,0));
        WorkTimeEntry w=new WorkTimeEntry(UUID.randomUUID(),user,record.getId(),UUID.randomUUID(),"Work",60,null,0);w.schedule(start,end);
        when(work.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(w));
        assertThatThrownBy(()->checker.assertNoConflict(user,day,start,end,source,null)).isInstanceOf(InvalidRequestException.class);
        checker.assertNoConflict(user,day,end,end.plusHours(1),source,null);
        checker.assertNoConflict(user,day,start,end,ActualSourceType.WORK_TIME_ENTRY,w.getId());
        when(work.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of());
        LifeTimeEntry l=new LifeTimeEntry(user,day,null,"Life",60,start,end,null);
        when(life.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(user,day,day)).thenReturn(List.of(l));
        assertThatThrownBy(()->checker.assertNoConflict(user,day,start,end,source,null)).isInstanceOf(InvalidRequestException.class);
        checker.assertNoConflict(user,day,start,end,ActualSourceType.LIFE_TIME_ENTRY,l.getId());
        when(life.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(user,day,day)).thenReturn(List.of());
        SupplementalWorkEntry s=new SupplementalWorkEntry(UUID.randomUUID(),user,record.getId(),UUID.randomUUID(),"Extra",60,start,end,null,0);
        when(supplemental.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(s));
        assertThatThrownBy(()->checker.assertNoConflict(user,day,start,end,source,null)).isInstanceOf(InvalidRequestException.class);
    }
    @org.junit.jupiter.api.Test
    void finalAggregateChecksLifeAgainstRetainedWorkButNotRemovedRows() {
        UUID user=UUID.randomUUID(); LocalDate day=LocalDate.of(2026,9,9);
        var records=mock(WorkRecordRepository.class); var work=mock(WorkTimeEntryRepository.class);
        var supplemental=mock(SupplementalWorkEntryRepository.class); var life=mock(LifeTimeEntryRepository.class);
        var checker=new ActualOverlapChecker(records,work,supplemental,life);
        WorkRecord record=new WorkRecord(user,day);
        when(records.findByUserIdAndWorkDate(user,day)).thenReturn(Optional.of(record));
        var start=AppTimeZone.toStored(day.atTime(9,0)); var end=start.plusHours(1);
        WorkTimeEntry w=new WorkTimeEntry(UUID.randomUUID(),user,record.getId(),UUID.randomUUID(),"Work",60,null,0);
        w.schedule(start,end);
        when(work.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(w));
        when(life.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(user,day,day))
                .thenReturn(List.of(new LifeTimeEntry(user,day,null,"Life",60,start,end,null)));
        assertThatThrownBy(()->checker.assertDayHasNoConflict(user,day)).isInstanceOf(InvalidRequestException.class);
        when(work.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of());
        checker.assertDayHasNoConflict(user,day);
    }
}
