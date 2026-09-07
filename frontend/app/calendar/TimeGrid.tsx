"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarStateBlockDto } from "@/lib/api/types";
import { formatDayHeader, isSameDay, minutesFromMidnight, parseLocalDateTime, startOfDay, toDateKey } from "@/lib/date";
import { resolveBlockColor, type ColorMode } from "@/lib/calendarColor";
import { layoutDayLanes } from "./layoutLanes";
import type { GridBlock } from "./gridTypes";
import { WeekStateStrip } from "./StateRail";

const HOUR_HEIGHT = 60;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const SNAP_MIN = 15;
const MIN_DURATION_MIN = 15;
const TOTAL_MIN = 24 * 60;

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
function combineDateAndMinutes(date: Date, minutes: number): Date {
  const d = startOfDay(date);
  d.setMinutes(minutes);
  return d;
}
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

interface TimeGridProps {
  days: Date[];
  blocks: GridBlock[];
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  /** "plan" allows empty-space drag-to-create and unconstrained overlap
   *  (lane-split visually). "actual" disallows drag-to-create (Actual is
   *  created via explicit dialogs, never blank-space drag) and blocks never
   *  actually overlap (backend-enforced), so lanes are effectively unused. */
  interactionMode: "plan" | "actual";
  onCreateRequest?: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: GridBlock) => void;
  onBlockTimeChange: (block: GridBlock, newStart: Date, newEnd: Date) => void;
  stateBlocksByDate?: Map<string, CalendarStateBlockDto[]>;
  /** Compact per-day State strip at the column's left edge — used in Week
   *  views. Day views instead render a dedicated StateRail component
   *  alongside this grid (owned by the caller, not this component). */
  showWeekStateStrip?: boolean;
  /** Scroll container height as a vh percentage — smaller for stacked
   *  Compare layouts (Week Compare's two grids share the viewport). */
  maxHeightVh?: number;
  /** Exposes the internal scroll container so a Compare view can mirror
   *  scroll position between its Plan and Actual grids for a shared time
   *  axis (locked V1 policy: "temporal alignment must be visually obvious"). */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (scrollTop: number) => void;
}

