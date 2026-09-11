package com.kafka.backend.calendar;

import java.time.LocalTime;
import java.util.UUID;

/**
 * One row of a Batch Actual Editor commit — the "실행으로 가져오기" workflow.
 * {@code categoryId} means activityCategoryId for a WORK item and
 * lifeCategoryId for a LIFE item; the field is shared since only one ever
 * applies. {@code planningBlockId} is accepted for traceability in error
 * messages only — never persisted as a Plan-to-Actual FK (locked policy).
 */
public record BatchActualItemRequest(
        UUID planningBlockId,
        String domainType,
        String title,
        UUID categoryId,
        UUID phaseId,
        LocalTime startTime,
        LocalTime endTime,
        Integer durationMinutes,
        String memo
) {
}
