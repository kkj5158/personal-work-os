package com.kafka.backend.starttimecriterion;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StartTimeCriterionServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private StartTimeCriterionRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    @Test
    void listsOnlyCriteriaOwnedByTheCurrentUser() {
        StartTimeCriterion owned = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdOrderBySortOrderAscNameAsc(USER_ID)).thenReturn(List.of(owned));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        assertThat(service.list()).containsExactly(owned);
    }

    @Test
    void createsAValidCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion created = service.create("오후 출근", LocalTime.of(15, 0));

        assertThat(created.getName()).isEqualTo("오후 출근");
        assertThat(created.getStartTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(created.getIsActive()).isTrue();
    }

    @Test
    void trimsTheNameOnCreate() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion created = service.create("  오후 출근  ", LocalTime.of(15, 0));

        assertThat(created.getName()).isEqualTo("오후 출근");
    }

    @Test
    void rejectsABlankName() {
        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.create("   ", LocalTime.of(15, 0)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAMissingStartTimeOnCreate() {
        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.create("오후 출근", null))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void updatesAnOwnedCriterion() {
        StartTimeCriterion existing = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion updated = service.update(existing.getId(), "저녁 출근", LocalTime.of(19, 0), false);

        assertThat(updated.getName()).isEqualTo("저녁 출근");
        assertThat(updated.getStartTime()).isEqualTo(LocalTime.of(19, 0));
        assertThat(updated.getIsActive()).isFalse();
    }

    @Test
    void reactivatesAnOwnedCriterion() {
        StartTimeCriterion existing = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0);
        existing.update(existing.getName(), existing.getStartTime(), false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion updated = service.update(existing.getId(), existing.getName(), existing.getStartTime(), true);

        assertThat(updated.getIsActive()).isTrue();
    }

    @Test
    void rejectsUpdateOfAMissingOrForeignOwnedCriterion() {
        UUID missingId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(missingId, USER_ID)).thenReturn(Optional.empty());

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.update(missingId, "오후 출근", LocalTime.of(15, 0), true))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsUpdateWithABlankName() {
        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        assertThatThrownBy(() -> service.update(UUID.randomUUID(), "  ", LocalTime.of(15, 0), true))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void firstCriterionForAUserReceivesSortOrderZero() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findTopByUserIdOrderBySortOrderDesc(USER_ID)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion created = service.create("오후 출근", LocalTime.of(15, 0));

        assertThat(created.getSortOrder()).isEqualTo(0);
    }

    @Test
    void secondCriterionForTheSameUserReceivesSortOrderOne() {
        StartTimeCriterion first = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findTopByUserIdOrderBySortOrderDesc(USER_ID)).thenReturn(Optional.of(first));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion created = service.create("저녁 출근", LocalTime.of(19, 0));

        assertThat(created.getSortOrder()).isEqualTo(1);
    }

    @Test
    void anotherUserIndependentlyStartsAtSortOrderZero() {
        UUID otherUserId = UUID.randomUUID();
        // First user already has a criterion at sortOrder 1, but the next-order
        // lookup is scoped to otherUserId only — first user's data must never
        // leak into the second user's calculation.
        when(currentUserProvider.getCurrentUserId()).thenReturn(otherUserId);
        when(repository.findTopByUserIdOrderBySortOrderDesc(otherUserId)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion created = service.create("오후 출근", LocalTime.of(15, 0));

        assertThat(created.getSortOrder()).isEqualTo(0);
    }

    @Test
    void updatePreservesTheExistingSortOrder() {
        StartTimeCriterion existing = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 3);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByIdAndUserId(existing.getId(), USER_ID)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        StartTimeCriterionService service = new StartTimeCriterionService(repository, currentUserProvider);

        StartTimeCriterion updated = service.update(existing.getId(), "저녁 출근", LocalTime.of(19, 0), false);

        assertThat(updated.getSortOrder()).isEqualTo(3);
    }
}
