"use client";


import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarViewMode = "day" | "week";
export type CalendarPlanMode = "plan" | "actual" | "compare";

interface ToggleGroupProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function ToggleGroup<T extends string>({ value, options, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border-default">
      {options.map((opt) => (
        <button
          key={opt.value}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-sm ${
            value === opt.value
              ? "bg-row-selected-bg text-primary-fg font-medium"
              : "bg-canvas-default text-fg-muted hover:bg-canvas-subtle"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  planMode: CalendarPlanMode;
  onPlanModeChange: (mode: CalendarPlanMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  label: string;
}

export function CalendarToolbar({
  viewMode,
  onViewModeChange,
  planMode,
  onPlanModeChange,
  onPrev,
  onNext,
  onToday,
  label,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <button className="rounded-md text-fg-muted hover:bg-canvas-subtle" onClick={onPrev} aria-label="이전">
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <button className="rounded-md border border-border-default text-fg-muted hover:bg-canvas-subtle" onClick={onToday}>
        오늘
      </button>
      <button className="rounded-md text-fg-muted hover:bg-canvas-subtle" onClick={onNext} aria-label="다음">
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-default">{label}</span>

      <ToggleGroup
        value={viewMode}
        onChange={onViewModeChange}
        options={[
          { value: "day", label: "일" },
          { value: "week", label: "주" },
        ]}
      />
      <ToggleGroup
        value={planMode}
        onChange={onPlanModeChange}
        options={[
          { value: "plan", label: "계획" },
          { value: "actual", label: "실행" },
          { value: "compare", label: "비교" },
        ]}
      />
    </div>
  );
}
