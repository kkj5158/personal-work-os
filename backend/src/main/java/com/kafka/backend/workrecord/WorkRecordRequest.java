package com.kafka.backend.workrecord;

import com.kafka.backend.worktimeentry.WorkTimeEntryItemRequest;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * Upsert body for {@code PUT /api/work-records/{date}}. {@code expectedVersion}
 * is required when updating an existing record (must match its current
 * stored version) and is ignored when creating the first record for a date.
 * {@code appliedCriterionId} selects a saved, active StartTimeCriterion to
 * snapshot; {@code null} clears any applied criterion. {@code workTimeEntries}
 * is the record's complete entry list (replacing whatever it currently has)
 * — must be empty for a non-working status. {@code isOnTimeOverride}
 * requests the "정시 출근 처리" MVP override; {@code null} is treated as
 * {@code false}. The service rejects it when not eligible, and forces it
 * back to {@code false} regardless of the request whenever clockIn, the
 * applied criterion, or a workday-to-non-workday status change invalidates
 * it — see {@code WorkRecordService}.
 */
public record WorkRecordRequest(
        WorkAttendanceStatus status,
        LocalTime clockIn,
        LocalTime clockOut,
        String workLocation,
        Integer workScore,
        String memo,
        UUID appliedCriterionId,
        Integer expectedVersion,
        List<WorkTimeEntryItemRequest> workTimeEntries,
        Boolean isOnTimeOverride
) {
}
