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
        String memo
) {
}
