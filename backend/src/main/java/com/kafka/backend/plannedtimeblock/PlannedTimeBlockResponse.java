package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDateTime;
import java.util.UUID;

public record PlannedTimeBlockResponse(
        UUID id,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        UUID categoryId,
        String memo
) {
    public static PlannedTimeBlockResponse from(PlannedTimeBlock block) {
        return new PlannedTimeBlockResponse(
                block.getId(),
                block.getTitle(),
                AppTimeZone.toDisplay(block.getStartAt()),
                AppTimeZone.toDisplay(block.getEndAt()),
                block.getCategoryId(),
                block.getMemo()
        );
    }
}
