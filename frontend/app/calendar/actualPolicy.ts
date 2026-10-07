/** Actual is a date-level assertion, independent of today's current clock. */
export function calendarToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const futureActualMessage = "내일 이후 일정은 Plan으로 기록됩니다.";
export const actualAllowed = (date: string, now = new Date()) => date <= calendarToday(now);
/** Date objects in the grid represent calendar dates in the browser, while the
 * source instant is always interpreted in Seoul. */
export const calendarTodayDate = (now = new Date()) => new Date(`${calendarToday(now)}T00:00:00`);
export function calendarNowMinute(now:Date):number {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  return Number(parts.find(p=>p.type === "hour")!.value)*60+Number(parts.find(p=>p.type === "minute")!.value);
}
