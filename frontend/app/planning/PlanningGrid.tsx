"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PlannedTimeBlock } from "@/lib/api/types";
import {
  formatDayHeader,
  formatHourLabel,
  isSameDay,
  minutesFromMidnight,
  parseLocalDateTime,
  startOfDay,
  toDateKey,
} from "@/lib/date";
import { colorForCategory } from "@/lib/categoryColor";

const HOUR_HEIGHT = 60; // px per hour
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

interface PlanningGridProps {
  days: Date[];
  blocks: PlannedTimeBlock[];
  onCreateRequest: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: PlannedTimeBlock) => void;
  onBlockTimeChange: (block: PlannedTimeBlock, newStart: Date, newEnd: Date) => void;
}

export function PlanningGrid({ days, blocks, onCreateRequest, onBlockClick, onBlockTimeChange }: PlanningGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 6 * HOUR_HEIGHT;
    }
  }, []);

  const today = new Date();
  const gridTemplateColumns = `56px repeat(${days.length}, minmax(120px, 1fr))`;

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

      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: "68vh" }}>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-zinc-400"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {formatHourLabel(h)}
              </div>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={toDateKey(date)}
              date={date}
              blocks={blocks.filter((b) => isSameDay(parseLocalDateTime(b.startAt), date))}
              onCreateRequest={onCreateRequest}
              onBlockClick={onBlockClick}
              onBlockTimeChange={onBlockTimeChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DayColumnProps {
  date: Date;
  blocks: PlannedTimeBlock[];
  onCreateRequest: (date: Date, startMinutes: number, endMinutes: number) => void;
  onBlockClick: (block: PlannedTimeBlock) => void;
  onBlockTimeChange: (block: PlannedTimeBlock, newStart: Date, newEnd: Date) => void;
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

function DayColumn({ date, blocks, onCreateRequest, onBlockClick, onBlockTimeChange }: DayColumnProps) {
  const [createDrag, setCreateDrag] = useState<{ anchorMin: number; currentMin: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const today = isSameDay(date, new Date());

  function handleColumnPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
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
    if (!createDrag) return;
    const startMin = Math.min(createDrag.anchorMin, createDrag.currentMin);
    let endMin = Math.max(createDrag.anchorMin, createDrag.currentMin);
    if (endMin - startMin < MIN_DURATION_MIN) {
      endMin = Math.min(startMin + 60, TOTAL_MIN);
    }
    setCreateDrag(null);
    onCreateRequest(date, startMin, endMin);
  }

  function handleBlockPointerDown(e: ReactPointerEvent<HTMLDivElement>, block: PlannedTimeBlock) {
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

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, block: PlannedTimeBlock) {
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

  function handleBlockPointerUp(block: PlannedTimeBlock) {
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

      {createDrag && (
        <div
          className="pointer-events-none absolute inset-x-1 rounded border border-dashed border-zinc-500 bg-zinc-400/30"
          style={{
            top: Math.min(createDrag.anchorMin, createDrag.currentMin) * PX_PER_MIN,
            height: Math.max(Math.abs(createDrag.currentMin - createDrag.anchorMin) * PX_PER_MIN, 2),
          }}
        />
      )}

      {blocks.map((block) => {
        const isDragging = activeDrag?.blockId === block.id;
        const startMin = isDragging ? activeDrag!.currentStartMin : minutesFromMidnight(parseLocalDateTime(block.startAt));
        const endMin = isDragging ? activeDrag!.currentEndMin : minutesFromMidnight(parseLocalDateTime(block.endAt));
        const color = colorForCategory(block.categoryId);

        return (
          <div
            key={block.id}
            onPointerDown={(e) => handleBlockPointerDown(e, block)}
            onPointerMove={handleBlockPointerMove}
            onPointerUp={() => handleBlockPointerUp(block)}
            className={`absolute inset-x-1 cursor-grab select-none overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow-sm active:cursor-grabbing ${color.bg} ${color.border} ${color.text}`}
            style={{ top: startMin * PX_PER_MIN, height: Math.max((endMin - startMin) * PX_PER_MIN, 16) }}
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
