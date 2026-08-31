package com.kafka.backend.checklist;

import java.util.UUID;

public record ChecklistDailyEntryResponse(
        UUID id,
        UUID itemId,
        String name,
        String emoji,
        ChecklistPriority priority,
        int goalPercent,
        boolean achieved,
        String memo
) {
    public static ChecklistDailyEntryResponse from(ChecklistDailyEntry entry) {
        return new ChecklistDailyEntryResponse(
                entry.getId(),
                entry.getItemId(),
                entry.getName(),
                entry.getEmoji(),
                entry.getPriority(),
                entry.getGoalPercent(),
                entry.isAchieved(),
                entry.getMemo()
        );
    }
}
