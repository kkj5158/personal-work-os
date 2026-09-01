package com.kafka.backend.checklist;

import java.time.LocalDate;

public record ChecklistItemVersionRequest(
        LocalDate effectiveFrom,
        String name,
        String emoji,
        ChecklistPriority priority,
        Boolean active,
        Integer goalOverridePercent
) {
}
