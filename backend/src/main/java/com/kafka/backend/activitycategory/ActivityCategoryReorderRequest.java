package com.kafka.backend.activitycategory;

import java.util.List;
import java.util.UUID;

/**
 * {@code parentId == null} reorders every top-level category; a non-null
 * value reorders that parent's children. {@code orderedIds} must name
 * exactly the current sibling set.
 */
public record ActivityCategoryReorderRequest(UUID parentId, List<UUID> orderedIds) {
}
