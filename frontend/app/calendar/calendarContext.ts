import type { CalendarWorkRecordSummaryDto } from "@/lib/api/types";

export function actualWorkingRanges(records: CalendarWorkRecordSummaryDto[]) {
  return records.flatMap(record => record.clockInAt && record.clockOutAt
    ? [{ date: record.date, startAt: record.clockInAt, endAt: record.clockOutAt }]
    : []);
}

export function calendarDateLabel(days: Date[]) {
  const first = days[0];
  if (days.length === 1) return first.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const last = days[days.length - 1];
  const start = first.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const end = last.toLocaleDateString("ko-KR", {
    ...(first.getFullYear() !== last.getFullYear() ? { year: "numeric" as const } : {}), month: "long", day: "numeric",
  });
  return `${start} - ${end}`;
}
