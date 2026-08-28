package com.kafka.backend.activitycategory;

import java.util.UUID;

/** Target root category to move a child category under. */
public record ActivityCategoryMoveRequest(UUID parentId) {
}
