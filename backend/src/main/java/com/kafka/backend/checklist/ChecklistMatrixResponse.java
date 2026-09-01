package com.kafka.backend.checklist;

import java.util.List;

/** Batch response for the checklist matrix table — avoids one HTTP request
 *  per date. See ChecklistDailyService.getMatrix. */
public record ChecklistMatrixResponse(List<ChecklistMatrixColumn> columns, List<ChecklistMatrixRow> rows) {
}
