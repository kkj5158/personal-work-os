package com.kafka.backend.checklist;

import java.util.UUID;

public record ChecklistCategoryResponse(UUID id, String name, Integer position) {
    public static ChecklistCategoryResponse from(ChecklistCategory category) {
        return new ChecklistCategoryResponse(category.getId(), category.getName(), category.getPosition());
    }
}
