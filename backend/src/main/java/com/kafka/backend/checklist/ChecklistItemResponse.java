package com.kafka.backend.checklist;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.util.UUID;

/** The item's current (as-of-today) definition, for the management UI. */
public record ChecklistItemResponse(
        UUID id,
        UUID categoryId,
        Integer position,
        boolean deleted,
        LocalDate deletedAt,
        String name,
        String emoji,
        ChecklistPriority priority,
        boolean active,
        Integer goalOverridePercent,
        int effectiveGoalPercent
) {
    public static ChecklistItemResponse from(ChecklistItem item, ChecklistItemVersion currentVersion, int effectiveGoalPercent) {
        return new ChecklistItemResponse(
                item.getId(),
                item.getCategoryId(),
                item.getPosition(),
                item.isDeleted(),
                item.getDeletedAt() != null ? AppTimeZone.toDisplay(item.getDeletedAt()).toLocalDate() : null,
                currentVersion.getName(),
                currentVersion.getEmoji(),
                currentVersion.getPriority(),
                currentVersion.isActive(),
                currentVersion.getGoalOverridePercent(),
                effectiveGoalPercent
        );
    }
}
