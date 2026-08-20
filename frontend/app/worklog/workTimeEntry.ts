// Route-local type for the future additive work-time entry model
// (docs/frontend/work-log/work-log-ui-spec.md §10, "업무시간 기록").
//
// This is prepared ahead of the Work-time Entry Modal phase but is NOT yet
// wired into WorkLogRecord as the source of truth for `실근무`. See
// mockData.ts for why that migration is deferred.

export interface WorkTimeEntry {
  id: string;
  /** Free-text category/item label (spec §10: example categories only, not a fixed enum). */
  item: string;
  minutes: number;
  memo?: string;
}

export function sumWorkTimeEntries(entries: WorkTimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}
