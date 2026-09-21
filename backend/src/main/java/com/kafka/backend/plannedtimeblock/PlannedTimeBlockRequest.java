package com.kafka.backend.plannedtimeblock;

import java.time.LocalDateTime;
import java.util.UUID;

public record PlannedTimeBlockRequest(
        PlanDomainType domainType,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        UUID activityCategoryId,
        UUID lifeCategoryId,
        UUID phaseId,
        String memo,
        java.time.LocalDate date,
        Integer durationMinutes,
        String preferredActualSourceType
) {
    public PlannedTimeBlockRequest(PlanDomainType domainType,String title,LocalDateTime startAt,LocalDateTime endAt,UUID activityCategoryId,UUID lifeCategoryId,UUID phaseId,String memo,java.time.LocalDate date) {this(domainType,title,startAt,endAt,activityCategoryId,lifeCategoryId,phaseId,memo,date,null,null);}
    public PlannedTimeBlockRequest(PlanDomainType domainType,String title,LocalDateTime startAt,LocalDateTime endAt,UUID activityCategoryId,UUID lifeCategoryId,UUID phaseId,String memo) {this(domainType,title,startAt,endAt,activityCategoryId,lifeCategoryId,phaseId,memo,startAt==null ? null : startAt.toLocalDate());}
}
