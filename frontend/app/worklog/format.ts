import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import type { LatenessResult } from "./selectors";
import type { AppliedStartTime } from "./startTimeCriterion";

export function formatHoursMinutes(totalMinutes: number | null): string {
  if (totalMinutes == null) return "–";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Parses a "HH:MM" (or "H:MM") string back into minutes. Returns null for
// anything that isn't a valid time-like value, so callers can decide
// whether to keep the previous value on an invalid edit.
export function parseHoursMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function formatClockRange(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "–";
  return `${clockIn} – ${clockOut}`;
}

// Strict 24-hour time-of-day parser for clock-in/out and start-time-
// criterion values — deliberately separate from parseHoursMinutes above
// (which permits up to 3-digit hours and a non-zero-padded single digit,
// intended for HH:MM *duration* values like "120:30"). Only exact
// zero-padded "HH:MM" with HH in 00–23 and MM in 00–59 is valid; anything
// else ("24:00", "8:00", "09:0", empty string, ...) returns null so callers
// can treat it as "not applicable" defensively instead of crashing or
// producing NaN.
export function parseTimeOfDayMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

// Displays a stored 24-hour "HH:MM" clock string as-is (spec v3: Work
// Log-wide 24-hour display — clockIn/clockOut are already stored zero-padded
// 24-hour, so no conversion is needed, only the shared "–" empty-state
// convention). Clock timestamps only — never apply this to HH:MM duration
// values (체류 시간/실근무/etc. keep using formatHoursMinutes).
export function formatClockTime24Hour(value: string | null): string {
  return value ?? "–";
}

// Formats a clock-in/clock-out pair as a single 24-hour range string (e.g.
// "09:12–18:02") for the weekly/monthly tables and Today Work (spec v3 §8:
// replaces the previous 12-hour AM/PM range display). Each side is
// independently optional — a record may have only clocked in, only clocked
// out, or neither — so this doesn't delegate to formatClockTime24Hour's own
// "–" for each missing side, which would produce a doubled/tripled dash when
// the two sides are joined.
export function formatClockRange24Hour(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn && !clockOut) return "–";
  return `${clockIn ?? ""}–${clockOut ?? ""}`;
}

// Formats a LatenessResult (from selectors.ts's getLateness) for display —
// the single shared formatter every consumer must use instead of deriving
// its own lateness string. Uses "–" (en dash) for the not-applicable case
// to match every other "no value" formatter in this file (formatHoursMinutes,
// formatClockRange, etc.) rather than an em dash, for visual consistency.
export function formatLatenessResult(result: LatenessResult): string {
  switch (result.status) {
    case "not-applicable":
      return "–";
    case "criterion-required":
      return "기준 필요";
    case "on-time":
      return "정시 출근";
    case "late":
      return `${result.minutes}분`;
  }
}

// Weekly/monthly table-specific lateness display (spec v3 §10): the table
// column truncates any lateness of 10 minutes or more to "10+" to keep the
// column narrow and scannable — the exact minute value is still available
// via this cell's hover/focus tooltip (WorkLogTable) and unconditionally via
// formatLatenessResult in Today Summary/the record-detail modal, so no
// information is lost, only the table's default rendering is compacted.
// "기준 필요" collapses into the same "–" as not-applicable here, matching
// the table's simpler 4-state legend (0 / 1–9 / 10+ / –) instead of Today's
// 5-state one.
export function formatLatenessTableDisplay(result: LatenessResult): string {
  switch (result.status) {
    case "not-applicable":
    case "criterion-required":
      return "–";
    case "on-time":
      return "정시 출근";
    case "late":
      return result.minutes >= 10 ? "10+" : `${result.minutes}분`;
  }
}

// Table-specific lateness color (spec v3 §10: on-time green, any lateness
// red, unavailable muted gray) — deliberately simpler than
// getLatenessResultClassName below, which keeps a distinct amber for
// "criterion-required" outside the table (a single prominent field, where
// that extra distinction is worth the color).
export function getLatenessTableClassName(result: LatenessResult): string {
  switch (result.status) {
    case "on-time":
      return "text-success-fg";
    case "late":
      return "text-danger-fg";
    default:
      return "text-fg-muted";
  }
}

// Shared semantic text color for a LatenessResult, reusing the existing
// GitHub-Light tokens: muted for not-applicable, warning (amber) for
// criterion-required, success (green) for on-time, danger (red) for late.
export function getLatenessResultClassName(result: LatenessResult): string {
  switch (result.status) {
    case "not-applicable":
      return "text-fg-muted";
    case "criterion-required":
      return "text-warning-fg";
    case "on-time":
      return "text-success-fg";
    case "late":
      return "text-danger-fg";
  }
}

// Formats a record's stored AppliedStartTime snapshot for read-only display
// (record-detail view mode) — always renders exactly what's in the
// snapshot, never a live criteria lookup, so a renamed/retimed/deactivated
// criterion never changes how a past record reads.
export function formatAppliedStartTime(value: AppliedStartTime | null): string {
  if (value == null) return "미설정";
  if (value.source === "custom") return `직접 입력 · ${value.startTime}`;
  return `${value.criterionName} · ${value.startTime}`;
}

export function formatKoreanDateWithWeekday(date: Date): string {
  return `${formatKoreanDate(date)} (${formatKoreanWeekday(date).slice(0, 1)})`;
}

// Compact M/D–M/D label for the trend-chart x-axis (spec: e.g. "8/1–8/2",
// "8/31" for a single-day block) — deliberately shorter than
// formatKoreanDateRange, which is too wide for 4–6 chart positions. Local
// Date field access only, no toISOString()/UTC conversion.
export function formatCompactDateRange(start: Date, end: Date): string {
  const startLabel = `${start.getMonth() + 1}/${start.getDate()}`;
  const endLabel = `${end.getMonth() + 1}/${end.getDate()}`;
  return startLabel === endLabel ? startLabel : `${startLabel}–${endLabel}`;
}

// Shared focus-visible treatment for every interactive element in this route.
export const FOCUS_VISIBLE =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-outline";
