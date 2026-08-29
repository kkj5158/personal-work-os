"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-react";
import { formatKoreanDateRange } from "@/lib/date";
import { FOCUS_VISIBLE, formatKoreanDateWithWeekday } from "./format";
import { toApiDateKey } from "./mapping";

// v8 daily-view unit: 일 added as the first mode (사용자 지정 stays removed
// per v2 spec §5). `일` shows one date rather than a range — see
// `formatKoreanDateWithWeekday` usage below.
export type PeriodUnit = "day" | "week" | "month";

const PERIOD_LABELS: Record<PeriodUnit, string> = {
  day: "일",
  week: "주",
  month: "월",
};

const PREV_LABELS: Record<PeriodUnit, string> = {
  day: "이전 날",
  week: "저번 주",
  month: "저번 달",
};

const NEXT_LABELS: Record<PeriodUnit, string> = {
  day: "다음 날",
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
  /** Fast date jump (§23 refinement) — the visible range text opens a
   *  native date input; picking a date navigates day/week/month to
   *  whichever range contains it (the parent owns that mapping). */
  onJumpToDate: (date: Date) => void;
}

// Controlled by page.tsx (v2 Phase 5): this component owns no period/anchor
// state of its own — periodUnit and the displayed range are both props, so
// the parent can keep the weekly and monthly datasets in sync with whichever
// tab is active. v3 §11: 검색/필터/열 설정 were presentation-only
// placeholders with no data effect and are removed entirely rather than kept
// visible-but-disabled — every remaining control here is fully functional.
export function WorkLogToolbar({
  periodUnit,
  onPeriodUnitChange,
  rangeStart,
  rangeEnd,
  onPrev,
  onNext,
  onToday,
  onJumpToDate,
}: WorkLogToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    // Opens the native calendar picker UI directly rather than focusing the
    // segmented text input (previously `dateInputRef.current?.focus()`) —
    // focusing an `input[type=date]` highlights its first segment (e.g. the
    // year) in the browser's default blue text-selection color, which reads
    // as an accidental/broken text selection rather than "a picker just
    // opened". `showPicker()` opens the same underlying picker without ever
    // entering that segmented-edit state. Falls back to `.focus()` on a
    // browser without `showPicker()` support so the input is at least
    // reachable by keyboard.
    const input = dateInputRef.current;
    try {
      input?.showPicker();
    } catch {
      input?.focus();
    }
    function handlePointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pickerOpen]);

  function handleDateInputChange(value: string) {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    onJumpToDate(new Date(y, m - 1, d));
    setPickerOpen(false);
  }

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
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((prev) => !prev)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            className={`whitespace-nowrap rounded px-2 text-sm font-medium tabular-nums text-fg-default hover:bg-canvas-subtle ${FOCUS_VISIBLE}`}
          >
            {periodUnit === "day" ? formatKoreanDateWithWeekday(rangeStart) : formatKoreanDateRange(rangeStart, rangeEnd)}
          </button>
          {pickerOpen && (
            <div
              role="dialog"
              aria-label="날짜로 이동"
              className="absolute left-0 top-full z-20 mt-1 rounded-md border border-border-default bg-surface-default p-2 shadow-md"
            >
              <input
                ref={dateInputRef}
                type="date"
                defaultValue={toApiDateKey(rangeStart)}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className={`h-9 rounded-md border border-control-border bg-control-bg px-2.5 text-sm text-fg-default focus:border-primary-emphasis focus:outline-none ${FOCUS_VISIBLE}`}
              />
            </div>
          )}
        </div>
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
    </div>
  );
}
