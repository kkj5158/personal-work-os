/** Actual is a date-level assertion, independent of today's current clock. */
export function calendarToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const futureActualMessage = "내일 이후 일정은 Plan으로 기록됩니다.";
export const actualAllowed = (date: string, now = new Date()) => date <= calendarToday(now);
