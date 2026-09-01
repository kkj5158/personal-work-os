import { isSameDay, startOfDay } from "@/lib/date";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";
import type { PlannableAttendanceStatus } from "@/lib/api/types";

// The single canonical predicate for "does this AttendancePlan status allow
// effective work planning" (attendance follow-up QA round 2, §10) — the
// PlannableAttendanceStatus sibling of isWorkdayStatus below. Reused
// everywhere a status-gated planning decision is needed: the criterion
// field, the plannedNetWorkMinutes field, PlannedTimeBlock editor
// visibility, and dormant-vs-effective filtering in AttendanceCalendar's
// copy/paste. Never re-implemented as a scattered
// `status === "WORK" || status === "HALF_DAY"` check elsewhere.
export function requiresCriterion(status: PlannableAttendanceStatus): boolean {
  return status === "WORK" || status === "HALF_DAY";
}

// Confirmed workday rule (spec §6.1 / §11.1, extended by the leave/half-day
// iteration): 근무, 조퇴, and 반차 all count toward 근무일 — every one of
// them is a work-included status (real check-in/out, criterion, entries).
// 휴일/연차/병가 do not. This is only about whether a status counts as a
// workday — it says nothing about lateness or early-leave calculation,
// which remain deferred business rules.
export function isWorkdayStatus(status: AttendanceStatus): boolean {
  return status === "근무" || status === "조퇴" || status === "반차";
}

export function countWorkdays(records: WorkLogRecord[]): number {
  return records.filter((r) => isWorkdayStatus(r.status)).length;
}

export interface MonthlyAttendanceCounts {
  근무: number;
  조퇴: number;
  반차: number;
  휴일: number;
  연차: number;
  병가: number;
  결근: number;
  /**
   * Aggregation-only bucket: a past/current calendar date with no matching
   * record at all. Deliberately distinct from `결근` (an explicit ABSENT
   * row, written by the backend's absence-backfill scheduler or set
   * directly) — a missing row is never treated as absence. Not a 7th
   * AttendanceStatus — WorkLogRecord.status is never widened to represent
   * this.
   */
  미입력: number;
  /** 근무 + 조퇴 + 반차, kept separate from the raw per-status counts above. */
  workdayTotal: number;
}

/**
 * Aggregates one calendar month's attendance for the monthly donut
 * (spec §6.1). `records` may be sparse: a date within the month that has
 * no matching record is exactly what "미입력" means here — this is the
 * smallest safe representation for "unentered date" that doesn't require
 * widening WorkLogRecord.status to nullable.
 *
 * `referenceDate` is "today" and must be passed explicitly — future dates
 * (relative to it) are never tallied at all, in any bucket, matching the
 * "X일 경과 / Y일" framing in the approved image.
 *
 * Assigns no colors; that is a presentation concern for the future donut
 * component.
 */
export function aggregateMonthlyAttendance(
  records: WorkLogRecord[],
  monthAnchor: Date,
  referenceDate: Date,
): MonthlyAttendanceCounts {
  const counts: MonthlyAttendanceCounts = {
    근무: 0,
    조퇴: 0,
    반차: 0,
    휴일: 0,
    연차: 0,
    병가: 0,
    결근: 0,
    미입력: 0,
    workdayTotal: 0,
  };

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(referenceDate);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (date.getTime() > today.getTime()) {
      continue; // future dates are never counted, not even as 미입력
    }
    const record = records.find((r) => isSameDay(r.date, date));
    if (!record) {
      counts.미입력 += 1;
      continue;
    }
    counts[record.status] += 1;
  }

  counts.workdayTotal = counts.근무 + counts.조퇴 + counts.반차;
  return counts;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Annual counterpart of {@link aggregateMonthlyAttendance} — same
 * day-by-day counting rule (a future date is never tallied, not even as
 * 미입력), just over the full calendar year of `yearAnchor` instead of one
 * month. Used by the Attendance Management page's annual donut.
 */
export function aggregateYearlyAttendance(
  records: WorkLogRecord[],
  yearAnchor: Date,
  referenceDate: Date,
): MonthlyAttendanceCounts {
  const counts: MonthlyAttendanceCounts = {
    근무: 0,
    조퇴: 0,
    반차: 0,
    휴일: 0,
    연차: 0,
    병가: 0,
    결근: 0,
    미입력: 0,
    workdayTotal: 0,
  };

  const year = yearAnchor.getFullYear();
  const daysInYear = isLeapYear(year) ? 366 : 365;
  const today = startOfDay(referenceDate);

  for (let dayOfYear = 0; dayOfYear < daysInYear; dayOfYear++) {
    const date = new Date(year, 0, 1 + dayOfYear);
    if (date.getTime() > today.getTime()) {
      continue;
    }
    const record = records.find((r) => isSameDay(r.date, date));
    if (!record) {
      counts.미입력 += 1;
      continue;
    }
    counts[record.status] += 1;
  }

  counts.workdayTotal = counts.근무 + counts.조퇴 + counts.반차;
  return counts;
}

