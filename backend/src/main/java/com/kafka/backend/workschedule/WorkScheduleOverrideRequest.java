package com.kafka.backend.workschedule;

import java.time.LocalTime;

/**
 * A null field means "inherit the corresponding yearly WorkSettings default".
 */
public record WorkScheduleOverrideRequest(
        PlannedStatus plannedStatus,
        LocalTime plannedStartTime,
        Integer graceMinutes,
        Integer targetDurationMinutes,
        String memo
) {
}
