"use client";

import type { CalendarUnscheduledActualDto } from "@/lib/api/types";
import { formatDuration } from "./duration";
import type { PointerEvent } from "react";

interface UnscheduledActualPanelProps {
  items: CalendarUnscheduledActualDto[];
  onScheduleRequest: (item: CalendarUnscheduledActualDto, additive?:boolean) => void;
  isSelected?:(item:CalendarUnscheduledActualDto)=>boolean;
  onItemPointerDown?: (event:PointerEvent, item:CalendarUnscheduledActualDto)=>void;
}

/** Actual records with duration but no start/end — quiet, actionable empty
 *  state when none exist; otherwise a compact chip list. Clicking a chip
 *  opens the same schedule flow drag-to-grid would (a lightweight
 *  time-picker prompt), rather than requiring drag as the only path. */
export function UnscheduledActualPanel({ items, onScheduleRequest, onItemPointerDown, isSelected }: UnscheduledActualPanelProps) {
  if (items.length === 0) {
    return <p className="px-1 text-xs text-zinc-400">미지정 항목 없음</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 px-1">
      {items.map((item) => (
        <button
          key={`${item.sourceType}-${item.sourceId}`}
          type="button"
          onClick={event => { if(!onItemPointerDown || event.detail === 0) onScheduleRequest(item,event.ctrlKey || event.metaKey); }}
          onPointerDown={event=>onItemPointerDown?.(event,item)}
          aria-pressed={isSelected?.(item)} data-selected={isSelected?.(item)}
          data-unscheduled-source={`${item.sourceType}:${item.sourceId}`}
          style={{outline:isSelected?.(item) ? "2px solid #0ea5e9" : undefined,touchAction:"none",cursor:onItemPointerDown ? "grab" : undefined}}
          className="flex min-w-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[10px] text-zinc-600 hover:bg-zinc-100"
          title={`${item.title} · ${formatDuration(item.durationMinutes)} — 드래그하여 시간 배치 / 클릭하여 편집`}
        >
          <span className="truncate font-medium">{item.title}</span>
          <span className="shrink-0 text-zinc-400">{formatDuration(item.durationMinutes)}</span>
        </button>
      ))}
    </div>
  );
}
