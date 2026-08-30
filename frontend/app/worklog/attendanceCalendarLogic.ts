// Pure, framework-free calendar-grid/selection/week-total logic for
// AttendanceCalendar.tsx — split out from the component (which is JSX, and
// so can't be imported directly by this frontend's plain-Node test script
// convention — see attendanceCalendarLogic.test.ts) so it can be unit
// tested without a bundler or test runner.
import { addDays, isSameDay, minutesFromMidnight, parseLocalDateTime, toDateKey } from "@/lib/date";
import { isWorkdayStatus, requiresCriterion } from "./attendance";
import { getNetWorkMinutes } from "./selectors";
import type { WorkLogRecord } from "./mockData";
import type { AttendancePlanDto, PlannableAttendanceStatus, PlannedTimeBlock } from "@/lib/api/types";

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Monday=0..Sunday=6, matching this app's existing Monday-start convention.
export function mondayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

// Every cell the month grid renders, in order — real adjacent-month dates
// leading/trailing the target month rather than blank filler cells (§2/§6
// attendance follow-up refinement): always a whole number of Monday-start
// weeks (leadingCount + daysInMonth + trailingCount is a multiple of 7), so
// every row — including the final partial week of the month itself — is
// always fully populated and shares one uniform cell/border geometry.
export function computeGridDates(monthAnchor: Date): Date[] {
  const monthStart = startOfMonth(monthAnchor);
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const leadingCount = mondayIndex(monthStart);
  const totalCoreCells = leadingCount + daysInMonth;
  const trailingCount = (7 - (totalCoreCells % 7)) % 7;

  const gridDates: Date[] = [];
  for (let i = leadingCount; i > 0; i--) gridDates.push(addDays(monthStart, -i));
  for (let i = 0; i < daysInMonth; i++) gridDates.push(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), i + 1));
  const lastOfMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), daysInMonth);
  for (let i = 1; i <= trailingCount; i++) gridDates.push(addDays(lastOfMonth, i));
  return gridDates;
}

// Every calendar day strictly between `a` and `b` inclusive, regardless of
// order — date-contiguous semantics (§5/§21 attendance follow-up), never a
// rectangular grid selection, and never limited to what's currently
// rendered: the anchor may belong to a month the user has since navigated
// away from.
export function dateRangeKeys(a: Date, b: Date): Set<string> {
  const start = a.getTime() <= b.getTime() ? a : b;
  const end = a.getTime() <= b.getTime() ? b : a;
  const keys = new Set<string>();
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= endDay.getTime()) {
    keys.add(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

// Attendance batch §7 (follow-up: fixed to use real calendar-week math, no
// longer truncated by month/year fetch boundaries) — the calendar week's
// cumulative actual work time, shown on each Sunday cell. Sums
// getNetWorkMinutes (the same canonical actual-work-time definition Work
// Record uses) across that Monday->Sunday week's workday-status records
// only — never fabricated for 휴일/연차/etc. `recordByDate` must be built
// from a range that includes the full Monday-Sunday week even when it
// crosses a month or year boundary (see page.tsx's reloadYearData padding).
export function sundayWeekNetMinutes(sunday: Date, recordByDate: Map<string, WorkLogRecord>): number {
  let total = 0;
  for (let offset = 6; offset >= 0; offset--) {
    const day = addDays(sunday, -offset);
    const record = recordByDate.get(toDateKey(day));
    if (record && isWorkdayStatus(record.status)) {
      total += getNetWorkMinutes(record);
    }
  }
  return total;
}

export interface ClipboardBlockEntry {
  title: string;
  startMinutes: number;
  endMinutes: number;
  categoryId: string | null;
  memo: string | null;
}

export interface ClipboardDaySnapshot {
  /** Days after the earliest copied date — preserved on paste so the whole
   *  selection's relative shape survives regardless of the paste target. */
  offsetDays: number;
  plan: { status: PlannableAttendanceStatus; startTimeCriterionId: string | null; plannedNetWorkMinutes: number | null } | null;
  /** Empty when the source date's plan status is dormant (non-work) —
   *  dormant PlannedTimeBlocks are never propagated by copy/paste (§10),
   *  only genuinely effective ones. */
  blocks: ClipboardBlockEntry[];
}

// Builds one date's clipboard snapshot for multi-date copy (§8/§10/§16) —
// applies the dormant-vs-effective filter (a non-work plan status means
// PlannedTimeBlocks/plannedNetWorkMinutes are dormant leftover data, never
// an active part of "what this date is planned as") so copy/paste can never
// silently propagate dormant data as if it were effective. `allBlocks` is
// the full unfiltered block list — this function does the per-date
// isSameDay filtering itself so callers don't have to.
export function buildClipboardSnapshot(date: Date, offsetDays: number, plan: AttendancePlanDto | undefined, allBlocks: PlannedTimeBlock[]): ClipboardDaySnapshot {
  const dormant = plan != null && !requiresCriterion(plan.plannedStatus);
  const blocksForDate = dormant ? [] : allBlocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), date));
  return {
    offsetDays,
    plan: plan
      ? {
          status: plan.plannedStatus,
          startTimeCriterionId: plan.startTimeCriterionId,
          plannedNetWorkMinutes: dormant ? null : plan.plannedNetWorkMinutes,
        }
      : null,
    blocks: blocksForDate.map((b) => ({
      title: b.title,
      startMinutes: minutesFromMidnight(parseLocalDateTime(b.startAt)),
      endMinutes: minutesFromMidnight(parseLocalDateTime(b.endAt)),
      categoryId: b.categoryId,
      memo: b.memo,
    })),
  };
}

