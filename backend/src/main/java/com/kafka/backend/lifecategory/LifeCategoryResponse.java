package com.kafka.backend.lifecategory;

import java.util.UUID;

public record LifeCategoryResponse(
        UUID id,
        String name,
        UUID parentId,
        Integer sortOrder,
        Boolean isActive,
        Boolean isDefault
) {
    public static LifeCategoryResponse from(LifeCategory category) {
        return new LifeCategoryResponse(
                category.getId(),
                category.getName(),
                category.getParentId(),
                category.getSortOrder(),
                category.getIsActive(),
                category.getIsDefault()
        );
    }
}
