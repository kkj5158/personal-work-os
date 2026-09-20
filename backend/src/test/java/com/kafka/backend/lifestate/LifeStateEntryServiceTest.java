package com.kafka.backend.lifestate;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LifeStateEntryServiceTest {
    final LifeStateEntryRepository repository = mock(LifeStateEntryRepository.class);
    final CurrentUserProvider users = mock(CurrentUserProvider.class);
    final LifeStateEntryService service = new LifeStateEntryService(repository, users);
    final UUID user = UUID.randomUUID();
    final LocalDate day = LocalDate.of(2026, 1, 1);
    OffsetDateTime at(int hour) { return AppTimeZone.toStored(day.atTime(hour, 0)); }

    @Test void stateAndTimeAreRequiredButDescriptionIsOptional() {
        when(users.getCurrentUserId()).thenReturn(user);
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(service.create(day, StateGroup.STABLE, null, at(9), at(10), null).getLabel()).isNull();
        assertThat(service.create(day, StateGroup.LOW, "  ", at(9), at(10), " memo ").getMemo()).isEqualTo("memo");
        assertThatThrownBy(() -> service.create(day, null, null, at(9), at(10), null)).isInstanceOf(InvalidRequestException.class);
    }
    @Test void creationAndEditsAllowFutureState() {
        LocalDate tomorrow = AppTimeZone.toDisplay(OffsetDateTime.now()).toLocalDate().plusDays(1);
        var start = AppTimeZone.toStored(tomorrow.atTime(9, 0));
        var end = AppTimeZone.toStored(tomorrow.atTime(10, 0));
        when(users.getCurrentUserId()).thenReturn(user);
        when(repository.save(any())).thenAnswer(i->i.getArgument(0));
        assertThat(service.create(tomorrow, StateGroup.HIGH, null, start, end, null).getEntryDate()).isEqualTo(tomorrow);
        LifeStateEntry entry = new LifeStateEntry(user, tomorrow, StateGroup.STABLE, "old", start, end, null);
        when(users.getCurrentUserId()).thenReturn(user);
        when(repository.findByIdAndUserId(entry.getId(), user)).thenReturn(Optional.of(entry));
        assertThat(service.update(entry.getId(), StateGroup.LOW, null, start.plusDays(1), end.plusDays(1), null).getEntryDate()).isEqualTo(tomorrow.plusDays(1));
    }
    @Test void historicalDescriptionIsPreservedAndEditable() {
        LifeStateEntry entry = new LifeStateEntry(user, day, StateGroup.STABLE, "historical", at(9), at(10), null);
        when(users.getCurrentUserId()).thenReturn(user);
        when(repository.findByIdAndUserId(entry.getId(), user)).thenReturn(Optional.of(entry));
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));
        assertThat(service.update(entry.getId(), StateGroup.STABLE, "historical", at(9), at(10), "memo").getLabel()).isEqualTo("historical");
        assertThat(service.update(entry.getId(), StateGroup.STABLE, null, at(9), at(10), "memo").getLabel()).isNull();
    }
}
