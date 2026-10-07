package com.kafka.backend.calendar;

import com.kafka.backend.activitycategory.*;
import com.kafka.backend.common.*;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.lifetime.*;
import com.kafka.backend.project.PhaseRepository;
import com.kafka.backend.workrecord.*;
import com.kafka.backend.worktimeentry.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BatchActualServiceTest {
    final UUID user=UUID.randomUUID();final LocalDate day=LocalDate.of(2026,7,13);
    final CurrentUserProvider users=mock(CurrentUserProvider.class);
    final WorkRecordRepository records=mock(WorkRecordRepository.class);
    final WorkTimeEntryRepository work=mock(WorkTimeEntryRepository.class);
    final LifeTimeEntryRepository life=mock(LifeTimeEntryRepository.class);
    final ActivityCategoryRepository categories=mock(ActivityCategoryRepository.class);
    final ActualOverlapChecker overlap=mock(ActualOverlapChecker.class);
    final BatchActualService service=new BatchActualService(users,records,work,life,categories,mock(LifeCategoryRepository.class),mock(PhaseRepository.class),overlap);
    @BeforeEach void setup(){when(users.getCurrentUserId()).thenReturn(user);when(overlap.scheduledIntervals(user,day)).thenReturn(List.of());}
    BatchActualItemRequest life(String title){return new BatchActualItemRequest(null,"LIFE",title,null,null,LocalTime.of(9,0),LocalTime.of(9,30),30,"memo");}
    @Test void intentionalIdenticalBatchItemsCreateIndependentSourceReferences() {
        var result=service.commit(day,List.of(life("Same"),life("Same")));
        assertThat(result.committed()).isTrue();assertThat(result.results().get(0).sourceId()).isNotEqualTo(result.results().get(1).sourceId());
        verify(life,times(2)).save(any());
    }
    @Test void nonidenticalOverlappingBatchRollsBackBeforeAnyCreation() {
        assertThat(service.commit(day,List.of(life("One"),life("Two"))).committed()).isFalse();verify(life,never()).save(any());
    }
    @Test void workBatchAppendsAfterMaximumPositionWhenAnEarlierSiblingWasDeleted() {
        var record=new WorkRecord(user,day);var category=new ActivityCategory(user,"Work",UUID.randomUUID(),false);
        when(records.findByUserIdAndWorkDate(user,day)).thenReturn(Optional.of(record));
        when(categories.findByIdAndUserId(category.getId(),user)).thenReturn(Optional.of(category));
        when(work.findByWorkRecordIdOrderByPositionAsc(record.getId())).thenReturn(List.of(new WorkTimeEntry(UUID.randomUUID(),user,record.getId(),category.getId(),"Retained",30,null,4)));
        var item=new BatchActualItemRequest(null,"WORK","Same",category.getId(),null,null,null,30,null);
        assertThat(service.commit(day,List.of(item,item)).committed()).isTrue();
        var saved=org.mockito.ArgumentCaptor.forClass(WorkTimeEntry.class);verify(work,times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(WorkTimeEntry::getPosition).containsExactly(5,6);
    }
}
