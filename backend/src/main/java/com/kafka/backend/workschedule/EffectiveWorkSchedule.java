package com.kafka.backend.workschedule;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * Calculated schedule for a single date, after applying WorkSchedule
 * overrides on top of the yearly WorkSettings defaults. Not persisted.
 */
public record EffectiveWorkSchedule(
        LocalDate workDate,
        PlannedStatus plannedStatus,
        LocalTime plannedStartTime,
        Integer graceMinutes,
        Integer targetDurationMinutes,
        String memo
) {
}
