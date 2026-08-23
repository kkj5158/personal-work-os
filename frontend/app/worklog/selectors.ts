import { addDays, isSameDay, startOfWeek, toDateKey } from "@/lib/date";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";
import { sumWorkTimeEntries } from "./workTimeEntry";
import { isWorkdayStatus } from "./attendance";
import { parseTimeOfDayMinutes } from "./format";

// v2 Phase 4: 실근무 is derived, never independently stored — every
// consumer that previously read WorkLogRecord.netWorkMinutes directly must
// go through this instead, so there is exactly one source of truth (the
// record's own workTimeEntries). Defensive: a non-working record (휴일/
// 연차/병가) always contributes zero, regardless of what its entries array
// happens to contain — the approved rule is 업무시간 기록 가능 오직 근무/
// 조퇴뿐이므로, 이 자체가 그 규칙의 유일한 시맨틱 소스다 (isWorkdayStatus
// 재사용, 중복 상태 비교 금지).
export function getNetWorkMinutes(record: WorkLogRecord): number {
  if (!isWorkdayStatus(record.status)) return 0;
  return sumWorkTimeEntries(record.workTimeEntries);
}

// Extracted from WeeklySummary.tsx (v2 Phase 5) so weekly summary and
// monthly weekly-block headings share one calculation instead of drifting —
// formula, null-score handling, and rounding are all unchanged from the
// original inline version.
export function getAverageScore(records: WorkLogRecord[]): number | null {
  const scored = records.filter((r) => r.score != null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length);
}

// Lateness foundation unit: the one shared result shape every screen must
// render (via format.ts's formatLatenessResult/getLatenessResultClassName)
// instead of comparing/deriving its own number. No "early" state — arriving
// before the applied start time is simply on-time, not a distinct status.
export type LatenessResult =
  | { status: "not-applicable" }
  | { status: "criterion-required" }
  | { status: "on-time" }
  | { status: "late"; minutes: number };

// Derives lateness purely from the record's own snapshot — never a live
// lookup against the current START_TIME_CRITERIA list, so editing or
// deactivating a criterion later never changes how a past record reads.
// Decision order:
//   1. non-working record (휴일/연차/병가/...) -> not-applicable
//   2. no clock-in -> not-applicable
//   3. no appliedStartTime snapshot -> criterion-required
//   4. either stored time string fails strict HH:MM parsing -> defensively
//      treat as not-applicable. This (rather than "criterion-required") is
//      the deliberate choice: "criterion-required" would falsely claim no
//      criterion/custom time was ever applied when one actually was, just
//      corrupted — "not-applicable" makes no such false claim and never
//      fabricates a number.
//   5. otherwise compare clockIn minutes to appliedStartTime minutes:
//      diff <= 0 -> on-time, diff > 0 -> late with that many minutes.
export function getLateness(record: WorkLogRecord): LatenessResult {
  if (!isWorkdayStatus(record.status)) return { status: "not-applicable" };
  if (!record.clockIn) return { status: "not-applicable" };
  if (!record.appliedStartTime) return { status: "criterion-required" };

  const clockInMinutes = parseTimeOfDayMinutes(record.clockIn);
  const appliedStartMinutes = parseTimeOfDayMinutes(record.appliedStartTime.startTime);
  if (clockInMinutes == null || appliedStartMinutes == null) return { status: "not-applicable" };

  const diff = clockInMinutes - appliedStartMinutes;
  if (diff <= 0) return { status: "on-time" };
  return { status: "late", minutes: diff };
}

/**
 * Locates the record matching `referenceDate`'s local calendar date.
 * `referenceDate` must be supplied by the caller — this never reads
 * `new Date()` internally, so it stays deterministic/testable and never
 * changes the currently displayed week or jumps the page to today on its
 * own. Uses lib/date.ts's `isSameDay` (year/month/day comparison), which is
 * already timezone-naive, so this is free of UTC-conversion bugs.
 */
export function findRecordForDate(records: WorkLogRecord[], referenceDate: Date): WorkLogRecord | null {
  return records.find((r) => isSameDay(r.date, referenceDate)) ?? null;
}

export interface WeekGroup {
  key: string;
  weekStart: Date;
  weekEnd: Date;
  records: WorkLogRecord[];
}

/**
 * Groups records into Monday-start week buckets, keyed by each record's own
 * date (not by re-deriving a fixed calendar range). A group only ever
 * contains records that were actually present in `records`, so a partial
 * week at a month's start/end naturally stays partial — this never pulls
 * in out-of-month dates on its own; that would only happen if the caller's
 * `records` already included them (e.g. a future adjacent-month fetch).
 */
