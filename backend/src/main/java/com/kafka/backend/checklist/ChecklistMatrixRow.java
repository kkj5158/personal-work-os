package com.kafka.backend.checklist;

import com.kafka.backend.workrecord.WorkAttendanceStatus;

import java.time.LocalDate;
import java.util.List;

/**
 * One date row in the checklist matrix — only emitted for a date that has an
 * actual {@code WorkRecord} (mirroring the existing Work Record table's own
 * "no row = 미입력" convention; the frontend fills in the rest of the
 * selected month locally). {@code applicable == false} means this date's
 * attendance is currently a non-work status — any preserved {@code cells}
 * are historical only and must render as "—", never as live checkboxes.
 */
public record ChecklistMatrixRow(
        LocalDate date,
        WorkAttendanceStatus status,
        boolean applicable,
        List<ChecklistMatrixCell> cells
) {
}
