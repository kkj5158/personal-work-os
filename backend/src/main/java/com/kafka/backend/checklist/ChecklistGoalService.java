package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The shared default achievement goal, effective-dated exactly like
 * {@link ChecklistItemVersion}: a version whose {@code effectiveFrom} is
 * strictly before today has already applied and is immutable; today-or-later
 * versions may be freely edited/deleted (see {@link #isImmutable}).
 */
@Service
public class ChecklistGoalService {

    /** A reasonable out-of-the-box default until the user configures their own. */
    private static final int DEFAULT_GOAL_PERCENT = 80;

    private final ChecklistGlobalGoalRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public ChecklistGoalService(ChecklistGlobalGoalRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<ChecklistGlobalGoal> history() {
        return repository.findByUserIdOrderByEffectiveFromAsc(currentUserProvider.getCurrentUserId());
    }

    /** The goal percent applicable on {@code asOf} — the default when the
     *  user has never configured one at all. */
    public int effectiveGoalPercent(UUID userId, LocalDate asOf) {
        return repository.findFirstByUserIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(userId, asOf)
                .map(ChecklistGlobalGoal::getGoalPercent)
                .orElse(DEFAULT_GOAL_PERCENT);
    }

    public int effectiveGoalPercentForCurrentUser(LocalDate asOf) {
        return effectiveGoalPercent(currentUserProvider.getCurrentUserId(), asOf);
    }

    @Transactional
    public ChecklistGlobalGoal schedule(LocalDate effectiveFrom, int goalPercent) {
        validateGoalPercent(goalPercent);
        UUID userId = currentUserProvider.getCurrentUserId();
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        if (effectiveFrom.isBefore(today)) {
            throw new InvalidRequestException("Effective date must not be in the past");
        }

        Optional<ChecklistGlobalGoal> existing = repository.findByUserIdAndEffectiveFrom(userId, effectiveFrom);
        if (existing.isPresent()) {
            existing.get().update(goalPercent);
            return repository.save(existing.get());
        }
        return repository.save(new ChecklistGlobalGoal(userId, effectiveFrom, goalPercent));
    }

    /** Only a version that has not begun applying yet may be deleted — same
     *  strictly-future boundary as {@link ChecklistItemService#deleteFutureVersion},
     *  not the "before today" edit-immutability boundary used by {@link #schedule}. */
    @Transactional
    public void deleteFutureVersion(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        ChecklistGlobalGoal goal = repository.findById(id)
                .filter(g -> g.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Goal version not found: " + id));
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        if (!goal.getEffectiveFrom().isAfter(today)) {
            throw new InvalidRequestException("Only a goal version that has not begun applying yet can be deleted");
        }
        repository.delete(goal);
    }

    private void validateGoalPercent(int goalPercent) {
        if (goalPercent < 0 || goalPercent > 100) {
            throw new InvalidRequestException("Goal must be between 0 and 100");
        }
    }
}