export interface MonthlyAbnormalCounts {
  /** 0-indexed (0 = 1월), matching Date.getMonth(). */
  month: number;
  late: number;
  earlyLeave: number;
  absent: number;
}

/**
 * One entry per calendar month of `yearAnchor`'s year — counts of actual
 * abnormal-attendance events (지각/조퇴/결근) for the annual monthly-flow
 * stacked bar. 지각 is derived from each record's own effective lateness
 * (respects the on-time override, same as every other lateness display in
 * this app); 조퇴/결근 are plain actual-status counts. A future date's
 * record (there should be none) is never counted, matching every other
 * annual/monthly aggregate's own future-exclusion rule.
 */
export function computeMonthlyAbnormalAttendance(
  records: WorkLogRecord[],
  yearAnchor: Date,
  referenceDate: Date,
  getEffectiveLateness: (record: WorkLogRecord) => { status: string },
): MonthlyAbnormalCounts[] {
  const year = yearAnchor.getFullYear();
  const today = startOfDay(referenceDate);
  const months: MonthlyAbnormalCounts[] = Array.from({ length: 12 }, (_, month) => ({ month, late: 0, earlyLeave: 0, absent: 0 }));

  for (const record of records) {
    if (record.date.getFullYear() !== year) continue;
    if (record.date.getTime() > today.getTime()) continue;
    const bucket = months[record.date.getMonth()];
    if (getEffectiveLateness(record).status === "late") bucket.late += 1;
    if (record.status === "조퇴") bucket.earlyLeave += 1;
    if (record.status === "결근") bucket.absent += 1;
  }

  return months;
}

/**
 * Real calendar day-of-year semantics, scoped to one month (attendance
 * follow-up §18's monthly flow chart tooltip) — the same "elapsed days"
 * concept the annual donut uses (see aggregateYearlyAttendance's own
 * day-by-day iteration), not a new workday-eligibility rule: a fully past
 * month's denominator is its full day count, the current month's is
 * referenceDate's day-of-month, and a future month elapses zero days (and
 * therefore never has events to begin with).
 */
export function monthElapsedDays(year: number, month: number, referenceDate: Date): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1);
  const refStart = startOfDay(referenceDate);
  if (monthStart.getTime() > refStart.getTime()) return 0;
  if (referenceDate.getFullYear() === year && referenceDate.getMonth() === month) return referenceDate.getDate();
  return daysInMonth;
}

/** 정시 출근율 — evaluable workday records only (a workday with both a
 *  clock-in and an applied start-time criterion, i.e. getEffectiveLateness
 *  resolves to "on-time" or "late"; not-applicable/criterion-required days
 *  are excluded from both the numerator and denominator, never counted as
 *  a miss). Returns null when there is nothing evaluable at all. */
export function computeOnTimeRate(
  records: WorkLogRecord[],
  getEffectiveLateness: (record: WorkLogRecord) => { status: string },
): { onTimeDays: number; evaluableDays: number; rate: number | null } {
  let onTimeDays = 0;
  let evaluableDays = 0;
  for (const record of records) {
    const result = getEffectiveLateness(record);
    if (result.status === "on-time" || result.status === "late") {
      evaluableDays += 1;
      if (result.status === "on-time") onTimeDays += 1;
    }
  }
  return { onTimeDays, evaluableDays, rate: evaluableDays > 0 ? onTimeDays / evaluableDays : null };
}

/** 평균 근무 시간 — mean of getNetWorkMinutes() across workday-status
 *  records only (실근무 기준, per the confirmed KPI definition), null when
 *  there are none. */
export function computeAverageWorkMinutes(
  records: WorkLogRecord[],
  getNetWorkMinutes: (record: WorkLogRecord) => number,
): number | null {
  const workdayRecords = records.filter((r) => isWorkdayStatus(r.status));
  if (workdayRecords.length === 0) return null;
  const total = workdayRecords.reduce((sum, r) => sum + getNetWorkMinutes(r), 0);
  return Math.round(total / workdayRecords.length);
}
