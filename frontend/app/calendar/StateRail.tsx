"use client";

import type { CalendarStateBlockDto } from "@/lib/api/types";
import { minutesFromMidnight, parseLocalDateTime } from "@/lib/date";
import { STATE_COLORS } from "@/lib/calendarColor";

const HOUR_HEIGHT = 60;
const PX_PER_MIN = HOUR_HEIGHT / 60;

/**
 * Day view's dedicated State Rail — a thin, readable left-side column
 * showing each state segment's color, label, and time range. Activity
 * cards stay the primary visual layer; this column never competes with
 * them for width (locked V1 policy §11).
 */
export function StateRail({ stateBlocks }: { stateBlocks: CalendarStateBlockDto[] }) {
  return (
    <div className="relative w-[88px] shrink-0 border-r border-zinc-200 dark:border-zinc-800" style={{ height: HOUR_HEIGHT * 24 }}>
      {stateBlocks.map((state) => {
        const startMin = minutesFromMidnight(parseLocalDateTime(state.startAt));
        const endMin = minutesFromMidnight(parseLocalDateTime(state.endAt));
        const color = STATE_COLORS[state.stateGroup];
        const heightPx = Math.max((endMin - startMin) * PX_PER_MIN, 18);
        return (
          <div
            key={state.id}
            className={`absolute inset-x-1 overflow-hidden rounded-sm border-l-2 px-1 py-0.5 text-[10px] leading-tight ${color.bg} ${color.border} ${color.text}`}
            style={{ top: startMin * PX_PER_MIN, height: heightPx }}
            title={`${state.label} ${state.startAt.slice(11, 16)}–${state.endAt.slice(11, 16)}`}
          >
            <div className="truncate font-medium">{state.label}</div>
            {heightPx > 30 && (
              <div className="truncate opacity-70">
                {state.startAt.slice(11, 16)}–{state.endAt.slice(11, 16)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Week view's compact per-day-column strip — a thin colored vertical bar
 *  at the column's left edge, label shown only when there is room. */
export function WeekStateStrip({
  stateBlocks,
  pxPerMin,
  width,
}: {
  stateBlocks: CalendarStateBlockDto[];
  pxPerMin: number;
  width: number;
}) {
  return (
    <>
      {stateBlocks.map((state) => {
        const startMin = minutesFromMidnight(parseLocalDateTime(state.startAt));
        const endMin = minutesFromMidnight(parseLocalDateTime(state.endAt));
        const color = STATE_COLORS[state.stateGroup];
        const heightPx = Math.max((endMin - startMin) * pxPerMin, 6);
        return (
          <div
            key={state.id}
            className={`pointer-events-none absolute left-0 rounded-r-sm ${color.dot}`}
            style={{ top: startMin * pxPerMin, height: heightPx, width }}
            title={`${state.label} ${state.startAt.slice(11, 16)}–${state.endAt.slice(11, 16)}`}
          />
        );
      })}
    </>
  );
}
