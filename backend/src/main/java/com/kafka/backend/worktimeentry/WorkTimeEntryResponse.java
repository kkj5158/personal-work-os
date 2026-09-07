package com.kafka.backend.worktimeentry;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalTime;
import java.util.UUID;

public record WorkTimeEntryResponse(
        UUID id,
        UUID categoryId,
        String item,
        Integer minutes,
        String memo,
        Integer position,
        LocalTime startTime,
        LocalTime endTime,
        UUID phaseId
) {
    public static WorkTimeEntryResponse from(WorkTimeEntry entry) {
        return new WorkTimeEntryResponse(
                entry.getId(),
                entry.getCategoryId(),
                entry.getItem(),
                entry.getMinutes(),
                entry.getMemo(),
                entry.getPosition(),
                entry.getStartAt() == null ? null : AppTimeZone.toDisplay(entry.getStartAt()).toLocalTime(),
                entry.getEndAt() == null ? null : AppTimeZone.toDisplay(entry.getEndAt()).toLocalTime(),
                entry.getPhaseId()
        );
    }
}
