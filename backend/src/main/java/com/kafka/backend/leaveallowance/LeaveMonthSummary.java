package com.kafka.backend.leaveallowance;

import java.math.BigDecimal;

/**
 * {@code allowanceDays == null} means this month has never been configured —
 * annual leave / half-day must not be offered as selectable until the user
 * configures it, distinct from a month explicitly configured as {@code 0.0}.
 * {@code usedDays} is confirmed usage (actual WorkRecord leave-consuming
 * statuses). {@code plannedDays} is outstanding reservation — leave-consuming
 * AttendancePlan rows in this month that have not yet been superseded by an
 * actual WorkRecord for that same date (see
 * {@code LeaveAllowanceService#computePlannedLeave}). {@code remainingDays}
 * ("available") is {@code allowanceDays - usedDays - plannedDays}, {@code
 * null} exactly when {@code allowanceDays} is (nothing to subtract from).
 */
public record LeaveMonthSummary(
        int year,
        int month,
        BigDecimal allowanceDays,
        BigDecimal usedDays,
        BigDecimal plannedDays,
        BigDecimal remainingDays
) {
}