export function groupRecordsByWeek(records: WorkLogRecord[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();

  for (const record of records) {
    const weekStart = startOfWeek(record.date);
    const key = toDateKey(weekStart);
    let group = groups.get(key);
    if (!group) {
      group = { key, weekStart, weekEnd: addDays(weekStart, 6), records: [] };
      groups.set(key, group);
    }
    group.records.push(record);
  }

  return Array.from(groups.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}

export interface WorkLogTrendPoint {
  key: string;
  rangeStart: Date;
  rangeEnd: Date;
  netWorkMinutes: number;
  averageScore: number | null;
}

/**
 * One trend point per Monday–Sunday week present in `records` — a direct,
 * unfiltered mirror of whatever `groupRecordsByWeek` produces. Deliberately
 * period-agnostic: this selector has no monthly-view rules and never filters
 * by a selected month — the caller decides which weeks' records to pass in
 * (e.g. the Work Log trend section's fixed recent-4-week range, independent
 * of whatever week/month is currently browsed). `rangeStart`/`rangeEnd` come
 * from each group's own first/last actual record, never the group's
 * canonical `weekStart`/`weekEnd` (which would leak an adjacent date for a
 * partial edge block, were one ever present). No display formatting here —
 * that's a presentation concern for the chart components.
 */
// Stay-duration calculation (v3 overnight-support unit): derives 체류 시간
// from a clock-in/clock-out pair, correctly crossing midnight when the
// work interval spans two calendar days (e.g. 19:00 -> 01:00). "Earlier
// than clock-in" is treated as next-day; an *equal* pair is rejected by the
// edit-time validators below before it ever reaches here (never treated as
// a 24-hour shift) — if one somehow arrives here anyway, the >= branch
// below returns 0, never 1440. Returns null when either side is missing or
// unparseable, matching every other "not yet known" duration in this file.
export function computeStayMinutes(clockIn: string | null, clockOut: string | null): number | null {
  if (!clockIn || !clockOut) return null;
  const inMinutes = parseTimeOfDayMinutes(clockIn);
  const outMinutes = parseTimeOfDayMinutes(clockOut);
  if (inMinutes == null || outMinutes == null) return null;
  return outMinutes >= inMinutes ? outMinutes - inMinutes : outMinutes + 24 * 60 - inMinutes;
}

// Validates a single clock-time edit against its counterpart (v3 overnight-
// support unit) — shared by Today's inline clock edit and the record-detail
// modal's save path, so the "equal times are invalid" and "empty is
// invalid" rules can never drift between the two. `candidate` is the new
// value being confirmed; `otherValue` is the *other* clock field's current
// value (already-saved for Today, in-draft for the modal). Deliberately
// permissive about ordering — clock-out earlier than clock-in is valid
// (overnight) and is not this function's concern; only exact equality is
// rejected, per spec ("do not interpret it as a 24-hour shift").
export function validateClockTimeEdit(candidate: string, otherValue: string | null): string | null {
  if (candidate.trim() === "") return "시간을 입력해 주세요.";
  if (otherValue && candidate === otherValue) return "출근/퇴근 시간이 같을 수 없습니다.";
  return null;
}

// Layers the temporary on-time override (v3 MVP unit, ahead of a future
// request/approval system — see WorkLogRecord.isOnTimeOverride) on top of
// the raw calculation without ever mutating it: every other consumer of
// lateness that needs the *displayed* status (Today Summary, the weekly/
// monthly tables, the record-detail modal) goes through this, while
// getLateness itself stays the single unmodified source of the raw minutes
// (still reachable directly wherever the raw value must be shown alongside
// the override, e.g. an exact-value tooltip or the modal's own read-out).
export function getEffectiveLateness(record: WorkLogRecord): LatenessResult {
  if (record.isOnTimeOverride) return { status: "on-time" };
  return getLateness(record);
}

export type OnTimeOverrideEligibility = "none" | "apply" | "cancel";

// Single shared eligibility rule for the "정시 출근 처리"/"처리 취소" action
// (v3 MVP unit) — reused by Today Summary and the record-detail modal so
// the button's visibility conditions can't drift between the two surfaces.
// Deliberately takes the same shape as a WorkLogRecord rather than the
// record type itself, so callers can pass a live in-progress *draft*
// preview (status/clockIn/appliedStartTime not yet saved) without first
// constructing a full WorkLogRecord.
export function getOnTimeOverrideEligibility(record: {
  status: AttendanceStatus;
  clockIn: string | null;
  appliedStartTime: WorkLogRecord["appliedStartTime"];
  isOnTimeOverride: boolean;
}): OnTimeOverrideEligibility {
  if (record.isOnTimeOverride) return "cancel";
  if (!isWorkdayStatus(record.status)) return "none";
  if (!record.clockIn) return "none";
  if (!record.appliedStartTime) return "none";

  const clockInMinutes = parseTimeOfDayMinutes(record.clockIn);
  const appliedStartMinutes = parseTimeOfDayMinutes(record.appliedStartTime.startTime);
  if (clockInMinutes == null || appliedStartMinutes == null) return "none";
  return clockInMinutes - appliedStartMinutes > 0 ? "apply" : "none";
}

export function getWeeklyTrendPoints(records: WorkLogRecord[]): WorkLogTrendPoint[] {
  return groupRecordsByWeek(records).map((group) => ({
    key: group.key,
    rangeStart: group.records[0].date,
    rangeEnd: group.records[group.records.length - 1].date,
    netWorkMinutes: group.records.reduce((sum, record) => sum + getNetWorkMinutes(record), 0),
    averageScore: getAverageScore(group.records),
  }));
}
