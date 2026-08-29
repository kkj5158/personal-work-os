package com.kafka.backend.attendanceplan;

import com.kafka.backend.workrecord.WorkAttendanceStatus;

import java.util.UUID;

/**
 * {@code startTimeCriterionId} is required when {@code plannedStatus} is
 * WORK/HALF_DAY and must be omitted (or is ignored) otherwise — see
 * {@link AttendancePlanService#upsert}.
 */
public record AttendancePlanRequest(WorkAttendanceStatus plannedStatus, UUID startTimeCriterionId) {
}
