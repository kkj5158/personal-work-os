package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDateTime;
import java.util.UUID;

public record PlannedTimeBlockResponse(
        UUID id,
        PlanDomainType domainType,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        UUID activityCategoryId,
        UUID lifeCategoryId,
        UUID phaseId,
        String memo
) {
    public static PlannedTimeBlockResponse from(PlannedTimeBlock block) {
        return new PlannedTimeBlockResponse(
                block.getId(),
                block.getDomainType(),
                block.getTitle(),
                AppTimeZone.toDisplay(block.getStartAt()),
                AppTimeZone.toDisplay(block.getEndAt()),
                block.getActivityCategoryId(),
                block.getLifeCategoryId(),
                block.getPhaseId(),
                block.getMemo()
        );
    }
}
