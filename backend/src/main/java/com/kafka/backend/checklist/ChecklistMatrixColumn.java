package com.kafka.backend.checklist;

import java.util.UUID;

/**
 * One checklist-item column in a {@link ChecklistMatrixResponse} — the union
 * of every item that appears in at least one daily snapshot within the
 * requested range, ordered by the exact same compound order the checklist
 * management screen already displays (category position, then item
 * position within that category — see ChecklistDailyService.getMatrix) —
 * one shared ordering source, never a page-local one. Display fields
 * (name/emoji/priority) reflect the item's current effective-dated version
 * when it still exists; for a deleted item, the most recent historical
 * snapshot within the range is used instead (see
 * ChecklistDailyService.getMatrix).
 */
public record ChecklistMatrixColumn(
        UUID itemId,
        UUID categoryId,
        int position,
        String name,
        String emoji,
        ChecklistPriority priority,
        boolean deleted,
        boolean active
) {
}
