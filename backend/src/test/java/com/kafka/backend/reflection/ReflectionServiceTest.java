package com.kafka.backend.reflection;
import com.kafka.backend.calendar.*;
import com.kafka.backend.checklist.ChecklistDailyEntryRepository;
import com.kafka.backend.notesystem.integration.ReflectionProvider;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class ReflectionServiceTest {
    @Test void completionKeepsUnscheduledSourcesAndRecompletionRegeneratesSnapshot() {
        UUID owner=UUID.randomUUID();LocalDate date=LocalDate.of(2026,9,9);
        ReflectionEntry entry=new ReflectionEntry(owner,date);ReflectionTestUtils.setField(entry,"version",0);
        ReflectionEntryRepository repository=mock(ReflectionEntryRepository.class);
        CalendarService calendar=mock(CalendarService.class);
        ChecklistDailyEntryRepository checklist=mock(ChecklistDailyEntryRepository.class);
        when(repository.findById(entry.getId())).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(i->i.getArgument(0));
        var unscheduled=new CalendarUnscheduledActualDto(ActualSourceType.LIFE_TIME_ENTRY,UUID.randomUUID(),"LIFE",date,"Rest",45,null,null,null,"full source memo");
        when(calendar.findInRange(date,date)).thenReturn(new CalendarRangeResponse(List.of(),List.of(),List.of(unscheduled),List.of(),List.of(),List.of()));
        ReflectionProvider provider=new ReflectionService(repository,calendar,checklist);
        var first=provider.complete(owner,entry.getId(),0);
        assertThat(first.status()).isEqualTo(ReflectionProvider.ReflectionEntryStatus.COMPLETED);
        assertThat(first.snapshot().unscheduledActual()).containsExactly(unscheduled);
        assertThat(first.snapshot().lifeSummary().actualMinutes()).isEqualTo(45);
        assertThat(provider.frozenSnapshot(owner,entry.getId()).unscheduledActual()).containsExactly(unscheduled);
        provider.reopen(owner,entry.getId(),0);provider.updateMain(owner,entry.getId(),"edited",0);
        when(calendar.findInRange(date,date)).thenReturn(new CalendarRangeResponse(List.of(),List.of(),List.of(),List.of(),List.of(),List.of()));
        var second=provider.complete(owner,entry.getId(),0);
        assertThat(second.content()).isEqualTo("edited");assertThat(second.snapshot().unscheduledActual()).isEmpty();
        assertThat(second.snapshot().lifeSummary().actualMinutes()).isZero();
    }
    @Test void olderSnapshotWithoutUnscheduledPropertyStillLoads(){
        var snapshot=new ReflectionProvider.Snapshot(LocalDate.now(),Instant.now(),List.of(),List.of(),List.of(),new ReflectionProvider.WorkSummary(0,0),new ReflectionProvider.TimeSummary(0,0),new ReflectionProvider.ChecklistSummary(0,0),null);
        assertThat(snapshot.unscheduledActual()).isEmpty();
    }
}
