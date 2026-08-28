package com.kafka.backend.leaveallowance;

import java.math.BigDecimal;

/**
 * {@code allowanceDays == null} means this month has never been configured —
 * annual leave / half-day must not be offered as selectable until the user
 * configures it, distinct from a month explicitly configured as {@code 0.0}.
 * {@code remainingDays} is {@code null} exactly when {@code allowanceDays} is
 * (nothing to subtract from).
 */
public record LeaveMonthSummary(
        int year,
        int month,
        BigDecimal allowanceDays,
        BigDecimal usedDays,
        BigDecimal remainingDays
) {
}
