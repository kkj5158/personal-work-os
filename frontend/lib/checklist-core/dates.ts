// String-based (YYYY-MM-DD, Asia/Seoul) date helpers for checklist grids.
export const seoulToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string) {
  const result: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) result.push(d);
  return result;
}

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function monthEnd(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number) {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export const weekStart = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const weekdayLabel = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
export const dayOfMonth = (date: string) => String(Number(date.slice(8, 10)));
export const monthLabel = (date: string) => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;
