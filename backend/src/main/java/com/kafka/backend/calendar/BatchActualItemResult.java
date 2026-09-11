package com.kafka.backend.calendar;

import java.util.UUID;

public record BatchActualItemResult(
        int index,
        boolean valid,
        String errorMessage,
        ActualSourceType sourceType,
        UUID sourceId
) {
}
