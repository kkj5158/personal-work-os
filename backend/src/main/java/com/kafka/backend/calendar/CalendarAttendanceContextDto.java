package com.kafka.backend.calendar;

import com.kafka.backend.attendanceplan.AttendancePlan;
import com.kafka.backend.workrecord.WorkAttendanceStatus;

import java.time.LocalDate;

/** Planned attendance context for one date — subtle header/background use only, never a hard planning boundary. */
public record CalendarAttendanceContextDto(
        LocalDate date,
        WorkAttendanceStatus plannedStatus,
        Integer plannedNetWorkMinutes
) {
    public static CalendarAttendanceContextDto from(AttendancePlan plan) {
        return new CalendarAttendanceContextDto(plan.getPlanDate(), plan.getPlannedStatus(), plan.getPlannedNetWorkMinutes());
    }
}