export interface BroadcastPastePlan {
  /** Plannable (today-or-future) targets only — past dates are protected by
   *  the same policy as every other Attendance mutation and are silently
   *  excluded, never blocked with an error. */
  eligible: Date[];
  skippedPast: number;
  /** How many eligible targets already have existing planning data — a
   *  broadcast paste over any of these must be confirmed first (§7), never
   *  silently overwritten. */
  conflictCount: number;
}

// Follow-up batch item 6 (P1-A fix): the pure decision behind broadcast
// paste's overwrite-conflict confirmation — given the dates a single copied
// source is about to be pasted onto, split them into plannable/protected and
// count how many plannable targets already have existing planning data.
// `hasExistingPlanningData` is caller-supplied precisely so this stays a
// pure, network-free decision (unit-testable without mocking the API) while
// the caller decides what "existing" means. That predicate MUST check
// `hasAttendancePlan || hasPlannedTimeBlocks` for a date — a block-only date
// (no AttendancePlan, but one or more PlannedTimeBlocks) already contains
// planning data and must count as a conflict just as much as a plan-only or
// plan+block date; only a genuinely empty date does not count.
export function planBroadcastTargets(targetDates: Date[], isPlannable: (date: Date) => boolean, hasExistingPlanningData: (date: Date) => boolean): BroadcastPastePlan {
  const eligible = targetDates.filter(isPlannable);
  return {
    eligible,
    skippedPast: targetDates.length - eligible.length,
    conflictCount: eligible.filter(hasExistingPlanningData).length,
  };
}

// Follow-up P1 fix: after a successful atomic broadcast-paste replacement
// (PUT .../replace), the response's blocks are the COMPLETE authoritative
// PlannedTimeBlock set for that one target date — never a partial add/update
// list. Upserting each returned block individually (the old approach) only
// ever adds or updates by ID; it can never remove a stale local block whose
// ID the backend's replace already deleted server-side, so a target that had
// 3 old blocks and got replaced with 1 new one would locally show 4 blocks
// until the next full reload. The correct reconciliation is a full
// remove-then-append for that date only: every OTHER date's blocks are left
// completely untouched, and this date's local collection becomes exactly
// `authoritativeBlocks` — nothing merged, nothing left over.
export function reconcileBlocksForDate(existingBlocks: PlannedTimeBlock[], date: Date, authoritativeBlocks: PlannedTimeBlock[]): PlannedTimeBlock[] {
  const otherDates = existingBlocks.filter((b) => !isSameDay(parseLocalDateTime(b.startAt), date));
  return [...otherDates, ...authoritativeBlocks];
}

/** Batch paste/delete paths update local plan state per successful target,
 * then refresh the month leave summary exactly once after all targets have
 * settled. Zero successful plan mutations means blocks-only work and needs
 * no leave-summary request. */
export function refreshLeaveSummaryOnceAfterBatch(successfulPlanMutationCount: number, refresh: () => void): void {
  if (successfulPlanMutationCount > 0) refresh();
}
