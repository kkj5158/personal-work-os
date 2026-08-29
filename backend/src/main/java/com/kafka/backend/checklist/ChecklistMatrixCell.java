package com.kafka.backend.checklist;

import java.util.UUID;

/** One (date, item) result within a matrix row — only present for items
 *  actually applicable/snapshotted on that date; absent entirely for any
 *  other column, which the frontend renders as "—" (not-applicable), never
 *  an unchecked box. */
public record ChecklistMatrixCell(UUID entryId, UUID itemId, boolean achieved) {
}
