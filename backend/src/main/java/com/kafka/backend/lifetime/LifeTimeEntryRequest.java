package com.kafka.backend.lifetime;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record LifeTimeEntryRequest(
        LocalDate entryDate,
        UUID lifeCategoryId,
        String title,
        Integer durationMinutes,
        LocalTime startTime,
        LocalTime endTime,
        String memo
) {
}
