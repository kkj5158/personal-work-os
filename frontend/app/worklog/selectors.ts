import { addDays, isSameDay, startOfWeek, toDateKey } from "@/lib/date";
import type { WorkLogRecord } from "./mockData";

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
