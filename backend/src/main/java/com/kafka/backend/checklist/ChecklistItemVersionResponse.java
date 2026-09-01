package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.util.UUID;

public record ChecklistItemVersionResponse(
        UUID id,
        LocalDate effectiveFrom,
        String name,
        String emoji,
        ChecklistPriority priority,
        boolean active,
        Integer goalOverridePercent,
        boolean immutable
) {
    public static ChecklistItemVersionResponse from(ChecklistItemVersion version) {
        boolean immutable = version.getEffectiveFrom().isBefore(LocalDate.now(AppTimeZone.ZONE));
        return new ChecklistItemVersionResponse(
                version.getId(),
                version.getEffectiveFrom(),
                version.getName(),
                version.getEmoji(),
                version.getPriority(),
                version.isActive(),
                version.getGoalOverridePercent(),
                immutable
        );
    }
}
