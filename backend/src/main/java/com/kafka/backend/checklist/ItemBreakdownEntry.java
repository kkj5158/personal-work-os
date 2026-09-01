package com.kafka.backend.checklist;

import java.util.UUID;

/** One horizontal bar in the Achievement by Item view. */
public record ItemBreakdownEntry(
        UUID itemId,
        UUID categoryId,
        int position,
        String name,
        String emoji,
        ChecklistPriority priority,
        int achievedCount,
        int applicableCount,
        double rate,
        int effectiveGoalPercent,
        boolean deleted
) {
}
