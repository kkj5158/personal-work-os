"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarStateBlockDto } from "@/lib/api/types";
import type { ColorMode } from "@/lib/calendarColor";
import { TimeGrid } from "./TimeGrid";
import type { GridBlock } from "./gridTypes";

interface WeekCompareViewProps {
  days: Date[];
  planBlocks: GridBlock[];
  actualBlocks: GridBlock[];
  stateBlocksByDate: Map<string, CalendarStateBlockDto[]>;
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  onPlanBlockClick: (block: GridBlock) => void;
  onActualBlockClick: (block: GridBlock) => void;
  onActualTimeChange: (block: GridBlock, newStart: Date, newEnd: Date) => void;
}

const MIN_VH = 20;
const MAX_VH = 60;
const DEFAULT_VH = 38;

/** Week PLAN grid above / ACTUAL grid below, separated by a draggable
 *  divider (locked V1 policy §18) — never side-by-side. Both grids share
 *  the same weekly column structure and scroll-synced time axis. */
export function WeekCompareView({
  days,
  planBlocks,
  actualBlocks,
  stateBlocksByDate,
  colorMode,
  phases,
  projects,
  onPlanBlockClick,
  onActualBlockClick,
  onActualTimeChange,
}: WeekCompareViewProps) {
  const [planVh, setPlanVh] = useState(DEFAULT_VH);
  const dragState = useRef<{ startY: number; startVh: number } | null>(null);
  const planScrollRef = useRef<HTMLDivElement>(null);
  const actualScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  const handlePlanScroll = useCallback((scrollTop: number) => {
    if (syncing.current) return;
    syncing.current = true;
    if (actualScrollRef.current) actualScrollRef.current.scrollTop = scrollTop;
    syncing.current = false;
  }, []);
  const handleActualScroll = useCallback((scrollTop: number) => {
    if (syncing.current) return;
    syncing.current = true;
    if (planScrollRef.current) planScrollRef.current.scrollTop = scrollTop;
    syncing.current = false;
  }, []);

  function handleDividerPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startVh: planVh };
  }
  function handleDividerPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const deltaPx = e.clientY - dragState.current.startY;
    const deltaVh = (deltaPx / window.innerHeight) * 100;
    setPlanVh(Math.min(Math.max(dragState.current.startVh + deltaVh, MIN_VH), MAX_VH));
  }
  function handleDividerPointerUp() {
    dragState.current = null;
  }

  return (
    <div className="flex flex-col px-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
        <span aria-hidden>📊</span> PLAN 계획 일정
      </h3>
      <TimeGrid
        days={days}
        blocks={planBlocks}
        colorMode={colorMode}
        phases={phases}
        projects={projects}
        interactionMode="plan"
        onBlockClick={onPlanBlockClick}
        onBlockTimeChange={() => {}}
        maxHeightVh={planVh}
        scrollContainerRef={planScrollRef}
        onScroll={handlePlanScroll}
      />

      <div
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
        className="my-2 flex h-2 cursor-row-resize items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
      </div>

      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
        <span aria-hidden>📈</span> ACTUAL 실제 일정
      </h3>
      <TimeGrid
        days={days}
        blocks={actualBlocks}
        colorMode={colorMode}
        phases={phases}
        projects={projects}
        interactionMode="actual"
        onBlockClick={onActualBlockClick}
        onBlockTimeChange={onActualTimeChange}
        stateBlocksByDate={stateBlocksByDate}
        showWeekStateStrip
        maxHeightVh={Math.max(MIN_VH, 76 - planVh)}
        scrollContainerRef={actualScrollRef}
        onScroll={handleActualScroll}
      />
    </div>
  );
}
