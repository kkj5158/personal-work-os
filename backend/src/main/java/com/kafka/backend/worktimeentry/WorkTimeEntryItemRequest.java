package com.kafka.backend.worktimeentry;

import java.util.UUID;

/**
 * One line of {@code WorkRecordRequest.workTimeEntries}. {@code id} is
 * {@code null} for a brand-new row; when non-null and it matches one of the
 * record's own current rows, that row is updated in place (preserving
 * identity) rather than replaced. Order in the containing list is the
 * entry's position.
 */
public record WorkTimeEntryItemRequest(
        UUID id,
        UUID categoryId,
        String item,
        Integer minutes,
        String memo
) {
}
