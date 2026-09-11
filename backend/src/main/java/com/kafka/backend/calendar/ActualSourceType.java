package com.kafka.backend.calendar;

/** Identifies which domain-owned table an Actual calendar block came from. */
public enum ActualSourceType {
    WORK_TIME_ENTRY,
    SUPPLEMENTAL_WORK_ENTRY,
    LIFE_TIME_ENTRY
}
