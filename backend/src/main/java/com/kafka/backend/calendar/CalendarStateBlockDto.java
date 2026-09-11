package com.kafka.backend.calendar;

import com.kafka.backend.lifestate.LifeStateEntry;
import com.kafka.backend.lifestate.StateGroup;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

public record CalendarStateBlockDto(
        UUID id,
        LocalDate date,
        StateGroup stateGroup,
        String label,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String memo
) {
    public static CalendarStateBlockDto from(LifeStateEntry entry) {
        return new CalendarStateBlockDto(
                entry.getId(),
                entry.getEntryDate(),
                entry.getStateGroup(),
                entry.getLabel(),
                com.kafka.backend.common.AppTimeZone.toDisplay(entry.getStartAt()),
                com.kafka.backend.common.AppTimeZone.toDisplay(entry.getEndAt()),
                entry.getMemo()
        );
    }
}
