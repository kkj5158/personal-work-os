"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChecklistCategoryDto, ChecklistDailyDto, ChecklistItemDto, ChecklistMatrixResponseDto, WorkAttendanceStatus } from "@/lib/api/types";
import { getChecklistForDate, getChecklistMatrix, setChecklistEntryMemo, setChecklistEntryResultChanges } from "@/lib/api/checklist";
import { addDays, startOfWeek, toDateKey } from "@/lib/date";
import { seoulToday } from "@/lib/seoulDate";
import { ChecklistGrid, type GridGroup } from "@/components/checklist-core/ChecklistGrid";
import { useChecklistMutations } from "@/components/checklist-core/useChecklistMutations";
import { daysBetween } from "@/lib/checklist-core/dates";
import type { ChecklistState } from "@/lib/checklist-core/types";
import { describeApiError } from "./errorMessages";
import { WorkLogToolbar, type PeriodUnit } from "./WorkLogToolbar";
import { ChecklistFilters } from "./ChecklistFilters";
import { ChecklistMemoEditor } from "./ChecklistMemoEditor";
import { mapStatusFromBackend } from "./mapping";
import { DEFAULT_CHECKLIST_FILTERS, filterColumns, groupByPriority, type ChecklistFilterState } from "./checklistLogic";
import { indexMatrix, patchMatrix, toChecklistState, toEntryChanges, workAvailability } from "./checklistAdapter";

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

// WORK OS consumer of the shared checklist interaction (CHECKLIST SYS canon):
// item rows × date columns, full-cell states, drag multi-select, shared bulk
// bar and date-level NOT_RECORDED. Storage stays attendance-scoped: only a
// workday's existing entry is editable; non-work days read as inactive.
export function ChecklistRecordContent({ categories }: Props) {
  const today = toDateKey(seoulToday());
  const [mode, setMode] = useState<PeriodUnit>("week");
  const [anchor, setAnchor] = useState(seoulToday());
  const [matrix, setMatrix] = useState<ChecklistMatrixResponseDto | null>(null);
  const [dayDetail, setDayDetail] = useState<ChecklistDailyDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ChecklistFilterState>(DEFAULT_CHECKLIST_FILTERS);

  const range = useMemo(() => period(mode, anchor), [mode, anchor]);
  const fromKey = toDateKey(range.from);
  const toKey = toDateKey(range.to);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [result, detail] = await Promise.all([getChecklistMatrix(fromKey, toKey), mode === "day" ? getChecklistForDate(fromKey) : Promise.resolve(null)]);
        if (cancelled) return;
        setMatrix(result);
        setDayDetail(detail);
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
  }, [mode, fromKey, toKey]);

  const index = useMemo(() => indexMatrix(matrix), [matrix]);
  const baseState = useCallback((itemId: string, date: string): ChecklistState => {
    const cell = index.cells.get(`${itemId}|${date}`);
    return cell ? toChecklistState(cell.result) : "UNTOUCHED";
  }, [index]);
  const mutations = useChecklistMutations({
    baseState,
    persist: async changes => { await setChecklistEntryResultChanges(toEntryChanges(index, changes)); },
    commit: changes => setMatrix(previous => patchMatrix(previous, changes)),
  });
  // Archived (deleted) items stay readable history — never editable from the active grid.
  const archived = useMemo(() => new Set((matrix?.columns ?? []).filter(c => c.deleted).map(c => c.itemId)), [matrix]);
  const availability = useCallback((itemId: string, date: string) => archived.has(itemId) ? "INACTIVE" as const : workAvailability(index, itemId, date, today), [archived, index, today]);

  const dates = useMemo(() => daysBetween(fromKey, toKey).map(date => {
    const row = index.rows.get(date);
    return { date, sub: row ? mapStatusFromBackend(row.status as WorkAttendanceStatus) : "미입력" };
  }), [fromKey, toKey, index]);

  const { getState } = mutations;
  const memoByItem = useMemo(() => new Map((dayDetail?.entries ?? []).map(e => [e.itemId, e])), [dayDetail]);
  const groups: GridGroup[] = useMemo(() => {
    let columns = filterColumns(matrix?.columns ?? [], filters);
    if (mode === "day" && filters.incompleteOnly) columns = columns.filter(c => getState(c.itemId, fromKey) !== "SUCCESS");
    const { core, secondary } = groupByPriority(columns);
    const toRows = (cols: typeof columns) => cols.map(c => {
      const entry = memoByItem.get(c.itemId);
      return {
        id: c.itemId,
        label: `${c.emoji ? `${c.emoji} ` : ""}${c.name}`,
        meta: c.deleted ? "보관됨" : undefined,
        aside: mode === "day" && entry ? <ChecklistMemoEditor key={entry.id} entryId={entry.id} memo={entry.memo} onSave={async (id, memo) => { await setChecklistEntryMemo(id, memo); }} /> : undefined,
      };
    });
    return [
      ...(core.length ? [{ id: "CORE", label: "CORE", rows: toRows(core) }] : []),
      ...(secondary.length ? [{ id: "SECONDARY", label: "SECONDARY", rows: toRows(secondary) }] : []),
    ];
  }, [matrix, filters, mode, fromKey, memoByItem, getState]);

  function handlePrev() {
    setAnchor((d) => (mode === "day" ? addDays(d, -1) : mode === "week" ? addDays(d, -7) : addMonths(d, -1)));
  }
  function handleNext() {
    setAnchor((d) => (mode === "day" ? addDays(d, 1) : mode === "week" ? addDays(d, 7) : addMonths(d, 1)));
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
      <WorkLogToolbar
        periodUnit={mode}
        onPeriodUnitChange={setMode}
        rangeStart={range.from}
        rangeEnd={range.to}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={() => setAnchor(seoulToday())}
        onJumpToDate={setAnchor}
        filters={<ChecklistFilters categories={categories} filters={filters} onChange={setFilters} showIncompleteOnly={mode === "day"} />}
      />
      {loading && !matrix ? (
        <p className="py-10 text-center text-sm text-fg-muted">불러오는 중…</p>
      ) : mode === "day" && dayDetail && !dayDetail.applicable ? (
        <div className="rounded-md border border-border-default py-14 text-center text-sm text-fg-muted">체크리스트 적용 대상이 아닙니다.</div>
      ) : (
        <ChecklistGrid
          label="근무 체크리스트 기록"
          groups={groups}
          dates={dates}
          today={today}
          mutations={mutations}
          availability={availability}
          asideHeader={mode === "day" ? "메모" : undefined}
          emptyText="표시할 항목이 없습니다."
        />
      )}
      <p className="text-xs text-fg-muted">클릭 = 완료 · 다시 클릭 = 초기화 · 우클릭 또는 1·2·3·0 = 상태 선택 · 드래그 = 여러 칸 선택 · 날짜 머리글 = 그 날짜 전체 기록 못함 (실패 통계에서 제외)</p>
    </div>
  );
}
