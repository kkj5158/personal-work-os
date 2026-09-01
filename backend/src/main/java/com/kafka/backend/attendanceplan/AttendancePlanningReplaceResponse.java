package com.kafka.backend.attendanceplan;

import com.kafka.backend.plannedtimeblock.PlannedTimeBlockResponse;

import java.util.List;

public record AttendancePlanningReplaceResponse(AttendancePlanResponse plan, List<PlannedTimeBlockResponse> blocks) {
    public static AttendancePlanningReplaceResponse from(AttendancePlanningReplaceResult result) {
        AttendancePlanResponse planResponse = result.plan() != null ? AttendancePlanResponse.from(result.plan()) : null;
        List<PlannedTimeBlockResponse> blockResponses = result.blocks().stream().map(PlannedTimeBlockResponse::from).toList();
        return new AttendancePlanningReplaceResponse(planResponse, blockResponses);
    }
}
