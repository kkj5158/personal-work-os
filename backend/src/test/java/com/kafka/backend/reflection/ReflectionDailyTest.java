package com.kafka.backend.reflection;

import com.kafka.backend.calendar.CalendarService;
import com.kafka.backend.checklist.ChecklistDailyEntryRepository;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReflectionDailyTest {
    final UUID owner = UUID.randomUUID();
    final ReflectionEntry entry = new ReflectionEntry(owner, LocalDate.of(2026, 10, 24));
    final ReflectionEntryRepository repository = mock(ReflectionEntryRepository.class);
    final ReflectionService service = new ReflectionService(repository, mock(CalendarService.class), mock(ChecklistDailyEntryRepository.class));
    ReflectionDailyTest() {
        ReflectionTestUtils.setField(entry, "version", 3);
        when(repository.findById(entry.getId())).thenReturn(Optional.of(entry));
        when(repository.saveAndFlush(entry)).thenAnswer(call -> {
            ReflectionTestUtils.setField(entry, "version", entry.getVersion() + 1);
            return entry;
        });
    }
    @Test void optionalZeroAndAllMoodsRemainIndependentAndCanBeCleared() {
        for (int mood = 1; mood <= 5; mood++) {
            var result = service.updateDaily(owner, entry.getId(), "A day", 0, mood, "line one\nline two", entry.getVersion());
            assertThat(result.dayScore()).isZero();
            assertThat(result.moodLevel()).isEqualTo(mood);
            assertThat(result.title()).isEqualTo("A day");
        }
        assertThat(service.updateDaily(owner, entry.getId(), null, 100, null, null, entry.getVersion()).dayScore()).isEqualTo(100);
        var empty = service.updateDaily(owner, entry.getId(), null, null, null, null, entry.getVersion());
        assertThat(empty.dayScore()).isNull(); assertThat(empty.moodLevel()).isNull();
        assertThat(empty.title()).isNull(); assertThat(empty.memo()).isNull();
    }
    @Test void rejectsOutOfBoundsAndMultilineTitleWithoutMutating() {
        for (int score : new int[]{-1,101}) assertThatThrownBy(() -> service.updateDaily(owner, entry.getId(),null,score,null,null,3)).isInstanceOf(InvalidRequestException.class);
        for (int mood : new int[]{0,6}) assertThatThrownBy(() -> service.updateDaily(owner, entry.getId(),null,null,mood,null,3)).isInstanceOf(InvalidRequestException.class);
        for (String title : List.of("x".repeat(101), "one\ntwo", "one\rtwo")) assertThatThrownBy(() -> service.updateDaily(owner, entry.getId(),title,null,null,null,3)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.updateDaily(owner, entry.getId(),null,null,null,"x".repeat(10001),3)).isInstanceOf(InvalidRequestException.class);
        verify(repository, never()).saveAndFlush(any());
        assertThat(entry.getDayScore()).isNull();
    }
    @Test void rejectsStaleVersionAndOtherOwner() {
        assertThatThrownBy(() -> service.updateDaily(owner, entry.getId(),"draft",72,4,null,2)).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(() -> service.updateDaily(UUID.randomUUID(), entry.getId(),"draft",72,4,null,3)).isInstanceOf(ResourceNotFoundException.class);
        verify(repository, never()).saveAndFlush(any());
    }
    @Test void annotationsPreserveCompletedSnapshotContentAndNoteUpdatesPreserveAnnotations() {
        entry.updateContent("NOTE body");
        entry.complete("{\"date\":\"2026-10-24\",\"generatedAt\":\"2026-10-24T00:00:00Z\",\"plannedBlocks\":[],\"actualBlocks\":[],\"stateBlocks\":[],\"workSummary\":{\"plannedMinutes\":0,\"actualMinutes\":60},\"lifeSummary\":{\"plannedMinutes\":0,\"actualMinutes\":0},\"checklistSummary\":{\"completed\":0,\"total\":0}}");
        String frozen = entry.getSnapshotJson();
        var daily = service.updateDaily(owner, entry.getId(),"title",72,1,"memo",3);
        assertThat(daily.content()).isEqualTo("NOTE body");
        assertThat(daily.status().name()).isEqualTo("COMPLETED");
        assertThat(entry.getSnapshotJson()).isEqualTo(frozen);
        assertThat(daily.version()).isEqualTo(4);
        var note = service.updateMain(owner, entry.getId(),"updated NOTE",4);
        assertThat(note.dayScore()).isEqualTo(72); assertThat(note.moodLevel()).isEqualTo(1);
        assertThat(note.title()).isEqualTo("title"); assertThat(note.memo()).isEqualTo("memo");
        assertThat(entry.getSnapshotJson()).isEqualTo(frozen);
    }
    @Test void rejectsFractionalAndOverflowJsonNumbers() {
        assertThatThrownBy(() -> new ReflectionDailyRequest(null,new java.math.BigDecimal("72.5"),null,null,0).dayScoreValue()).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> new ReflectionDailyRequest(null,null,new java.math.BigDecimal("4.2"),null,0).moodLevelValue()).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> new ReflectionDailyRequest(null,new java.math.BigDecimal("999999999999"),null,null,0).dayScoreValue()).isInstanceOf(InvalidRequestException.class);
    }
}
