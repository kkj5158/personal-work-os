"use client";

import { useCallback, useRef } from "react";
import type { CalendarStateBlockDto } from "@/lib/api/types";
import type { ColorMode } from "@/lib/calendarColor";
import { TimeGrid } from "./TimeGrid";
import { StateRail } from "./StateRail";
import type { GridBlock } from "./gridTypes";

interface DayCompareViewProps {
  date: Date;
  planBlocks: GridBlock[];
  actualBlocks: GridBlock[];
  stateBlocks: CalendarStateBlockDto[];
  colorMode: ColorMode;
  phases: { id: string; projectId: string }[];
  projects: { id: string; colorToken: string }[];
  onPlanBlockClick: (block: GridBlock) => void;
  onActualBlockClick: (block: GridBlock) => void;
  onActualTimeChange: (block: GridBlock, newStart: Date, newEnd: Date) => void;
}

/** Day Plan vs Actual, side by side on a shared, scroll-synced time scale
 *  (locked V1 policy §18). State appears with Actual, never with Plan. */
export function DayCompareView({
  date,
  planBlocks,
  actualBlocks,
  stateBlocks,
  colorMode,
  phases,
  projects,
  onPlanBlockClick,
  onActualBlockClick,
  onActualTimeChange,
}: DayCompareViewProps) {
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

  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3 px-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
          <span aria-hidden>📋</span> 계획 (PLAN)
        </h3>
        <TimeGrid
          days={[date]}
          blocks={planBlocks}
          colorMode={colorMode}
          phases={phases}
          projects={projects}
          interactionMode="plan"
          onBlockClick={onPlanBlockClick}
          onBlockTimeChange={() => {}}
          scrollContainerRef={planScrollRef}
          onScroll={handlePlanScroll}
        />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
          <span aria-hidden>▶</span> 실제 (ACTUAL)
        </h3>
        <div className="flex gap-1.5">
          {stateBlocks.length > 0 && <StateRail stateBlocks={stateBlocks} />}
          <div className="min-w-0 flex-1">
            <TimeGrid
              days={[date]}
              blocks={actualBlocks}
              colorMode={colorMode}
              phases={phases}
              projects={projects}
              interactionMode="actual"
              onBlockClick={onActualBlockClick}
              onBlockTimeChange={onActualTimeChange}
              scrollContainerRef={actualScrollRef}
              onScroll={handleActualScroll}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
