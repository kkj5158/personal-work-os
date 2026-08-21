import { addDays, isSameDay, startOfWeek, toDateKey } from "@/lib/date";
import type { WorkLogRecord } from "./mockData";
import { sumWorkTimeEntries } from "./workTimeEntry";
import { isWorkdayStatus } from "./attendance";

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
export function getWeeklyTrendPoints(records: WorkLogRecord[]): WorkLogTrendPoint[] {
  return groupRecordsByWeek(records).map((group) => ({
    key: group.key,
    rangeStart: group.records[0].date,
    rangeEnd: group.records[group.records.length - 1].date,
    netWorkMinutes: group.records.reduce((sum, record) => sum + getNetWorkMinutes(record), 0),
    averageScore: getAverageScore(group.records),
  }));
}
