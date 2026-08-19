// All helpers here are timezone-naive: they operate on the browser's local
// wall-clock fields directly (never toISOString()/UTC conversion), so the
// strings sent to the API are naive "yyyy-MM-ddTHH:mm:ss" values. The backend
// is the single place that assigns a timezone (Asia/Seoul) to those values.

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toLocalDateTimeString(date: Date): string {
  return `${toDateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function parseLocalDateTime(value: string): Date {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = (timePart ?? "00:00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second || 0);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Monday-start week.
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(d, diff);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDayHeader(date: Date): string {
  return `${WEEKDAY_LABELS[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatHourLabel(hour: number): string {
  return `${pad2(hour)}:00`;
}

export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
