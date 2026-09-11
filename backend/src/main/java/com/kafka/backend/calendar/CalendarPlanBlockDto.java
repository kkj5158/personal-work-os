package com.kafka.backend.calendar;

import com.kafka.backend.plannedtimeblock.PlanDomainType;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlock;

import java.time.LocalDateTime;
import java.util.UUID;

public record CalendarPlanBlockDto(
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
    public static CalendarPlanBlockDto from(PlannedTimeBlock block) {
        return new CalendarPlanBlockDto(
                block.getId(),
                block.getDomainType(),
                block.getTitle(),
                com.kafka.backend.common.AppTimeZone.toDisplay(block.getStartAt()),
                com.kafka.backend.common.AppTimeZone.toDisplay(block.getEndAt()),
                block.getActivityCategoryId(),
                block.getLifeCategoryId(),
                block.getPhaseId(),
                block.getMemo()
        );
    }
}
