package com.kafka.backend.starttimecriterion;

import java.util.List;
import java.util.UUID;

/**
 * Body for PUT /api/start-time-criteria/reorder. {@code orderedIds} must
 * name exactly the current user's non-archived criteria — see
 * {@link StartTimeCriterionService#reorder}.
 */
public record StartTimeCriterionReorderRequest(List<UUID> orderedIds) {
}
