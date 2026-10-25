import { addDays, calendarDates, changeCalendarMonth, type EarningsMonth, type EarningsWeek, type WorkRecord } from "./calendar";

export type DisplayWeekStart = "SUNDAY" | "MONDAY";
export const displayWeekdays = (mode: DisplayWeekStart) => mode === "SUNDAY" ? ["일", "월", "화", "수", "목", "금", "토"] : ["월", "화", "수", "목", "금", "토", "일"];
export const displayDates = (month: string, mode: DisplayWeekStart) => calendarDates(month, mode === "SUNDAY" ? "sunday" : "monday");
/** Existing APIs always read complete Sunday settlement periods, including invisible days. */
export function supplementalMonths(month: string, mode: DisplayWeekStart) {
  const dates = displayDates(month, mode), original = displayDates(month, "SUNDAY");
  return { previous: dates[0] < original[0] ? changeCalendarMonth(month, -1) : null, next: dates.at(-1)! > original.at(-1)! ? changeCalendarMonth(month, 1) : null };
}
export function displayRows(dates: string[], weeks: EarningsWeek[]) {
  return Array.from({ length: dates.length / 7 }, (_, i) => {
    const displayWeekStart = dates[i * 7], displayWeekEnd = dates[i * 7 + 6];
    return { displayWeekStart, displayWeekEnd, settlements: weeks.filter(({ end: settlementEnd }) => settlementEnd >= displayWeekStart && settlementEnd <= displayWeekEnd) };
  });
}
export function mergeDisplayData(primary: EarningsMonth | null | undefined, supplements: (EarningsMonth | null | undefined)[], dates: string[]) {
  const sources = [...supplements, primary].filter((value): value is EarningsMonth => !!value);
  const records = (field: "records" | "archivedRecords" | "allRecords") => [...new Map(sources.flatMap(source => source[field] ?? []).map(record => [record.id, record])).values()]
    .filter(record => record.workDate >= addDays(dates[0], field === "allRecords" ? -1 : 0) && record.workDate <= addDays(dates.at(-1)!, field === "allRecords" ? 1 : 0));
  const weeks = [...new Map(sources.flatMap(source => source.weeks).map(week => [`${week.workplaceId ?? "all"}:${week.start}:${week.end}`, week])).values()].sort((a, b) => a.start.localeCompare(b.start));
  return { records: records("records"), archivedRecords: records("archivedRecords"), allRecords: records("allRecords") as WorkRecord[], weeks };
}
export const weekStartPreferenceKey = (owner: string) => `money:work-calendar:week-start:v1:${encodeURIComponent(owner)}`;
export function readWeekStart(storage: Pick<Storage, "getItem">, owner: string): DisplayWeekStart {
  try { return storage.getItem(weekStartPreferenceKey(owner)) === "MONDAY" ? "MONDAY" : "SUNDAY"; } catch { return "SUNDAY"; }
}
