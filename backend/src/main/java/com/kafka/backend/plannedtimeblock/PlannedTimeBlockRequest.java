package com.kafka.backend.plannedtimeblock;

import java.time.LocalDateTime;
import java.util.UUID;

public record PlannedTimeBlockRequest(
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        UUID categoryId,
        String memo
) {
}
