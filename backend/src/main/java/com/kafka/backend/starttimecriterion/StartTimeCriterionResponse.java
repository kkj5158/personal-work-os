package com.kafka.backend.starttimecriterion;

import java.time.LocalTime;
import java.util.UUID;

public record StartTimeCriterionResponse(
        UUID id,
        String name,
        LocalTime startTime,
        Boolean isActive,
        Integer sortOrder,
        Integer graceMinutes,
        Boolean isDefault,
        String memo
) {
    public static StartTimeCriterionResponse from(StartTimeCriterion criterion) {
        return new StartTimeCriterionResponse(
                criterion.getId(),
                criterion.getName(),
                criterion.getStartTime(),
                criterion.getIsActive(),
                criterion.getSortOrder(),
                criterion.getGraceMinutes(),
                criterion.getIsDefault(),
                criterion.getMemo()
        );
    }
}
