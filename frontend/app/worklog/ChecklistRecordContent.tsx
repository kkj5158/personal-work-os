"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChecklistCategoryDto, ChecklistDailyDto, ChecklistItemDto, ChecklistMatrixResponseDto } from "@/lib/api/types";
import { getChecklistForDate, getChecklistMatrix, setChecklistEntryAchieved, setChecklistEntryMemo } from "@/lib/api/checklist";
import { addDays, startOfWeek, toDateKey } from "@/lib/date";
import { seoulToday } from "@/lib/seoulDate";
import { describeApiError } from "./errorMessages";
import { WorkLogToolbar, type PeriodUnit } from "./WorkLogToolbar";
import { ChecklistFilters } from "./ChecklistFilters";
import { ChecklistDayView } from "./ChecklistDayView";
import { ChecklistDateTable } from "./ChecklistDateTable";
import { DEFAULT_CHECKLIST_FILTERS, filterColumns, groupIntoWeeks, type ChecklistFilterState } from "./checklistLogic";

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthEnd(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function period(mode: PeriodUnit, anchor: Date) {
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  return { from: monthStart(anchor), to: monthEnd(anchor) };
}

interface Props {
  items: ChecklistItemDto[];
  categories: ChecklistCategoryDto[];
}

// Record architecture (§9): Day = execution Feed, Week = canonical date-row
// table, Month = the same table grammar repeated per Monday-Sunday group
// (§27/§28) — never a one-row Week or a flat 30/31-row Month. This
// orchestrator owns mode/anchor/filters and the range fetch; the three view
// components are presentation-only.
export function ChecklistRecordContent({ items, categories }: Props) {
  const today = seoulToday();
  const [mode, setMode] = useState<PeriodUnit>("week");
  const [anchor, setAnchor] = useState(today);
  const [matrix, setMatrix] = useState<ChecklistMatrixResponseDto | null>(null);
  const [dayDetail, setDayDetail] = useState<ChecklistDailyDto | null>(null);
  const [dayWeekMatrix, setDayWeekMatrix] = useState<ChecklistMatrixResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ChecklistFilterState>(DEFAULT_CHECKLIST_FILTERS);

  const range = useMemo(() => period(mode, anchor), [mode, anchor]);
  const fromKey = toDateKey(range.from);
  const toKey = toDateKey(range.to);
  const anchorKey = toDateKey(anchor);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (mode === "day") {
          const weekStart = startOfWeek(anchor);
          const [detail, weekMatrixResult] = await Promise.all([
            getChecklistForDate(anchorKey),
            getChecklistMatrix(toDateKey(weekStart), toDateKey(addDays(weekStart, 6))),
          ]);
          if (cancelled) return;
          setDayDetail(detail);
          setDayWeekMatrix(weekMatrixResult);
          setMatrix(null);
        } else {
          const result = await getChecklistMatrix(fromKey, toKey);
          if (cancelled) return;
          setMatrix(result);
          setDayDetail(null);
          setDayWeekMatrix(null);
        }
        setError(null);
      } catch (e) {
        if (!cancelled) setError(describeApiError(e, "체크리스트 기록을 불러오지 못했습니다."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fromKey, toKey, anchorKey]);

  async function handleToggle(entryId: string, achieved: boolean) {
    if (mode === "day") {
      if (!dayDetail) return;
      const previous = dayDetail;
      setDayDetail({ ...dayDetail, entries: dayDetail.entries.map((e) => (e.id === entryId ? { ...e, achieved } : e)) });
      try {
        await setChecklistEntryAchieved(entryId, achieved);
      } catch (e) {
        setDayDetail(previous);
        setError(describeApiError(e, "저장하지 못했습니다."));
      }
      return;
    }
    if (!matrix) return;
    const previous = matrix;
    setMatrix({ ...matrix, rows: matrix.rows.map((r) => ({ ...r, cells: r.cells.map((c) => (c.entryId === entryId ? { ...c, achieved } : c)) })) });
    try {
      await setChecklistEntryAchieved(entryId, achieved);
    } catch (e) {
      setMatrix(previous);
      setError(describeApiError(e, "저장하지 못했습니다."));
    }
  }

  async function handleMemoSave(entryId: string, memo: string | null) {
    await setChecklistEntryMemo(entryId, memo);
  }

  function handlePrev() {
    setAnchor((d) => (mode === "day" ? addDays(d, -1) : mode === "week" ? addDays(d, -7) : addMonths(d, -1)));
  }
  function handleNext() {
    setAnchor((d) => (mode === "day" ? addDays(d, 1) : mode === "week" ? addDays(d, 7) : addMonths(d, 1)));
  }

  const filteredColumns = matrix ? filterColumns(matrix.columns, filters) : [];
  const rowByDate = new Map((matrix?.rows ?? []).map((r) => [r.date, r]));
  const dayRowStatus = dayWeekMatrix?.rows.find((r) => r.date === anchorKey)?.status ?? null;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger-fg">{error}</p>}
      <WorkLogToolbar
        periodUnit={mode}
        onPeriodUnitChange={setMode}
        rangeStart={range.from}
        rangeEnd={range.to}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={() => setAnchor(today)}
        onJumpToDate={setAnchor}
        filters={<ChecklistFilters categories={categories} filters={filters} onChange={setFilters} showIncompleteOnly={mode === "day"} />}
      />

      {loading ? (
        <p className="py-10 text-center text-sm text-fg-muted">불러오는 중…</p>
      ) : mode === "day" ? (
        <ChecklistDayView
          date={anchor}
          status={dayRowStatus}
          detail={dayDetail}
          weekMatrix={dayWeekMatrix}
          items={items}
          categories={categories}
          filters={filters}
          onToggle={handleToggle}
          onMemoSave={handleMemoSave}
        />
      ) : mode === "week" ? (
        <ChecklistDateTable dates={Array.from({ length: 7 }, (_, i) => addDays(range.from, i))} columns={filteredColumns} rowByDate={rowByDate} onToggle={handleToggle} />
      ) : (
        <div className="flex flex-col gap-6">
          {groupIntoWeeks(range.from, range.to).map((group) => {
            const dates: Date[] = [];
            for (let d = group.from; d.getTime() <= group.to.getTime(); d = addDays(d, 1)) dates.push(d);
            return (
              <div key={toDateKey(group.from)} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-fg-default">
                  {toDateKey(group.from).replaceAll("-", ".")}–{toDateKey(group.to).replaceAll("-", ".")}
                </h3>
                <ChecklistDateTable dates={dates} columns={filteredColumns} rowByDate={rowByDate} onToggle={handleToggle} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
