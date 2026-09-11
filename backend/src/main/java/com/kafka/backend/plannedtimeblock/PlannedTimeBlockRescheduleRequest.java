package com.kafka.backend.plannedtimeblock;

import java.time.LocalDateTime;

public record PlannedTimeBlockRescheduleRequest(LocalDateTime startAt, LocalDateTime endAt) {
}
