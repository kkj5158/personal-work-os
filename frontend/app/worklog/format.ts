import { formatKoreanDate, formatKoreanWeekday } from "@/lib/date";

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

// Formats a raw lateMinutes value for display (spec §6.2/§7/§9): "-" when
// unknown/not applicable, "정시 출근" for zero, "{n}분 지각" otherwise. Pure
// formatting only — does not calculate or infer lateness from clock times.
export function formatLateness(lateMinutes: number | null): string {
  if (lateMinutes == null) return "–";
  if (lateMinutes === 0) return "정시 출근";
  return `${lateMinutes}분 지각`;
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
