package com.kafka.backend.calendar;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Actual attendance outcome for one date — backs the "근무 시간(실제)" header context. */
public record CalendarWorkRecordSummaryDto(
        LocalDate date,
        WorkAttendanceStatus status,
        LocalDateTime clockInAt,
        LocalDateTime clockOutAt,
        Integer basicWorkMinutes
) {
    public static CalendarWorkRecordSummaryDto from(WorkRecord record) {
        return new CalendarWorkRecordSummaryDto(
                record.getWorkDate(),
                record.getStatus(),
                record.getClockInAt() == null ? null : AppTimeZone.toDisplay(record.getClockInAt()),
                record.getClockOutAt() == null ? null : AppTimeZone.toDisplay(record.getClockOutAt()),
                record.getBasicWorkMinutes()
        );
    }
}
