"use client";

import type { ReflectionSnapshotDto } from "@/lib/api/types";
import { STATE_COLORS } from "@/lib/calendarColor";
import { colorForCategory } from "@/lib/categoryColor";

const RANGE_START_MIN = 0;
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
  const hourMarks = Array.from({ length: 9 }, (_, i) => i * 3);
  const laneEnds: number[] = [];
  const planned = [...snapshot.plannedBlocks].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((block) => {
    const start = toMinutes(block.startTime);
    const end = start + block.durationMinutes;
    let lane = laneEnds.findIndex((previousEnd) => previousEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    return { block, lane };
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-12 h-4 text-[10px] text-zinc-400">
        {hourMarks.map((h) => (
          <span key={h} className="absolute" style={{ left: `${pct(h * 60)}%`, transform: h === 24 ? "translateX(-100%)" : h === 0 ? undefined : "translateX(-50%)" }}>
            {h.toString().padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <TimelineRow label="PLAN" height={Math.max(1, laneEnds.length) * 28}>
        {planned.map(({ block, lane }) => (
          <div
            key={`${block.semanticType}:${block.sourceId}`}
            className={`absolute top-0.5 h-6 truncate rounded px-1.5 text-[10px] leading-6 ${colorForCategory(block.categoryId).bg} ${colorForCategory(block.categoryId).text}`}
            style={{ top: lane * 28 + 2, left: `${pct(toMinutes(block.startTime))}%`, width: `${pct(toMinutes(block.startTime) + block.durationMinutes) - pct(toMinutes(block.startTime))}%` }}
            title={`${block.label} ${block.startTime.slice(0, 5)}-${block.endTime.slice(0, 5)}`}
          >
            {block.label}
          </div>
        ))}
      </TimelineRow>

      <TimelineRow label="ACTUAL">
        {snapshot.actualBlocks.map((block) => (
          <div
            key={`${block.semanticType}:${block.sourceId}`}
            className={`absolute top-0.5 h-6 truncate rounded px-1.5 text-[10px] leading-6 ${colorForCategory(block.categoryId).bg} ${colorForCategory(block.categoryId).text}`}
            style={{ left: `${pct(toMinutes(block.startTime))}%`, width: `${pct(toMinutes(block.startTime) + block.durationMinutes) - pct(toMinutes(block.startTime))}%` }}
            title={`${block.label} ${block.startTime.slice(0, 5)}-${block.endTime.slice(0, 5)}`}
          >
            {block.label}
          </div>
        ))}
      </TimelineRow>

      <TimelineRow label="STATE" height={16}>
        {snapshot.stateBlocks.map((state, i) => {
          const color = STATE_COLORS[state.stateGroup];
          return (
            <div
              key={i}
              className={`absolute top-0.5 h-3 truncate rounded-sm px-1 text-[9px] leading-3 ${color.bg} ${color.text}`}
              style={{
                left: `${pct(toMinutes(state.startTime.slice(0, 5)))}%`,
                width: `${pct(toMinutes(state.endTime.slice(0, 5)) || RANGE_END_MIN) - pct(toMinutes(state.startTime.slice(0, 5)))}%`,
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

function TimelineRow({ label, children, height = 28 }: { label: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] font-medium text-zinc-500">{label}</span>
      <div className="relative flex-1 rounded bg-zinc-50 dark:bg-zinc-900" style={{ height }}>{children}</div>
    </div>
  );
}
