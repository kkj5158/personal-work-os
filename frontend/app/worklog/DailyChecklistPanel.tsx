"use client";

import { useEffect, useState } from "react";
import { getChecklistForDate, setChecklistEntryAchieved } from "@/lib/api/checklist";
import type { ChecklistDailyDto, ChecklistDailyEntryDto } from "@/lib/api/types";
import { toDateKey } from "@/lib/date";
import type { WorkLogRecord } from "./mockData";
import { FOCUS_VISIBLE } from "./format";

interface DailyChecklistPanelProps {
  date: Date;
  record: WorkLogRecord | null;
  /** "full" (checkbox list with names/goals, Daily view) or "compact"
   *  (emoji-only row, Today summary). */
  variant?: "full" | "compact";
}

// Daily Work Checklist (REQ-05) — placed below the work-time recording area
// per the confirmed layout, and reused as-is (compact variant) for Today's
// summary strip. Fetches independently of the page-level Work Log datasets
// (checklist state doesn't need to flow through applyRecordEverywhere) and
// keys its refetch on the record's identity/status so a status change that
// flips applicability is picked up immediately.
export function DailyChecklistPanel({ date, record, variant = "full" }: DailyChecklistPanelProps) {
  const [data, setData] = useState<ChecklistDailyDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateKey = toDateKey(date);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dto = await getChecklistForDate(dateKey);
        if (!cancelled) setData(dto);
      } catch {
        if (!cancelled) setError("체크리스트를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // record?.id/record?.status are listed as deps (not read in the body)
    // so a same-date attendance change (e.g. 근무 -> 휴일) that flips
    // applicability re-fetches immediately, without waiting for a date change.
  }, [dateKey, record?.id, record?.status]);

  async function toggle(entry: ChecklistDailyEntryDto) {
    if (!data) return;
    const nextAchieved = !entry.achieved;
    setData({ ...data, entries: data.entries.map((e) => (e.id === entry.id ? { ...e, achieved: nextAchieved } : e)) });
    try {
      await setChecklistEntryAchieved(entry.id, nextAchieved);
    } catch {
      // Revert on failure.
      setData((prev) => (prev ? { ...prev, entries: prev.entries.map((e) => (e.id === entry.id ? { ...e, achieved: entry.achieved } : e)) } : prev));
      setError("체크리스트 상태를 저장하지 못했습니다.");
    }
  }

  if (loading) {
    return variant === "compact" ? null : <p className="py-4 text-center text-sm text-fg-muted">체크리스트를 불러오는 중…</p>;
  }
  if (!data || data.entries.length === 0) {
    return variant === "compact" ? (
      <span className="text-sm text-fg-muted">–</span>
    ) : (
      <p className="py-4 text-center text-sm text-fg-muted">{!record ? "선택한 날짜의 근무 기록이 없습니다." : "표시할 체크리스트 항목이 없습니다."}</p>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {data.entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            disabled={!data.applicable}
            onClick={() => toggle(entry)}
            aria-label={`${entry.name} ${entry.achieved ? "완료됨" : "미완료"}`}
            title={entry.name}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-base disabled:cursor-not-allowed ${
              entry.achieved ? "border-success-fg bg-success-subtle" : "border-border-default bg-canvas-subtle opacity-50"
            } ${FOCUS_VISIBLE}`}
          >
            {entry.emoji}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!data.applicable && (
        <p className="rounded-md border border-warning-fg bg-warning-subtle p-2.5 text-xs text-warning-fg">
          현재 출결 상태에서는 체크리스트가 적용되지 않습니다. 기존 기록은 보존되며 통계에서 제외됩니다.
        </p>
      )}
      <ul className="flex flex-col divide-y divide-border-default rounded-md border border-border-default">
        {data.entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
            <input
              type="checkbox"
              checked={entry.achieved}
              disabled={!data.applicable}
              onChange={() => toggle(entry)}
              aria-label={entry.name}
              className={`h-4 w-4 rounded border-control-border accent-success-emphasis disabled:cursor-not-allowed ${FOCUS_VISIBLE}`}
            />
            <span className="text-base">{entry.emoji}</span>
            <span className={`flex-1 text-sm ${entry.achieved ? "text-fg-default" : "text-fg-muted"}`}>{entry.name}</span>
            {entry.priority === "CORE" && (
              <span className="whitespace-nowrap rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary-fg">Core</span>
            )}
            <span className="whitespace-nowrap text-xs text-fg-muted">목표 {entry.goalPercent}%</span>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
    </div>
  );
}
