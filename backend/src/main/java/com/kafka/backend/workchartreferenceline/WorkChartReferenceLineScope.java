package com.kafka.backend.workchartreferenceline;

/**
 * Which chart/metric a reference line applies to. Daily and weekly scopes
 * are kept strictly separate because a daily time value (a clock-of-day-ish
 * duration, e.g. 06:00) and a weekly time value (an aggregated duration that
 * can exceed 24 hours, e.g. 34:15) are not interchangeable — see
 * docs/backend/work-chart-reference-lines.md.
 */
public enum WorkChartReferenceLineScope {
    DAILY_TIME,
    DAILY_SCORE,
    WEEKLY_TIME,
    WEEKLY_SCORE
}
