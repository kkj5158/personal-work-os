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

export function formatKoreanDateWithWeekday(date: Date): string {
  return `${formatKoreanDate(date)} (${formatKoreanWeekday(date).slice(0, 1)})`;
}

// Shared focus-visible treatment for every interactive element in this route.
export const FOCUS_VISIBLE =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-outline";
