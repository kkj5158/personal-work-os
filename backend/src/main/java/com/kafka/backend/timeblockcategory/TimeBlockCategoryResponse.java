package com.kafka.backend.timeblockcategory;

import java.util.UUID;

public record TimeBlockCategoryResponse(
        UUID id,
        String name,
        UUID parentId,
        Integer sortOrder,
        Boolean isActive
) {
    public static TimeBlockCategoryResponse from(TimeBlockCategory category) {
        return new TimeBlockCategoryResponse(
                category.getId(),
                category.getName(),
                category.getParentId(),
                category.getSortOrder(),
                category.getIsActive()
        );
    }
}
