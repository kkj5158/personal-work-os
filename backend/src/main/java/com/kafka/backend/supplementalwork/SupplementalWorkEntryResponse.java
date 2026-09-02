package com.kafka.backend.supplementalwork;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalTime;
import java.util.UUID;

public record SupplementalWorkEntryResponse(
        UUID id,
        UUID categoryId,
        String item,
        Integer totalMinutes,
        LocalTime startTime,
        LocalTime endTime,
        String memo,
        Integer position
) {
    public static SupplementalWorkEntryResponse from(SupplementalWorkEntry entry) {
        LocalTime startTime = entry.getStartAt() == null ? null : AppTimeZone.toDisplay(entry.getStartAt()).toLocalTime();
        LocalTime endTime = entry.getEndAt() == null ? null : AppTimeZone.toDisplay(entry.getEndAt()).toLocalTime();
        return new SupplementalWorkEntryResponse(
                entry.getId(),
                entry.getCategoryId(),
                entry.getItem(),
                entry.getTotalMinutes(),
                startTime,
                endTime,
                entry.getMemo(),
                entry.getPosition()
        );
    }
}
