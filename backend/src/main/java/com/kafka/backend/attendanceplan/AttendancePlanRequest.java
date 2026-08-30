package com.kafka.backend.attendanceplan;

import com.kafka.backend.workrecord.WorkAttendanceStatus;

import java.util.UUID;

/**
 * {@code startTimeCriterionId} is required when {@code plannedStatus} is
 * WORK/HALF_DAY and must be omitted (or is ignored) otherwise — see
 * {@link AttendancePlanService#upsert}.
 *
 * <p>{@code plannedNetWorkMinutes} is always accepted verbatim regardless of
 * {@code plannedStatus} — {@code null} means "not configured"; a caller
 * saving a non-work status while preserving a previously-configured (now
 * dormant) target must resend that same value rather than omitting it, since
 * this endpoint always overwrites the stored value with exactly what it's
 * given (see docs/product/work-attendance-management-design.md's dormant
 * planning-data policy).
 */
public record AttendancePlanRequest(WorkAttendanceStatus plannedStatus, UUID startTimeCriterionId, Integer plannedNetWorkMinutes) {
}
