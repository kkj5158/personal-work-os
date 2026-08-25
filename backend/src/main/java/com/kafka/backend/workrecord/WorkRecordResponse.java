package com.kafka.backend.workrecord;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record WorkRecordResponse(
        UUID id,
        LocalDate workDate,
        WorkAttendanceStatus status,
        LocalTime clockIn,
        LocalTime clockOut,
        Integer basicWorkMinutes,
        String workLocation,
        Integer workScore,
        String memo,
        UUID appliedCriterionId,
        String appliedCriterionName,
        LocalTime appliedStartTime,
        /** null = not applicable (non-working status, no clock-in, or no
         *  applied criterion). 0 = on time (exact equality is not late).
         *  Positive = minutes late. Never negative. */
        Integer latenessMinutes,
        Integer version
) {
    public static WorkRecordResponse from(WorkRecord record) {
        LocalTime clockIn = record.getClockInAt() == null ? null : AppTimeZone.toDisplay(record.getClockInAt()).toLocalTime();
        LocalTime clockOut = record.getClockOutAt() == null ? null : AppTimeZone.toDisplay(record.getClockOutAt()).toLocalTime();

        return new WorkRecordResponse(
                record.getId(),
                record.getWorkDate(),
                record.getStatus(),
                clockIn,
                clockOut,
                record.getBasicWorkMinutes(),
                record.getWorkLocation(),
                record.getWorkScore(),
                record.getMemo(),
                record.getAppliedCriterionId(),
                record.getAppliedCriterionName(),
                record.getAppliedStartTime(),
                computeLatenessMinutes(record, clockIn),
                record.getVersion()
        );
    }

    private static Integer computeLatenessMinutes(WorkRecord record, LocalTime clockIn) {
        if (!record.getStatus().isWorkday()) return null;
        if (clockIn == null) return null;
        if (record.getAppliedStartTime() == null) return null;

        int clockInMinutes = clockIn.getHour() * 60 + clockIn.getMinute();
        LocalTime appliedStartTime = record.getAppliedStartTime();
        int appliedMinutes = appliedStartTime.getHour() * 60 + appliedStartTime.getMinute();
        int diff = clockInMinutes - appliedMinutes;
        return Math.max(diff, 0);
    }
}
