package com.kafka.backend.checklist;

/** {@code memo} null/blank clears it — see ChecklistDailyEntry.setMemo. */
public record ChecklistMemoRequest(String memo) {
}
