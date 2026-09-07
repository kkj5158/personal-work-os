package com.kafka.backend.lifestate;

import java.time.LocalDate;
import java.time.LocalTime;

public record LifeStateEntryRequest(
        LocalDate entryDate,
        StateGroup stateGroup,
        String label,
        LocalTime startTime,
        LocalTime endTime,
        String memo
) {
}
