package com.kafka.backend.worktimeentry;

import java.util.UUID;

public record WorkTimeEntryResponse(
        UUID id,
        UUID categoryId,
        String item,
        Integer minutes,
        String memo,
        Integer position
) {
    public static WorkTimeEntryResponse from(WorkTimeEntry entry) {
        return new WorkTimeEntryResponse(
                entry.getId(),
                entry.getCategoryId(),
                entry.getItem(),
                entry.getMinutes(),
                entry.getMemo(),
                entry.getPosition()
        );
    }
}
