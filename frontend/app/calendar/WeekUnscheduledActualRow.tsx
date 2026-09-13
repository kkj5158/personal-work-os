"use client";

import type { CalendarUnscheduledActualDto } from "@/lib/api/types";
import { toDateKey } from "@/lib/date";
import { UnscheduledActualPanel } from "./UnscheduledActualPanel";
import type { PointerEvent } from "react";

interface WeekUnscheduledActualRowProps {
  days: Date[];
  items: CalendarUnscheduledActualDto[];
  onScheduleRequest: (item: CalendarUnscheduledActualDto) => void;
  onItemPointerDown?: (event:PointerEvent,item:CalendarUnscheduledActualDto)=>void;
  activeDropDate?: string;
}

/** Each date owns its own small Unscheduled Actual area (locked V1 policy
 *  §9) — mirrors TimeGrid's own `48px gutter + N day columns` template so
 *  the per-day areas line up with their date columns above. */
export function WeekUnscheduledActualRow({ days, items, onScheduleRequest, onItemPointerDown, activeDropDate }: WeekUnscheduledActualRowProps) {
  const itemsByDate = new Map<string, CalendarUnscheduledActualDto[]>();
  for (const item of items) {
    const bucket = itemsByDate.get(item.date);
    if (bucket) bucket.push(item);
    else itemsByDate.set(item.date, [item]);
  }

  return (
    <div
      className="grid gap-x-0 rounded-md border border-zinc-200"
      style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(92px, 1fr))` }}
    >
      <div className="flex items-center justify-end px-2 py-1.5 text-[11px] text-zinc-400">시간 미지정</div>
      {days.map((date) => {
        const key = toDateKey(date);
        const dayItems = itemsByDate.get(key) ?? [];
        return (
          <div key={key} data-unscheduled-date={key} aria-label={`${key} 시간 미지정`} className={`min-h-12 border-l border-zinc-200 p-1.5 ${activeDropDate === key ? "bg-sky-100 ring-2 ring-inset ring-sky-400" : ""}`}>
            {dayItems.length === 0 ? (
              <span className="text-[11px] text-zinc-300">–</span>
            ) : (
              <UnscheduledActualPanel items={dayItems} onScheduleRequest={onScheduleRequest} onItemPointerDown={onItemPointerDown} />
            )}
          </div>
        );
      })}
    </div>
  );
}
