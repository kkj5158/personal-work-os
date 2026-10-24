import {
  addDays,
  daysBetween,
  monthEnd,
  monthStart,
  weekStart,
} from "@/lib/diet/model";
import type { DayMetrics } from "@/lib/api/calendarReviews";
export { addDays, daysBetween, weekStart };
export function monthDates(date: string) {
  const first = weekStart(monthStart(date));
  const last = addDays(weekStart(monthEnd(date)), 6);
  return daysBetween(first, last);
}
export function shiftMonth(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))
    .toISOString()
    .slice(0, 10);
}
export const moodEmoji = (mood: number | null | undefined) =>
  mood == null
    ? "—"
    : ["😞", "🙁", "😐", "🙂", "😄"][
        Math.max(0, Math.min(4, Math.round(mood) - 1))
      ];
export const workDuration = (minutes: number | null | undefined) =>
  minutes == null
    ? "—"
    : `${String(Math.floor(minutes / 60)).padStart(2, "0")}h ${String(minutes % 60).padStart(2, "0")}m`;
export function average(values: (number | null | undefined)[]) {
  const recorded = values.filter((v): v is number => v != null);
  return {
    value: recorded.length
      ? recorded.reduce((a, b) => a + b, 0) / recorded.length
      : null,
    count: recorded.length,
  };
}
export function weeklyMetrics(days: DayMetrics[], monday: string) {
  const rows = days.filter(
    (d) => d.date >= monday && d.date <= addDays(monday, 6),
  );
  const work = rows.filter((d) => d.workMinutes != null);
  return {
    work: {
      value: work.length
        ? work.reduce((sum, d) => sum + d.workMinutes!, 0)
        : null,
      count: work.length,
    },
    workScore: average(rows.map((d) => d.workScore)),
    mood: average(rows.map((d) => d.reflection?.mood)),
    score: average(rows.map((d) => d.reflection?.score)),
  };
}
export const reviewRangeFor = (date: string, view: "day" | "week" | "month") =>
  view === "month"
    ? monthDates(date)
    : view === "week"
      ? daysBetween(weekStart(date), addDays(weekStart(date), 6))
      : [date];
