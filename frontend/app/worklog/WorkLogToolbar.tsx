"use client";

import { useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ColumnsIcon, FilterIcon, SearchIcon } from "@primer/octicons-react";
import { formatKoreanDateRange } from "@/lib/date";
import { FOCUS_VISIBLE } from "./format";

type PeriodUnit = "week" | "month" | "custom";

const PERIOD_LABELS: Record<PeriodUnit, string> = {
  week: "주",
  month: "월",
  custom: "사용자 지정",
};

interface WorkLogToolbarProps {
  weekStart: Date;
  weekEnd: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

// Search / filter / column-settings are presentation-only entry points in
// this phase (Phase 2 scope §5) — they render and accept focus/hover like
// real controls, but have no data effect yet.
export function WorkLogToolbar({ weekStart, weekEnd, onPrevWeek, onNextWeek, onToday }: WorkLogToolbarProps) {
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("week");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-surface-default px-4 py-3">
      <div className="flex overflow-hidden rounded-md border border-border-default">
        {(Object.keys(PERIOD_LABELS) as PeriodUnit[]).map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => setPeriodUnit(unit)}
            aria-pressed={periodUnit === unit}
            className={`px-3 py-1.5 text-sm ${FOCUS_VISIBLE} ${
              periodUnit === unit
                ? "bg-primary-subtle font-medium text-primary-fg"
                : "bg-surface-default text-fg-muted hover:bg-canvas-subtle"
            }`}
          >
            {PERIOD_LABELS[unit]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border-default px-1">
        <button
          type="button"
          onClick={onPrevWeek}
          className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <ChevronLeftIcon size={16} className="text-fg-muted" aria-hidden="true" />
          저번 주
        </button>
        <span className="px-2 text-sm font-medium text-fg-default">{formatKoreanDateRange(weekStart, weekEnd)}</span>
        <button
          type="button"
          onClick={onNextWeek}
          className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          다음 주
          <ChevronRightIcon size={16} className="text-fg-muted" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={onToday}
        className={`flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        오늘
        <CalendarIcon size={16} className="text-fg-muted" aria-hidden="true" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="검색..."
            aria-label="근무 기록 검색"
            className={`w-56 rounded-md border border-control-border bg-control-bg py-1.5 pl-8 pr-3 text-sm text-fg-default placeholder:text-fg-muted focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </div>

        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <FilterIcon size={16} aria-hidden="true" />
          필터
        </button>

        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <ColumnsIcon size={16} aria-hidden="true" />
          열 설정
        </button>
      </div>
    </div>
  );
}
