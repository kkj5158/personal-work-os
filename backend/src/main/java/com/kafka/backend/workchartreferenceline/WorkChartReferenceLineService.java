package com.kafka.backend.workchartreferenceline;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class WorkChartReferenceLineService {

    public static final int MAX_LINES_PER_SCOPE = 3;
    public static final int MAX_LABEL_LENGTH = 20;

    private final WorkChartReferenceLineRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public WorkChartReferenceLineService(WorkChartReferenceLineRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public List<WorkChartReferenceLine> list() {
        return repository.findByUserIdOrderByScopeAscPositionAsc(currentUserProvider.getCurrentUserId());
    }

    @Transactional
    public WorkChartReferenceLine create(WorkChartReferenceLineScope scope, String label, Integer value, WorkChartReferenceLineColor color) {
        if (scope == null) {
            throw new InvalidRequestException("scope is required");
        }
        String trimmedLabel = validateLabel(label);
        validateValue(scope, value);
        if (color == null) {
            throw new InvalidRequestException("color is required");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        List<WorkChartReferenceLine> existing = repository.findByUserIdAndScopeOrderByPositionAsc(userId, scope);
        if (existing.size() >= MAX_LINES_PER_SCOPE) {
            throw new InvalidRequestException("A chart/metric scope may have at most " + MAX_LINES_PER_SCOPE + " reference lines");
        }

        return repository.save(new WorkChartReferenceLine(userId, scope, existing.size(), trimmedLabel, value, color));
    }

    public WorkChartReferenceLine update(UUID id, String label, Integer value, WorkChartReferenceLineColor color) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkChartReferenceLine target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Reference line not found: " + id));

        String trimmedLabel = validateLabel(label);
        validateValue(target.getScope(), value);
        if (color == null) {
            throw new InvalidRequestException("color is required");
        }

        target.update(trimmedLabel, value, color);
        return repository.save(target);
    }

    /**
     * Deletes one reference line, then re-numbers the remaining siblings in
     * the same scope back to a contiguous 0..n-1 position range (preserving
     * their relative order) — this is what keeps {@link #create}'s
     * "next position = current count" logic correct after a deletion in the
     * middle (e.g. deleting position 1 of [0,1,2] leaves [0,1], not [0,2]).
     */
    @Transactional
    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        WorkChartReferenceLine target = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Reference line not found: " + id));

        WorkChartReferenceLineScope scope = target.getScope();
        repository.delete(target);
        repository.flush();

        List<WorkChartReferenceLine> remaining = repository.findByUserIdAndScopeOrderByPositionAsc(userId, scope);
        for (int position = 0; position < remaining.size(); position++) {
            remaining.get(position).reposition(position);
        }
        repository.saveAll(remaining);
    }

    private String validateLabel(String label) {
        if (label == null || label.isBlank()) {
            throw new InvalidRequestException("label must not be blank");
        }
        String trimmed = label.trim();
        if (trimmed.length() > MAX_LABEL_LENGTH) {
            throw new InvalidRequestException("label must be at most " + MAX_LABEL_LENGTH + " characters");
        }
        return trimmed;
    }

    private void validateValue(WorkChartReferenceLineScope scope, Integer value) {
        if (value == null) {
            throw new InvalidRequestException("value is required");
        }
        switch (scope) {
            case DAILY_TIME -> {
                if (value < 1 || value > 1440) {
                    throw new InvalidRequestException("Daily time value must be between 1 and 1440 minutes");
                }
            }
            case WEEKLY_TIME -> {
                if (value < 1 || value > 10080) {
                    throw new InvalidRequestException("Weekly time value must be between 1 and 10080 minutes");
                }
            }
            case DAILY_SCORE, WEEKLY_SCORE -> {
                if (value < 0 || value > 100) {
                    throw new InvalidRequestException("Score value must be between 0 and 100");
                }
            }
        }
    }
}
