import type { ChecklistState } from "./types";

export type ArchivePeriod = { itemId: string; archivedOn: string; restoredOn: string | null };

/**
 * Whether an item is "live" on a date: on/after its start date and outside
 * every archive interval [archivedOn, restoredOn). Archived intervals are
 * neither failures nor missing data.
 */
export function isActiveOn(date: string, startDate: string, periods: readonly ArchivePeriod[], archivedOn?: string | null): boolean {
  if (date < startDate) return false;
  if (archivedOn && date >= archivedOn) return false;
  return !periods.some(p => date >= p.archivedOn && (p.restoredOn == null || date < p.restoredOn));
}

export type RateSummary = {
  /** Active item-days considered (today counts only once recorded). */
  eligible: number;
  success: number;
  failure: number;
  notRecorded: number;
  untouched: number;
  /** success / (eligible − notRecorded): NOT_RECORDED leaves the denominator, never counts as failure. */
  completionRate: number | null;
  /** (success + failure) / eligible: how much of the period was actually recorded. */
  recordingRate: number | null;
  /** failure / (eligible − notRecorded). */
  failureRate: number | null;
  /** notRecorded / eligible. */
  notRecordedRate: number | null;
};

export function emptySummary(): RateSummary {
  return { eligible: 0, success: 0, failure: 0, notRecorded: 0, untouched: 0, completionRate: null, recordingRate: null, failureRate: null, notRecordedRate: null };
}

/** Adds one active item-day. `isToday` untouched cells are pending, not missing. */
export function addCell(summary: RateSummary, state: ChecklistState, isToday: boolean) {
  if (state === "UNTOUCHED" && isToday) return;
  summary.eligible++;
  if (state === "SUCCESS") summary.success++;
  else if (state === "FAILURE") summary.failure++;
  else if (state === "NOT_RECORDED") summary.notRecorded++;
  else summary.untouched++;
}

/** Every item-day weighs the same — importance never changes the math. */
export function finalize(summary: RateSummary): RateSummary {
  const assessable = summary.eligible - summary.notRecorded;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
  return {
    ...summary,
    completionRate: pct(summary.success, assessable),
    recordingRate: pct(summary.success + summary.failure, summary.eligible),
    failureRate: pct(summary.failure, assessable),
    notRecordedRate: pct(summary.notRecorded, summary.eligible),
  };
}

/**
 * Current success streak ending at the latest active day. NOT_RECORDED and
 * inactive days are skipped (neither extend nor break it); an untouched
 * today is pending; FAILURE or an untouched past day ends it.
 */
export function currentStreak(datesDescending: readonly string[], today: string, active: (date: string) => boolean, state: (date: string) => ChecklistState): number {
  let streak = 0;
  for (const date of datesDescending) {
    if (date > today || !active(date)) continue;
    const s = state(date);
    if (s === "SUCCESS") streak++;
    else if (s === "NOT_RECORDED" || (s === "UNTOUCHED" && date === today)) continue;
    else break;
  }
  return streak;
}

export function formatRate(value: number | null) {
  return value == null ? "—" : `${Math.round(value)}%`;
}
