"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistCategoryDto, ChecklistDailyDto, ChecklistItemDto, ChecklistMatrixResponseDto, ChecklistResult } from "@/lib/api/types";
import { getChecklistForDate, getChecklistMatrix, setChecklistEntryResult, setChecklistEntryResults, setChecklistEntryMemo } from "@/lib/api/checklist";
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
  const [selection, setSelection] = useState<{ scope: string; ids: Set<string> }>({ scope: "", ids: new Set() });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkRef = useRef(false);
  const [feedback, setFeedback] = useState("");

  const range = useMemo(() => period(mode, anchor), [mode, anchor]);
  const fromKey = toDateKey(range.from);
  const toKey = toDateKey(range.to);
  const anchorKey = toDateKey(anchor);
  const selectionScope = `${mode}/${fromKey}/${toKey}/${JSON.stringify(filters)}`;
  const selected = selection.scope === selectionScope ? selection.ids : new Set<string>();
  function onSelect(id: string) {
    setSelection(previous => {
      const ids = new Set(previous.scope === selectionScope ? previous.ids : []);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { scope: selectionScope, ids };
    });
  }
  function patchResults(values: Map<string, ChecklistResult>) {
    const update = (previous: ChecklistMatrixResponseDto | null) => previous && ({ ...previous, rows: previous.rows.map(row => ({ ...row, cells: row.cells.map(cell => values.has(cell.entryId) ? { ...cell, result: values.get(cell.entryId)! } : cell) })) });
    setMatrix(update);
    setDayWeekMatrix(update);
    setDayDetail(previous => previous && ({ ...previous, entries: previous.entries.map(entry => values.has(entry.id) ? { ...entry, result: values.get(entry.id)! } : entry) }));
  }

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

  async function handleResultChange(entryId: string, result: ChecklistResult) {
    if (bulkRef.current || pendingRef.current.has(entryId)) return;
    const previous = mode === "day" ? dayDetail?.entries.find(e => e.id === entryId)?.result : matrix?.rows.flatMap(r => r.cells).find(c => c.entryId === entryId)?.result;
    if (!previous) return;
    pendingRef.current.add(entryId); setPending(new Set(pendingRef.current));
    patchResults(new Map([[entryId, result]]));
    try {
      await setChecklistEntryResult(entryId, result);
      setError(null);
    } catch (e) {
      patchResults(new Map([[entryId, previous]]));
      setError(describeApiError(e, "저장하지 못했습니다."));
    } finally {
      pendingRef.current.delete(entryId); setPending(new Set(pendingRef.current));
    }
  }

  async function markSelectedUnrecorded() {
    if (bulkRef.current || pendingRef.current.size || !selected.size) return;
    const entries = mode === "day" ? (dayDetail?.applicable ? dayDetail.entries.map(e => ({ id: e.id, result: e.result })) : []) : (matrix?.rows.filter(r => r.applicable).flatMap(r => r.cells.map(c => ({ id: c.entryId, result: c.result }))) ?? []);
    const previous = new Map(entries.filter(e => selected.has(e.id)).map(e => [e.id, e.result]));
    if (!previous.size || !window.confirm(`선택한 ${previous.size}개 기록을 '기록 못함'으로 변경할까요? 실패 통계에서 제외됩니다.`)) return;
    bulkRef.current = true; setBulkBusy(true); setFeedback("");
    patchResults(new Map([...previous.keys()].map(id => [id, "UNRECORDED"])));
    try {
      await setChecklistEntryResults([...previous.keys()], "UNRECORDED");
      setFeedback(`${previous.size}개 기록을 '기록 못함'으로 저장했습니다.`);
      setSelection({ scope: selectionScope, ids: new Set() }); setError(null);
    } catch (e) {
      patchResults(previous);
      setError(describeApiError(e, "일괄 저장하지 못했습니다. 선택을 유지했습니다. 다시 시도하세요."));
    } finally { bulkRef.current = false; setBulkBusy(false); }
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
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
      {feedback && <p role="status" className="text-sm text-fg-muted">{feedback}</p>}
      {selected.size > 0 && <div className="flex items-center gap-3 text-sm"><span>{selected.size}개 선택</span><button disabled={bulkBusy || pending.size > 0 || loading} onClick={() => void markSelectedUnrecorded()}>{bulkBusy ? "저장 중…" : "기록 못함"}</button><button disabled={bulkBusy} onClick={() => setSelection({ scope: selectionScope, ids: new Set() })}>선택 해제</button></div>}
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
          onResultChange={handleResultChange}
          onMemoSave={handleMemoSave}
          selected={selected} onSelect={onSelect} pending={pending} bulkBusy={bulkBusy}
        />
      ) : mode === "week" ? (
        <ChecklistDateTable dates={Array.from({ length: 7 }, (_, i) => addDays(range.from, i))} columns={filteredColumns} rowByDate={rowByDate} onResultChange={handleResultChange} selected={selected} onSelect={onSelect} pending={pending} bulkBusy={bulkBusy} />
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
                <ChecklistDateTable dates={dates} columns={filteredColumns} rowByDate={rowByDate} onResultChange={handleResultChange} selected={selected} onSelect={onSelect} pending={pending} bulkBusy={bulkBusy} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
