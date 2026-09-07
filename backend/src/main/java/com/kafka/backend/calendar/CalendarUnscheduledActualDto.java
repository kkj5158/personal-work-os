package com.kafka.backend.calendar;

import java.time.LocalDate;
import java.util.UUID;

/** An Actual record with duration but no start/end — shown in the
 *  Unscheduled Actual surface until dragged onto the time grid. */
public record CalendarUnscheduledActualDto(
        ActualSourceType sourceType,
        UUID sourceId,
        String domainType,
        LocalDate date,
        String title,
        Integer durationMinutes,
        UUID activityCategoryId,
        UUID lifeCategoryId,
        UUID phaseId,
        String memo
) {
}
