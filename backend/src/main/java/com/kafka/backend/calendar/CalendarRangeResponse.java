package com.kafka.backend.calendar;

import java.util.List;

public record CalendarRangeResponse(
        List<CalendarPlanBlockDto> planBlocks,
        List<CalendarActualBlockDto> actualBlocks,
        List<CalendarUnscheduledActualDto> unscheduledActual,
        List<CalendarStateBlockDto> stateBlocks,
        List<CalendarAttendanceContextDto> attendanceContext,
        List<CalendarWorkRecordSummaryDto> workRecords,
        List<CalendarPlanBlockDto> unscheduledPlans
) {
    public CalendarRangeResponse(List<CalendarPlanBlockDto> p,List<CalendarActualBlockDto> a,List<CalendarUnscheduledActualDto> u,List<CalendarStateBlockDto> s,List<CalendarAttendanceContextDto> c,List<CalendarWorkRecordSummaryDto> w) {this(p,a,u,s,c,w,List.of());}
}
