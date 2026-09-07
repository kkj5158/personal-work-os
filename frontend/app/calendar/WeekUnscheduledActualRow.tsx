"use client";

import type { CalendarUnscheduledActualDto } from "@/lib/api/types";
import { toDateKey } from "@/lib/date";
import { UnscheduledActualPanel } from "./UnscheduledActualPanel";

interface WeekUnscheduledActualRowProps {
  days: Date[];
  items: CalendarUnscheduledActualDto[];
  onScheduleRequest: (item: CalendarUnscheduledActualDto) => void;
}

/** Each date owns its own small Unscheduled Actual area (locked V1 policy
 *  §9) — mirrors TimeGrid's own `56px gutter + N day columns` template so
 *  the per-day areas line up with their date columns above. */
export function WeekUnscheduledActualRow({ days, items, onScheduleRequest }: WeekUnscheduledActualRowProps) {
  const itemsByDate = new Map<string, CalendarUnscheduledActualDto[]>();
  for (const item of items) {
    const bucket = itemsByDate.get(item.date);
    if (bucket) bucket.push(item);
    else itemsByDate.set(item.date, [item]);
  }

  return (
    <div
      className="grid gap-x-0 rounded-md border border-zinc-200 dark:border-zinc-800"
      style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(120px, 1fr))` }}
    >
      <div className="flex items-center justify-end px-2 py-1.5 text-[11px] text-zinc-400">시간 미지정</div>
      {days.map((date) => {
        const key = toDateKey(date);
        const dayItems = itemsByDate.get(key) ?? [];
        return (
          <div key={key} className="border-l border-zinc-200 p-1.5 dark:border-zinc-800">
            {dayItems.length === 0 ? (
              <span className="text-[11px] text-zinc-300 dark:text-zinc-600">–</span>
            ) : (
              <UnscheduledActualPanel items={dayItems} onScheduleRequest={onScheduleRequest} />
            )}
          </div>
        );
      })}
    </div>
  );
}
