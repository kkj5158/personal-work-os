package com.kafka.backend.workrecord;

import java.math.BigDecimal;

/**
 * A WorkRecord's actual attendance outcome. WORK, EARLY_LEAVE, and HALF_DAY
 * are the work-included statuses that may carry clock times, an applied
 * start-time criterion snapshot, or work-time entries — see
 * {@link #isWorkday()}. ABSENT is persisted directly (never inferred from a
 * missing row — see docs/backend/work-record.md).
 *
 * HALF_DAY is a work-included status (normal check-in/out, criterion,
 * lateness, work-time entries) that additionally consumes 0.5 day of the
 * user's monthly leave allowance — see {@link #leaveConsumption()} and
 * docs/product/work-log-policy.md's leave-allowance section. It is distinct
 * from EARLY_LEAVE, which is an unplanned early finish that consumes no
 * leave.
 */
public enum WorkAttendanceStatus {
    WORK,
    EARLY_LEAVE,
    HALF_DAY,
    DAY_OFF,
    PAID_LEAVE,
    SICK_LEAVE,
    ABSENT;

    public boolean isWorkday() {
        return this == WORK || this == EARLY_LEAVE || this == HALF_DAY;
    }

    /**
     * Monthly leave-allowance days this status consumes for the date it is
     * recorded on. Never stored independently — always derived fresh from a
     * month's recorded statuses (see {@code LeaveAllowanceService}), so
     * usage can never drift out of sync with actual attendance history.
     */
    public BigDecimal leaveConsumption() {
        return switch (this) {
            case PAID_LEAVE -> BigDecimal.ONE;
            case HALF_DAY -> new BigDecimal("0.5");
            default -> BigDecimal.ZERO;
        };
    }
}
