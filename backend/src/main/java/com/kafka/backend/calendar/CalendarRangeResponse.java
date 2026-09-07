package com.kafka.backend.calendar;

import java.util.List;

public record CalendarRangeResponse(
        List<CalendarPlanBlockDto> planBlocks,
        List<CalendarActualBlockDto> actualBlocks,
        List<CalendarUnscheduledActualDto> unscheduledActual,
        List<CalendarStateBlockDto> stateBlocks,
        List<CalendarAttendanceContextDto> attendanceContext,
        List<CalendarWorkRecordSummaryDto> workRecords
) {
}
