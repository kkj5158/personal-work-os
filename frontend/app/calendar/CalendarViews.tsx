"use client";

export type CalendarSurface = "calendar" | "timetable" | "sleep";
export const CALENDAR_SURFACES = [
  { value: "calendar", label: "일 / 주 캘린더" },
  { value: "timetable", label: "시간표" },
  { value: "sleep", label: "수면 시간표" },
] as const;

/** Same-page surface state. Query context is bookmarkable; no route/tab/window is opened. */
export function calendarSurfaceQuery(current: string, surface: CalendarSurface) {
  const query = new URLSearchParams(current);
  if (surface === "calendar") query.delete("tab"); else query.set("tab", surface);
  return `/calendar${query.size ? `?${query}` : ""}`;
}

export function CalendarViews({ current, onChange }: { current: CalendarSurface; onChange: (surface: CalendarSurface) => void }) {
  return <nav className="calendar-views" aria-label="캘린더 보기">{CALENDAR_SURFACES.map(item =>
    <button key={item.value} type="button" aria-current={current === item.value ? "page" : undefined}
      onClick={() => { if (current !== item.value) onChange(item.value); }}>{item.label}</button>
  )}</nav>;
}
