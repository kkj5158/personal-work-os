package com.kafka.backend.checklist;

import java.time.LocalDate;

/**
 * One bucket of Individual Item Tracking. {@code state} is {@code
 * "ACTIVE"} when the bucket has at least one applicable day of data,
 * {@code "NO_DATA"} otherwise (the frontend should break the trend line
 * rather than bridge/zero across a NO_DATA bucket — see
 * docs/backend/checklist.md's inactive/non-applicable chart semantics).
 */
public record ItemTrendPoint(
        String label,
        LocalDate periodStart,
        LocalDate periodEnd,
        Integer achievedCount,
        Integer applicableCount,
        Double rate,
        Integer goalPercent,
        String state
) {
}
