package com.kafka.backend.checklist;

import java.util.UUID;

public record ChecklistItemCreateRequest(
        String name,
        String emoji,
        ChecklistPriority priority,
        UUID categoryId,
        Integer goalOverridePercent
) {
}
