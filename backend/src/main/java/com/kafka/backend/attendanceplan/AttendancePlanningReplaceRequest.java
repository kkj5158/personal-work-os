package com.kafka.backend.attendanceplan;

import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRequest;

import java.util.List;

/**
 * P1-C (broadcast-paste overwrite atomicity): the payload for atomically
 * replacing one date's entire planning state. {@code plan} is nullable —
 * {@code null} means "leave whatever plan already exists for this date
 * untouched" (mirrors the pre-existing per-block paste behavior, which never
 * deleted a target's plan just because the copied snapshot lacked one).
 * {@code blocks} is the COMPLETE replacement set, required (use an empty
 * list for "no blocks") — never a partial/incremental list.
 */
public record AttendancePlanningReplaceRequest(AttendancePlanRequest plan, List<PlannedTimeBlockRequest> blocks) {
}
