// Pure, framework-free calendar-grid/selection/week-total logic for
// AttendanceCalendar.tsx — split out from the component (which is JSX, and
// so can't be imported directly by this frontend's plain-Node test script
// convention — see attendanceCalendarLogic.test.ts) so it can be unit
// tested without a bundler or test runner.
import { addDays, toDateKey } from "@/lib/date";
import { isWorkdayStatus } from "./attendance";
import { getNetWorkMinutes } from "./selectors";
import type { WorkLogRecord } from "./mockData";

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
