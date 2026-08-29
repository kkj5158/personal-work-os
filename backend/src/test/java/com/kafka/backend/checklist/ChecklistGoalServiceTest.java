package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChecklistGoalServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.now(AppTimeZone.ZONE);

    @Mock
    private ChecklistGlobalGoalRepository repository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private ChecklistGoalService newService() {
        return new ChecklistGoalService(repository, currentUserProvider);
    }

    @Test
    void effectiveGoalPercentFallsBackToTheDefaultWhenNoneIsConfigured() {
        when(repository.findFirstByUserIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(USER_ID, TODAY))
                .thenReturn(Optional.empty());

        assertThat(newService().effectiveGoalPercent(USER_ID, TODAY)).isEqualTo(80);
    }

    @Test
    void effectiveGoalPercentUsesTheLatestVersionOnOrBeforeTheAskedDate() {
        ChecklistGlobalGoal goal = new ChecklistGlobalGoal(USER_ID, TODAY.minusDays(10), 65);
        when(repository.findFirstByUserIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(USER_ID, TODAY))
                .thenReturn(Optional.of(goal));

        assertThat(newService().effectiveGoalPercent(USER_ID, TODAY)).isEqualTo(65);
    }

    @Test
    void scheduleRejectsAPastEffectiveDate() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);

        ChecklistGoalService service = newService();

        assertThatThrownBy(() -> service.schedule(TODAY.minusDays(1), 70))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void scheduleRejectsAnOutOfRangePercent() {
        ChecklistGoalService service = newService();

        assertThatThrownBy(() -> service.schedule(TODAY, 101))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void scheduleUpdatesAnExistingTodayVersionInPlaceRatherThanDuplicating() {
        ChecklistGlobalGoal existing = new ChecklistGlobalGoal(USER_ID, TODAY, 70);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndEffectiveFrom(USER_ID, TODAY)).thenReturn(Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        ChecklistGlobalGoal updated = newService().schedule(TODAY, 90);

        assertThat(updated.getGoalPercent()).isEqualTo(90);
    }

    @Test
    void deleteFutureVersionRejectsATodayDatedVersionEvenThoughItIsStillEditable() {
        // Today is still freely *editable* (schedule() allows it), but per
        // docs/backend/checklist.md the delete boundary is stricter — only a
        // STRICTLY future version may ever be deleted, matching
        // ChecklistItemService's identical rule for item versions.
        ChecklistGlobalGoal today = new ChecklistGlobalGoal(USER_ID, TODAY, 80);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findById(today.getId())).thenReturn(Optional.of(today));

        ChecklistGoalService service = newService();

        assertThatThrownBy(() -> service.deleteFutureVersion(today.getId()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void deleteFutureVersionRejectsAVersionThatHasAlreadyApplied() {
        ChecklistGlobalGoal past = new ChecklistGlobalGoal(USER_ID, TODAY.minusDays(1), 80);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findById(past.getId())).thenReturn(Optional.of(past));

        ChecklistGoalService service = newService();

        assertThatThrownBy(() -> service.deleteFutureVersion(past.getId()))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void deleteFutureVersionAllowsDeletingAStrictlyFutureVersion() {
        ChecklistGlobalGoal future = new ChecklistGlobalGoal(USER_ID, TODAY.plusDays(5), 80);
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findById(future.getId())).thenReturn(Optional.of(future));

        newService().deleteFutureVersion(future.getId());
        // No exception — success.
    }
}
