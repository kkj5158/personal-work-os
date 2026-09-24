package com.kafka.backend.checklist;

import java.util.List;
import java.util.UUID;

/** Mixed-result batch (bulk action, date-level NOT_RECORDED, undo) applied atomically. */
public record ChecklistResultChangesRequest(List<Change> changes) {
    public record Change(UUID entryId, ChecklistResult result) {}
}
