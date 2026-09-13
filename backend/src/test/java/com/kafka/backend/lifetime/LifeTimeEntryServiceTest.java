package com.kafka.backend.lifetime;

import com.kafka.backend.calendar.ActualOverlapChecker;
import com.kafka.backend.common.*;
import com.kafka.backend.lifecategory.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LifeTimeEntryServiceTest {
    final LifeTimeEntryRepository repository = mock(LifeTimeEntryRepository.class);
    final LifeCategoryRepository categories = mock(LifeCategoryRepository.class);
    final CurrentUserProvider users = mock(CurrentUserProvider.class);
    final ActualOverlapChecker overlap = mock(ActualOverlapChecker.class);
    final LifeTimeEntryService service = new LifeTimeEntryService(repository, categories, users, overlap);
    final UUID user = UUID.randomUUID();
    final LocalDate day = LocalDate.of(2026, 9, 11);

    @Test void scheduledLifeDerivesDurationAndRejectsOneMinutePrecision() {
        when(users.getCurrentUserId()).thenReturn(user);
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        var start = AppTimeZone.toStored(day.atTime(10, 5));
        var end = AppTimeZone.toStored(day.atTime(11, 35));
        assertThat(service.create(day, null, "exercise", null, start, end, null).getDurationMinutes()).isEqualTo(90);
        assertThatThrownBy(() -> service.create(day, null, "exercise", 90, start.plusMinutes(1), end, null)).isInstanceOf(InvalidRequestException.class);
    }
    @Test void rejectsNewInactiveCategoryButPreservesExistingReference() {
        UUID categoryId = UUID.randomUUID();
        LifeCategory category = mock(LifeCategory.class);
        when(users.getCurrentUserId()).thenReturn(user);
        when(categories.findByIdAndUserId(categoryId, user)).thenReturn(Optional.of(category));
        when(category.getIsActive()).thenReturn(false);
        assertThatThrownBy(() -> service.create(day, categoryId, "exercise", 30, null, null, null)).isInstanceOf(InvalidRequestException.class);
        var existing = new LifeTimeEntry(user, day, categoryId, "exercise", 30, null, null, null);
        when(repository.findByIdAndUserId(existing.getId(), user)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(service.update(existing.getId(), categoryId, "exercise", 30, null, null, "memo").getLifeCategoryId()).isEqualTo(categoryId);
    }
}
