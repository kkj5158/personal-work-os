package com.kafka.backend.supplementalwork;

import java.time.LocalTime;
import java.util.UUID;

/**
 * One incoming Supplemental Work entry, as part of a WorkRecord upsert's
 * complete entry list (replace-all model, matching
 * {@code WorkTimeEntryItemRequest}). {@code totalMinutes} is required and is
 * the aggregation source of truth — the backend never recomputes it from
 * {@code startTime}/{@code endTime} even when both are present.
 * {@code startTime}/{@code endTime} are optional but must be supplied
 * together; when present, {@code endTime} must be strictly after
 * {@code startTime} (same-day only, no overnight rule in this version).
 */
public record SupplementalWorkEntryItemRequest(
        UUID id,
        UUID categoryId,
        String item,
        Integer totalMinutes,
        LocalTime startTime,
        LocalTime endTime,
        String memo
) {
}
