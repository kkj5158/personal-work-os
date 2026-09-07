"use client";

import type { CalendarUnscheduledActualDto } from "@/lib/api/types";

interface UnscheduledActualPanelProps {
  items: CalendarUnscheduledActualDto[];
  onScheduleRequest: (item: CalendarUnscheduledActualDto) => void;
}

/** Actual records with duration but no start/end — quiet, actionable empty
 *  state when none exist; otherwise a compact chip list. Clicking a chip
 *  opens the same schedule flow drag-to-grid would (a lightweight
 *  time-picker prompt), rather than requiring drag as the only path. */
export function UnscheduledActualPanel({ items, onScheduleRequest }: UnscheduledActualPanelProps) {
  if (items.length === 0) {
    return <p className="px-1 text-xs text-zinc-400">미지정 항목 없음</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {items.map((item) => (
        <button
          key={`${item.sourceType}-${item.sourceId}`}
          type="button"
          onClick={() => onScheduleRequest(item)}
          className="flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="시간대를 지정하려면 클릭하세요"
        >
          <span className="font-medium">{item.title}</span>
          <span className="text-zinc-400">· {item.durationMinutes}분</span>
        </button>
      ))}
    </div>
  );
}
