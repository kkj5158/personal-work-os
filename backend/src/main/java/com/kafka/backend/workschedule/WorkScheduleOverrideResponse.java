package com.kafka.backend.workschedule;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * The raw stored override for a date. A null field means "inherit
 * the corresponding yearly WorkSettings default" - distinct from
 * {@link EffectiveWorkSchedule}, which is the already-resolved result.
 */
public record WorkScheduleOverrideResponse(
        LocalDate workDate,
        PlannedStatus plannedStatus,
        LocalTime plannedStartTime,
        Integer graceMinutes,
        Integer targetDurationMinutes,
        String memo
) {
    public static WorkScheduleOverrideResponse from(WorkSchedule schedule) {
        return new WorkScheduleOverrideResponse(
                schedule.getWorkDate(),
                schedule.getPlannedStatus(),
                schedule.getPlannedStartTime(),
                schedule.getGraceMinutes(),
                schedule.getTargetDurationMinutes(),
                schedule.getMemo()
        );
    }
}
