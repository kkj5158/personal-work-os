/** Civil-date arithmetic: UTC is only an integer encoding, never an elapsed local hour. */
export const civilDay = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜를 확인하세요.");
  const value = Date.parse(`${date}T00:00:00Z`) / 86400000;
  if (!Number.isFinite(value) || civilDate(value) !== date) throw new Error("날짜를 확인하세요.");
  return value;
};
export const civilDate = (day: number) => new Date(day * 86400000).toISOString().slice(0, 10);
export type DateRange = { startDate: string; endDate: string };
export type RangeAction = "start" | "end" | "move";
export function shiftDateRange(range: DateRange, action: RangeAction, delta: number): DateRange {
  const a = civilDay(range.startDate), b = civilDay(range.endDate), n = Math.round(delta);
  return { startDate: civilDate(action === "end" ? a : action === "start" ? Math.min(a + n, b) : a + n), endDate: civilDate(action === "start" ? b : action === "end" ? Math.max(b + n, a) : b + n) };
}
export const inclusiveDays = (range: DateRange) => civilDay(range.endDate) - civilDay(range.startDate) + 1;
export type RangeScale = "day" | "week" | "month";
export function dateTicks(start: number, end: number, scale: RangeScale) {
  const ticks: { day: number; label: string }[] = [];
  for (let day = start; day <= end; day++) {
    const d = new Date(day * 86400000), date = civilDate(day);
    if (scale === "day" || (scale === "week" && d.getUTCDay() === 1) || (scale === "month" && d.getUTCDate() === 1)) ticks.push({ day, label: scale === "month" ? date.slice(0, 7) : date.slice(5).replace("-", "/") });
  }
  return ticks;
}
