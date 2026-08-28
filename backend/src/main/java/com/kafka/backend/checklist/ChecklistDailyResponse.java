package com.kafka.backend.checklist;

import java.time.LocalDate;
import java.util.List;

/**
 * {@code applicable == false} means this date has no work-included
 * attendance right now — checklist evaluation UI should be hidden/disabled,
 * and any {@code entries} present are preserved history, not something to
 * check off today.
 */
public record ChecklistDailyResponse(LocalDate date, boolean applicable, List<ChecklistDailyEntryResponse> entries) {
}
