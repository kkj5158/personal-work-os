package com.kafka.backend.lifetime;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record LifeTimeEntryResponse(
        UUID id,
        LocalDate entryDate,
        UUID lifeCategoryId,
        String title,
        Integer durationMinutes,
        LocalTime startTime,
        LocalTime endTime,
        String memo
) {
    public static LifeTimeEntryResponse from(LifeTimeEntry entry) {
        return new LifeTimeEntryResponse(
                entry.getId(),
                entry.getEntryDate(),
                entry.getLifeCategoryId(),
                entry.getTitle(),
                entry.getDurationMinutes(),
                entry.getStartAt() == null ? null : AppTimeZone.toDisplay(entry.getStartAt()).toLocalTime(),
                entry.getEndAt() == null ? null : AppTimeZone.toDisplay(entry.getEndAt()).toLocalTime(),
                entry.getMemo()
        );
    }
}
