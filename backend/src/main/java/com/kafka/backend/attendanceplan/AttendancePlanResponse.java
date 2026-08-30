package com.kafka.backend.attendanceplan;

import com.kafka.backend.workrecord.WorkAttendanceStatus;

import java.time.LocalDate;
import java.util.UUID;

public record AttendancePlanResponse(
        UUID id,
        LocalDate planDate,
        WorkAttendanceStatus plannedStatus,
        UUID startTimeCriterionId,
        Integer plannedNetWorkMinutes
) {
    public static AttendancePlanResponse from(AttendancePlan plan) {
        return new AttendancePlanResponse(
                plan.getId(),
                plan.getPlanDate(),
                plan.getPlannedStatus(),
                plan.getStartTimeCriterionId(),
                plan.getPlannedNetWorkMinutes()
        );
    }
}