export function TimeGrid({
  days,
  blocks,
  colorMode,
  phases,
  projects,
  interactionMode,
  onCreateRequest,
  onBlockClick,
  onBlockTimeChange,
  stateBlocksByDate,
  showWeekStateStrip = false,
  maxHeightVh = 68,
  scrollContainerRef,
  onScroll,
}: TimeGridProps) {
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? ownScrollRef;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 6 * HOUR_HEIGHT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date();
  const gridTemplateColumns = `56px repeat(${days.length}, minmax(120px, 1fr))`;

  const blocksByDateKey = useMemo(() => {
    const map = new Map<string, GridBlock[]>();
    for (const block of blocks) {
      const key = toDateKey(parseLocalDateTime(block.startAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(block);
      else map.set(key, [block]);
    }
    return map;
  }, [blocks]);

  return (
    <div className="flex flex-col rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="grid border-b border-zinc-200 dark:border-zinc-800" style={{ gridTemplateColumns }}>
        <div />
        {days.map((date) => (
          <div
            key={toDateKey(date)}
            className={`border-l border-zinc-200 px-2 py-1.5 text-center text-xs font-medium dark:border-zinc-800 ${
              isSameDay(date, today) ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {formatDayHeader(date)}
          </div>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight: `${maxHeightVh}vh` }}
        onScroll={onScroll ? (e) => onScroll(e.currentTarget.scrollTop) : undefined}
      >
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-zinc-400"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {formatMinutes(h * 60)}
              </div>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={toDateKey(date)}
              date={date}
              blocks={blocksByDateKey.get(toDateKey(date)) ?? []}
              colorMode={colorMode}
              phases={phases}
              projects={projects}
              interactionMode={interactionMode}
              onCreateRequest={onCreateRequest}
              onBlockClick={onBlockClick}
              onBlockTimeChange={onBlockTimeChange}
              stateBlocks={showWeekStateStrip ? stateBlocksByDate?.get(toDateKey(date)) ?? [] : []}
              showWeekStateStrip={showWeekStateStrip}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ActiveDrag {
  blockId: string;
  mode: "move" | "resize";
  startClientY: number;
  originalStartMin: number;
  originalEndMin: number;
  currentStartMin: number;
  currentEndMin: number;
  moved: boolean;
}

interface DayColumnProps {
  date: Date;
  blocks: GridBlock[];
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  interactionMode: "plan" | "actual";
  onCreateRequest?: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: GridBlock) => void;
  onBlockTimeChange: (block: GridBlock, newStart: Date, newEnd: Date) => void;
  stateBlocks: CalendarStateBlockDto[];
  showWeekStateStrip: boolean;
}

function DayColumn({
  date,
  blocks,
  colorMode,
  phases,
  projects,
  interactionMode,
  onCreateRequest,
  onBlockClick,
  onBlockTimeChange,
  stateBlocks,
  showWeekStateStrip,
}: DayColumnProps) {
  const [createDrag, setCreateDrag] = useState<{ anchorMin: number; currentMin: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const today = isSameDay(date, new Date());
  const laidOut = useMemo(() => layoutDayLanes(blocks), [blocks]);
  const stateStripWidth = showWeekStateStrip ? 6 : 0;

  function handleColumnPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (interactionMode !== "plan" || !onCreateRequest) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const min = clamp(snap(offsetY / PX_PER_MIN), 0, TOTAL_MIN);
    e.currentTarget.setPointerCapture(e.pointerId);
    setCreateDrag({ anchorMin: min, currentMin: min });
  }

  function handleColumnPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!createDrag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const min = clamp(snap(offsetY / PX_PER_MIN), 0, TOTAL_MIN);
    setCreateDrag((prev) => (prev ? { ...prev, currentMin: min } : prev));
  }

  function handleColumnPointerUp() {
    if (!createDrag || !onCreateRequest) return;
    const startMin = Math.min(createDrag.anchorMin, createDrag.currentMin);
    let endMin = Math.max(createDrag.anchorMin, createDrag.currentMin);
    if (endMin - startMin < MIN_DURATION_MIN) {
      endMin = Math.min(startMin + 60, TOTAL_MIN);
    }
    setCreateDrag(null);
    onCreateRequest(date, startMin, endMin);
  }

  function handleBlockPointerDown(e: ReactPointerEvent<HTMLDivElement>, block: GridBlock) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const originalStartMin = minutesFromMidnight(parseLocalDateTime(block.startAt));
    const originalEndMin = minutesFromMidnight(parseLocalDateTime(block.endAt));
    setActiveDrag({
      blockId: block.id,
      mode: "move",
      startClientY: e.clientY,
      originalStartMin,
      originalEndMin,
      currentStartMin: originalStartMin,
      currentEndMin: originalEndMin,
      moved: false,
    });
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, block: GridBlock) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const originalStartMin = minutesFromMidnight(parseLocalDateTime(block.startAt));
    const originalEndMin = minutesFromMidnight(parseLocalDateTime(block.endAt));
    setActiveDrag({
      blockId: block.id,
      mode: "resize",
      startClientY: e.clientY,
      originalStartMin,
      originalEndMin,
      currentStartMin: originalStartMin,
      currentEndMin: originalEndMin,
      moved: false,
    });
  }

  function handleBlockPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!activeDrag) return;
    const deltaY = e.clientY - activeDrag.startClientY;
    const moved = Math.abs(deltaY) > 3 || activeDrag.moved;
    const deltaMin = snap(deltaY / PX_PER_MIN);

    if (activeDrag.mode === "move") {
      const duration = activeDrag.originalEndMin - activeDrag.originalStartMin;
      const newStart = clamp(activeDrag.originalStartMin + deltaMin, 0, TOTAL_MIN - duration);
      setActiveDrag((prev) =>
        prev ? { ...prev, currentStartMin: newStart, currentEndMin: newStart + duration, moved } : prev,
      );
    } else {
      const newEnd = clamp(activeDrag.originalEndMin + deltaMin, activeDrag.originalStartMin + MIN_DURATION_MIN, TOTAL_MIN);
      setActiveDrag((prev) => (prev ? { ...prev, currentEndMin: newEnd, moved } : prev));
    }
  }

  function handleBlockPointerUp(block: GridBlock) {
    if (!activeDrag || activeDrag.blockId !== block.id) return;
    if (!activeDrag.moved) {
      setActiveDrag(null);
      onBlockClick(block);
      return;
    }
    const newStart = combineDateAndMinutes(date, activeDrag.currentStartMin);
    const newEnd = combineDateAndMinutes(date, activeDrag.currentEndMin);
    setActiveDrag(null);
    onBlockTimeChange(block, newStart, newEnd);
  }

  return (
    <div
      className="relative border-l border-zinc-200 dark:border-zinc-800"
      style={{ height: HOUR_HEIGHT * 24 }}
      onPointerDown={handleColumnPointerDown}
      onPointerMove={handleColumnPointerMove}
      onPointerUp={handleColumnPointerUp}
    >
      {today && <div className="pointer-events-none absolute inset-0 bg-sky-50/40 dark:bg-sky-950/20" />}
      {Array.from({ length: 24 }).map((_, h) => (
        <div
          key={h}
          className="pointer-events-none absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800/60"
          style={{ top: h * HOUR_HEIGHT }}
        />
      ))}

      {showWeekStateStrip && stateBlocks.length > 0 && (
        <WeekStateStrip stateBlocks={stateBlocks} pxPerMin={PX_PER_MIN} width={stateStripWidth} />
      )}

      {createDrag && (
        <div
          className="pointer-events-none absolute inset-x-1 rounded border border-dashed border-zinc-500 bg-zinc-400/30"
          style={{
            top: Math.min(createDrag.anchorMin, createDrag.currentMin) * PX_PER_MIN,
            height: Math.max(Math.abs(createDrag.currentMin - createDrag.anchorMin) * PX_PER_MIN, 2),
            left: stateStripWidth + 2,
          }}
        />
      )}

      {laidOut.map(({ block, laneIndex, laneCount }) => {
        const isDragging = activeDrag?.blockId === block.id;
        const startMin = isDragging ? activeDrag!.currentStartMin : minutesFromMidnight(parseLocalDateTime(block.startAt));
        const endMin = isDragging ? activeDrag!.currentEndMin : minutesFromMidnight(parseLocalDateTime(block.endAt));
        const color = resolveBlockColor(block, colorMode, { phases, projects });
        const laneWidthPct = 100 / laneCount;
        const isPlan = interactionMode === "plan";

        return (
          <div
            key={block.id}
            onPointerDown={(e) => handleBlockPointerDown(e, block)}
            onPointerMove={handleBlockPointerMove}
            onPointerUp={() => handleBlockPointerUp(block)}
            className={`absolute cursor-grab select-none overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow-sm active:cursor-grabbing ${
              isPlan ? "border-dashed" : "border-solid"
            } ${color.bg} ${color.border} ${color.text}`}
            style={{
              top: startMin * PX_PER_MIN,
              height: Math.max((endMin - startMin) * PX_PER_MIN, 16),
              left: `calc(${stateStripWidth}px + 4px + ${laneIndex} * (100% - ${stateStripWidth}px - 8px) / ${laneCount})`,
              width: `calc((100% - ${stateStripWidth}px - 8px) * ${laneWidthPct / 100} - 2px)`,
            }}
            title={block.memo ?? undefined}
          >
            <div className="truncate font-medium">{block.title}</div>
            <div className="truncate opacity-70">
              {formatMinutes(startMin)}–{formatMinutes(endMin)}
            </div>
            <div
              onPointerDown={(e) => handleResizePointerDown(e, block)}
              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
            />
          </div>
        );
      })}
    </div>
  );
}
