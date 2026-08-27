// The backend's product-date semantics are explicitly Asia/Seoul (see
// docs/product/work-log-policy.md) — today/this-week/this-month, and what
// counts as a "future" date, must agree with the backend regardless of the
// browser's own timezone. Asia/Seoul has used a fixed UTC+9 offset with no
// DST since 1961, so a constant shift is exact, not an approximation.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

// A Date whose UTC-based getters (getUTCFullYear, getUTCMonth, getUTCDate,
// getUTCHours, ...) read as the current Asia/Seoul wall-clock time. Not
// meant to be read via local getters (getFullYear, etc.) — those still
// reflect the browser's own timezone on this particular Date instance.
export function seoulNow(): Date {
  return new Date(Date.now() + SEOUL_OFFSET_MS);
}

// Today's Seoul calendar date, expressed as a "naive" local Date at
// midnight — the same representation lib/date.ts's helpers already use for
// every other date in this codebase (see its own file-level comment), so
// the result can be compared, formatted, and passed around exactly like any
// other record date (isSameDay, startOfWeek, toDateKey, ...).
export function seoulToday(): Date {
  const s = seoulNow();
  return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
}

// True when `date` (compared at day granularity, ignoring time-of-day) is
// strictly after the current Seoul calendar date — i.e. a date that hasn't
// happened yet and therefore cannot have a "미입력" (unentered) or any other
// attendance outcome, only "no data yet because it isn't here".
export function isFutureSeoulDate(date: Date, referenceDate: Date = seoulToday()): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return d.getTime() > ref.getTime();
}

// Milliseconds until the next Asia/Seoul midnight, for scheduling a
// rollover timer. Always positive (at least 1ms out, never 0/negative), so
// callers can pass this straight to setTimeout without an extra guard.
export function msUntilNextSeoulMidnight(): number {
  const s = seoulNow();
  const nextSeoulMidnightUtcMs = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 1) - SEOUL_OFFSET_MS;
  return Math.max(1, nextSeoulMidnightUtcMs - Date.now());
}
