import { isSameDay, startOfDay } from "@/lib/date";
import type { AttendanceStatus, WorkLogRecord } from "./mockData";

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
