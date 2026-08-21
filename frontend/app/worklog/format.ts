import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";
import type { LatenessResult } from "./selectors";

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

// Formats a stored 24-hour "HH:MM" clock string as 12-hour AM/PM, e.g.
// "09:12" -> "09:12 AM", "18:02" -> "06:02 PM" (spec §6.2/§7). Clock
// timestamps only — never apply this to HH:MM duration values (체류
// 시간/실근무/etc. keep using formatHoursMinutes). Not yet adopted by any
// rendered component in this phase; the weekly-table implementation phase
// wires it in.
export function formatClockTime12Hour(value: string | null): string {
  if (!value) return "–";
  const [hourStr, minuteStr] = value.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12.toString().padStart(2, "0")}:${minuteStr} ${period}`;
}

// Formats a clock-in/clock-out pair as a single AM/PM range string for the
// weekly table (spec: en dash consistently, never concatenate placeholder
// strings at the call site). Each side is independently optional — a record
// may have only clocked in, only clocked out, or neither — so this doesn't
// delegate to formatClockTime12Hour's own "–" for each missing side, which
// would produce a doubled/tripled dash when the two sides are joined.
export function formatClockRange12Hour(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn && !clockOut) return "–";
  const inPart = clockIn ? formatClockTime12Hour(clockIn) : "";
  const outPart = clockOut ? formatClockTime12Hour(clockOut) : "";
  return `${inPart}–${outPart}`;
}

// Parses a 12-hour clock string like "09:12 AM" / "9:12 pm" back into the
// stored 24-hour "HH:mm" format (spec: clock edit input must clearly support
// AM/PM, never silently reuse the HH:MM *duration* parser above — durations
// and clock timestamps are different concepts that happen to share digits).
// Returns null for anything that isn't a valid 12-hour clock value, so
// callers can block the save and keep the previously stored value.
export function parseClockTime12Hour(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (hour12 < 1 || hour12 > 12) return null;
  const hour24 = period === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
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
      return "정상";
    case "late":
      return `${result.minutes}분`;
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
