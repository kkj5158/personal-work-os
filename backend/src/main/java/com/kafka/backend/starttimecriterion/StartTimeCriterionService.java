package com.kafka.backend.starttimecriterion;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;

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

        return repository.save(new StartTimeCriterion(userId, name.trim(), startTime, nextSortOrder, resolvedGraceMinutes));
    }

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

        criterion.update(name.trim(), startTime, isActive, resolvedGraceMinutes);
        return repository.save(criterion);
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
