package com.kafka.backend.activitycategory;

import java.util.UUID;

public record ActivityCategoryResponse(
        UUID id,
        String name,
        UUID parentId,
        Integer sortOrder,
        Boolean isActive,
        Boolean isDefault
) {
    public static ActivityCategoryResponse from(ActivityCategory category) {
        return new ActivityCategoryResponse(
                category.getId(),
                category.getName(),
                category.getParentId(),
                category.getSortOrder(),
                category.getIsActive(),
                category.getIsDefault()
        );
    }
}
