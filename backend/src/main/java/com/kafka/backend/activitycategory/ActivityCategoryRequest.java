package com.kafka.backend.activitycategory;

import java.util.UUID;

public record ActivityCategoryRequest(String name, UUID parentId) {
}
