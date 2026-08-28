package com.kafka.backend.checklist;

import java.util.UUID;

/** The item's current (as-of-today) definition, for the management UI. */
public record ChecklistItemResponse(
        UUID id,
        UUID categoryId,
        Integer position,
        boolean deleted,
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
                currentVersion.getName(),
                currentVersion.getEmoji(),
                currentVersion.getPriority(),
                currentVersion.isActive(),
                currentVersion.getGoalOverridePercent(),
                effectiveGoalPercent
        );
    }
}
