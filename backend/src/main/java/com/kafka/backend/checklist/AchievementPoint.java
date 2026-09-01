package com.kafka.backend.checklist;

import java.time.LocalDate;

/**
 * One bucket of Overall Achievement Trend. Rates are the mean of each valid
 * day's own achievement rate within the bucket (equal-day weighting — a day
 * with 6 active items never outweighs a day with 2), never a pooled count
 * across all days. {@code null} rate means the bucket had no valid
 * (applicable, non-today) day at all.
 */
public record AchievementPoint(
        String label,
        LocalDate periodStart,
        LocalDate periodEnd,
        Double overallRate,
        Double coreRate,
        Double secondaryRate,
        int goalPercent,
        int validDays
) {
}
