"use client";

import type { ReflectionSnapshotDto } from "@/lib/api/types";
import { STATE_COLORS } from "@/lib/calendarColor";
import { colorForCategory } from "@/lib/categoryColor";

const RANGE_START_MIN = 6 * 60;
const RANGE_END_MIN = 24 * 60;
const RANGE_MIN = RANGE_END_MIN - RANGE_START_MIN;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function pct(minutes: number): number {
  return Math.min(Math.max(((minutes - RANGE_START_MIN) / RANGE_MIN) * 100, 0), 100);
}

/** The Reflection snapshot's PLAN / ACTUAL / STATE rows on one shared
 *  horizontal time axis (locked V1 policy §27) — answers "what did I plan,
 *  what happened, what state was I in" at a glance. */
export function ReflectionTimeline({ snapshot }: { snapshot: ReflectionSnapshotDto }) {
  const hourMarks = Array.from({ length: 7 }, (_, i) => 6 + i * 3);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex text-[10px] text-zinc-400">
        {hourMarks.map((h) => (
          <span key={h} style={{ width: `${100 / hourMarks.length}%` }}>
            {h.toString().padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <TimelineRow label="계획">
        {snapshot.plannedBlocks.map((block) => (
          <div
            key={block.sourceId}
            className={`absolute top-0.5 h-6 truncate rounded px-1.5 text-[10px] leading-6 ${colorForCategory(block.categoryId).bg} ${colorForCategory(block.categoryId).text}`}
            style={{ left: `${pct(toMinutes(block.startTime.slice(0, 5)))}%`, width: `${pct(toMinutes(block.endTime.slice(0, 5))) - pct(toMinutes(block.startTime.slice(0, 5)))}%` }}
            title={`${block.label} ${block.startTime.slice(0, 5)}-${block.endTime.slice(0, 5)}`}
          >
            {block.label}
          </div>
        ))}
      </TimelineRow>

      <TimelineRow label="실제">
        {snapshot.actualBlocks.map((block) => (
          <div
            key={block.sourceId}
            className={`absolute top-0.5 h-6 truncate rounded px-1.5 text-[10px] leading-6 ${colorForCategory(block.categoryId).bg} ${colorForCategory(block.categoryId).text}`}
            style={{ left: `${pct(toMinutes(block.startTime.slice(0, 5)))}%`, width: `${pct(toMinutes(block.endTime.slice(0, 5))) - pct(toMinutes(block.startTime.slice(0, 5)))}%` }}
            title={`${block.label} ${block.startTime.slice(0, 5)}-${block.endTime.slice(0, 5)}`}
          >
            {block.label}
          </div>
        ))}
      </TimelineRow>

      <TimelineRow label="상태">
        {snapshot.stateBlocks.map((state, i) => {
          const color = STATE_COLORS[state.stateGroup];
          return (
            <div
              key={i}
              className={`absolute top-0.5 h-6 truncate rounded px-1.5 text-[10px] leading-6 ${color.bg} ${color.text}`}
              style={{
                left: `${pct(toMinutes(state.startTime.slice(0, 5)))}%`,
                width: `${pct(toMinutes(state.endTime.slice(0, 5))) - pct(toMinutes(state.startTime.slice(0, 5)))}%`,
              }}
              title={`${state.label} ${state.startTime.slice(0, 5)}-${state.endTime.slice(0, 5)}`}
            >
              {state.label}
            </div>
          );
        })}
      </TimelineRow>
    </div>
  );
}

function TimelineRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] font-medium text-zinc-500">{label}</span>
      <div className="relative h-7 flex-1 rounded bg-zinc-50 dark:bg-zinc-900">{children}</div>
    </div>
  );
}
