package com.kafka.backend.plannedtimeblock;

import java.time.LocalDateTime;

public record PlannedTimeBlockDuplicateRequest(LocalDateTime newStartAt) {
}
