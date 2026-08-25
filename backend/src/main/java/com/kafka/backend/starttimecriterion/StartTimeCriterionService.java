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

    public StartTimeCriterion create(String name, LocalTime startTime) {
        validateName(name);
        validateStartTime(startTime);

        UUID userId = currentUserProvider.getCurrentUserId();
        int nextSortOrder = repository.findTopByUserIdOrderBySortOrderDesc(userId)
                .map(existing -> existing.getSortOrder() + 1)
                .orElse(0);

        return repository.save(new StartTimeCriterion(userId, name.trim(), startTime, nextSortOrder));
    }

    public StartTimeCriterion update(UUID id, String name, LocalTime startTime, Boolean isActive) {
        validateName(name);
        validateStartTime(startTime);
        if (isActive == null) {
            throw new InvalidRequestException("isActive must not be null");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        StartTimeCriterion criterion = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + id));

        criterion.update(name.trim(), startTime, isActive);
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
}
