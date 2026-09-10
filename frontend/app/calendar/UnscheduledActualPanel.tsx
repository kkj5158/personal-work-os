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
    <div className="flex min-w-0 flex-col gap-1 px-1">
      {items.map((item) => (
        <button
          key={`${item.sourceType}-${item.sourceId}`}
          type="button"
          onClick={() => onScheduleRequest(item)}
          className="flex min-w-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[10px] text-zinc-600 hover:bg-zinc-100"
          title={`${item.title} · ${item.durationMinutes}분 — 클릭하여 편집`}
        >
          <span className="truncate font-medium">{item.title}</span>
          <span className="shrink-0 text-zinc-400">{item.durationMinutes}분</span>
        </button>
      ))}
    </div>
  );
}
