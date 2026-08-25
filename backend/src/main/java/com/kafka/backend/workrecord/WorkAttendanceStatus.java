package com.kafka.backend.workrecord;

/**
 * A WorkRecord's actual attendance outcome. WORK and EARLY_LEAVE are the
 * only two statuses that may carry clock times, an applied start-time
 * criterion snapshot, or work-time entries — see {@link #isWorkday()}.
 * ABSENT is persisted directly (never inferred from a missing row — see
 * docs/backend/work-record.md).
 */
public enum WorkAttendanceStatus {
    WORK,
    EARLY_LEAVE,
    DAY_OFF,
    PAID_LEAVE,
    SICK_LEAVE,
    ABSENT;

    public boolean isWorkday() {
        return this == WORK || this == EARLY_LEAVE;
    }
}
