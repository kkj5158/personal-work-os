package com.kafka.backend.starttimecriterion;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Service
public class StartTimeCriterionService {

    private final StartTimeCriterionRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public StartTimeCriterionService(StartTimeCriterionRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<StartTimeCriterion> list() {
        return repository.findByUserIdOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    /** 0–120 minutes — see V12's chk_start_time_criteria_grace_minutes_range,
     *  which enforces the same bound at the database level. */
    private static final int MAX_GRACE_MINUTES = 120;

    public StartTimeCriterion create(String name, LocalTime startTime, Integer graceMinutes) {
        validateName(name);
        validateStartTime(startTime);
        int resolvedGraceMinutes = validateGraceMinutes(graceMinutes);

        UUID userId = currentUserProvider.getCurrentUserId();
        int nextSortOrder = repository.findTopByUserIdOrderBySortOrderDesc(userId)
                .map(existing -> existing.getSortOrder() + 1)
                .orElse(0);

        // The first criterion a user ever creates becomes their default
        // automatically — see docs/product/work-log-policy.md's default
        // start-time-criterion invariant.
        boolean makeDefault = repository.findByUserIdAndIsDefaultTrue(userId).isEmpty();
        StartTimeCriterion criterion = new StartTimeCriterion(userId, name.trim(), startTime, nextSortOrder, resolvedGraceMinutes);
        if (makeDefault) {
            criterion.markAsDefault();
        }
        return repository.save(criterion);
    }

    @Transactional
    public StartTimeCriterion update(UUID id, String name, LocalTime startTime, Boolean isActive, Integer graceMinutes) {
        validateName(name);
        validateStartTime(startTime);
        if (isActive == null) {
            throw new InvalidRequestException("isActive must not be null");
        }
        int resolvedGraceMinutes = validateGraceMinutes(graceMinutes);

        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion criterion = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));

        boolean wasDefault = Boolean.TRUE.equals(criterion.getIsDefault());
        criterion.update(name.trim(), startTime, isActive, resolvedGraceMinutes);

        if (wasDefault && !isActive) {
            // Deactivating the current default — maintain the invariant by
            // deterministically handing the default to another active
            // criterion, if one exists (lowest sortOrder, then name).
            criterion.clearDefault();
            StartTimeCriterion saved = repository.save(criterion);
            repository.findFirstByUserIdAndIsActiveTrueAndIdNotOrderBySortOrderAscNameAsc(userId, id)
                    .ifPresent(replacement -> {
                        replacement.markAsDefault();
                        repository.save(replacement);
                    });
            return saved;
        }

        StartTimeCriterion saved = repository.save(criterion);
        // Reactivating a criterion (or any other update) while the user
        // currently has no default at all — e.g. every criterion had been
        // inactive — restores the invariant by promoting this one.
        if (Boolean.TRUE.equals(isActive) && repository.findByUserIdAndIsDefaultTrue(userId).isEmpty()) {
            saved.markAsDefault();
            saved = repository.save(saved);
        }
        return saved;
    }

    /**
     * Explicitly designates {@code id} as the user's default criterion,
     * clearing whichever criterion previously held that role. Idempotent
     * when already the default. Only an active criterion may be default.
     */
    @Transactional
    public StartTimeCriterion setDefault(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));

        if (!Boolean.TRUE.equals(target.getIsActive())) {
            throw new InvalidRequestException("Only an active start time criterion can be set as default");
        }
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            return target;
        }

        repository.findByUserIdAndIsDefaultTrue(userId).ifPresent(current -> {
            current.clearDefault();
            repository.saveAndFlush(current);
        });

        target.markAsDefault();
        return repository.save(target);
    }

    private void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Criterion name must not be blank");
        }
    }

    private void validateStartTime(LocalTime startTime) {
        if (startTime == null) {
            throw new InvalidRequestException("Start time is required");
        }
    }

    /** {@code null} defaults to 0 (no grace), matching every pre-existing
     *  criterion's exact current behavior. */
    private int validateGraceMinutes(Integer graceMinutes) {
        if (graceMinutes == null) {
            return 0;
        }
        if (graceMinutes < 0) {
            throw new InvalidRequestException("Grace minutes must not be negative");
        }
        if (graceMinutes > MAX_GRACE_MINUTES) {
            throw new InvalidRequestException("Grace minutes must not exceed " + MAX_GRACE_MINUTES);
        }
        return graceMinutes;
    }
}
