package com.kafka.backend.attendanceplan;

import com.kafka.backend.plannedtimeblock.PlannedTimeBlock;

import java.util.List;

/** Domain-level result of {@link AttendancePlanningReplaceService#replace}. {@code plan} is
 *  nullable — see {@link AttendancePlanningReplaceRequest}. */
public record AttendancePlanningReplaceResult(AttendancePlan plan, List<PlannedTimeBlock> blocks) {
}
