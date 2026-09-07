package com.kafka.backend.calendar;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One scheduled Actual block projected onto the unified Calendar surface.
 * This is a read projection only — editing must go through the owning
 * domain record ({@code sourceType}/{@code sourceId}), never through a
 * second persisted copy.
 */
public record CalendarActualBlockDto(
        ActualSourceType sourceType,
        UUID sourceId,
        String domainType,
        LocalDate date,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Integer durationMinutes,
        UUID activityCategoryId,
        UUID lifeCategoryId,
        UUID phaseId,
        String memo
) {
}
