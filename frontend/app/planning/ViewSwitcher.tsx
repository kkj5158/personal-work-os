"use client";

import { Button } from "@/components/ui/Button";

interface ViewSwitcherProps {
  viewMode: "day" | "week";
  onViewModeChange: (mode: "day" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  label: string;
}

export function ViewSwitcher({ viewMode, onViewModeChange, onPrev, onNext, onToday, label }: ViewSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
        <button
          onClick={() => onViewModeChange("day")}
          className={`px-3 py-1 text-sm ${
            viewMode === "day"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          Day
        </button>
        <button
          onClick={() => onViewModeChange("week")}
          className={`px-3 py-1 text-sm ${
            viewMode === "week"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
          }`}
        >
          Week
        </button>
      </div>

      <Button variant="ghost" onClick={onPrev} aria-label="Previous">
        ←
      </Button>
      <Button variant="secondary" onClick={onToday}>
        Today
      </Button>
      <Button variant="ghost" onClick={onNext} aria-label="Next">
        →
      </Button>

      <span className="ml-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </div>
  );
}
