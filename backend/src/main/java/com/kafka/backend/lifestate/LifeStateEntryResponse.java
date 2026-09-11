package com.kafka.backend.lifestate;

import com.kafka.backend.common.AppTimeZone;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record LifeStateEntryResponse(
        UUID id,
        LocalDate entryDate,
        StateGroup stateGroup,
        String label,
        LocalTime startTime,
        LocalTime endTime,
        String memo
) {
    public static LifeStateEntryResponse from(LifeStateEntry entry) {
        return new LifeStateEntryResponse(
                entry.getId(),
                entry.getEntryDate(),
                entry.getStateGroup(),
                entry.getLabel(),
                AppTimeZone.toDisplay(entry.getStartAt()).toLocalTime(),
                AppTimeZone.toDisplay(entry.getEndAt()).toLocalTime(),
                entry.getMemo()
        );
    }
}
