"use client";

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, ColumnsIcon, FilterIcon, SearchIcon } from "@primer/octicons-react";
import { formatKoreanDateRange } from "@/lib/date";
import { FOCUS_VISIBLE } from "./format";

// v2 spec §5: only 주/월 are supported; 사용자 지정 (custom) is removed.
export type PeriodUnit = "week" | "month";

const PERIOD_LABELS: Record<PeriodUnit, string> = {
  week: "주",
  month: "월",
};

const PREV_LABELS: Record<PeriodUnit, string> = {
  week: "저번 주",
  month: "저번 달",
};

const NEXT_LABELS: Record<PeriodUnit, string> = {
  week: "다음 주",
  month: "다음 달",
};

interface WorkLogToolbarProps {
  periodUnit: PeriodUnit;
  onPeriodUnitChange: (unit: PeriodUnit) => void;
  /** Week start/end in week mode, month start/end in month mode — the
   *  caller (page.tsx) owns both anchors and picks which pair to pass. */
  rangeStart: Date;
  rangeEnd: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenStartTimeCriteria: () => void;
}

// Controlled by page.tsx (v2 Phase 5): this component owns no period/anchor
// state of its own — periodUnit and the displayed range are both props, so
// the parent can keep the weekly and monthly datasets in sync with whichever
// tab is active. Search / filter / column-settings remain presentation-only
// entry points (Phase 2 scope §5) — they render and accept focus/hover like
// real controls, but have no data effect yet.
export function WorkLogToolbar({
  periodUnit,
  onPeriodUnitChange,
  rangeStart,
  rangeEnd,
  onPrev,
  onNext,
  onToday,
  onOpenStartTimeCriteria,
}: WorkLogToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-surface-default px-4 py-3">
      <div className="flex h-9 overflow-hidden rounded-md border border-border-default">
        {(Object.keys(PERIOD_LABELS) as PeriodUnit[]).map((unit) => (
          <button
            key={unit}
            type="button"
            onClick={() => onPeriodUnitChange(unit)}
            aria-pressed={periodUnit === unit}
            className={`inline-flex h-full items-center justify-center px-3 text-sm ${FOCUS_VISIBLE} ${
              periodUnit === unit
                ? "bg-primary-emphasis font-medium text-white"
                : "bg-surface-default text-fg-muted hover:bg-canvas-subtle"
            }`}
          >
            {PERIOD_LABELS[unit]}
          </button>
        ))}
      </div>

      <div className="flex h-9 items-center gap-1 rounded-md border border-border-default px-1">
        <button
          type="button"
          onClick={onPrev}
          className={`flex h-7 items-center gap-1 rounded px-2 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <ChevronLeftIcon size={16} className="text-fg-muted" aria-hidden="true" />
          {PREV_LABELS[periodUnit]}
        </button>
        <span className="whitespace-nowrap px-2 text-sm font-medium text-fg-default">
          {formatKoreanDateRange(rangeStart, rangeEnd)}
        </span>
        <button
          type="button"
          onClick={onNext}
          className={`flex h-7 items-center gap-1 rounded px-2 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          {NEXT_LABELS[periodUnit]}
          <ChevronRightIcon size={16} className="text-fg-muted" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={onToday}
        className={`flex h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        오늘
        <CalendarIcon size={16} className="text-fg-muted" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onOpenStartTimeCriteria}
        className={`flex h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
      >
        <ClockIcon size={16} className="text-fg-muted" aria-hidden="true" />
        출근 기준
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
            className={`h-9 w-36 rounded-md border border-control-border bg-control-bg pl-8 pr-3 text-sm text-fg-default placeholder:text-fg-muted focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
          />
        </div>

        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <FilterIcon size={16} aria-hidden="true" />
          필터
        </button>

        <button
          type="button"
          className={`flex h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-sm text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
        >
          <ColumnsIcon size={16} aria-hidden="true" />
          열 설정
        </button>
      </div>
    </div>
  );
}
