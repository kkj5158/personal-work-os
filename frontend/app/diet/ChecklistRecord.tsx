"use client";
import { useCallback, useMemo, useState } from "react";
import type { CheckChange, DailyCheck, DietStore, Importance } from "@/lib/diet/types";
import { addDays, daysBetween, dietActiveOn, monthEnd, monthStart, today, weekStart } from "@/lib/diet/model";
import { ChecklistGrid, type GridGroup } from "@/components/checklist-core/ChecklistGrid";
import { useChecklistMutations } from "@/components/checklist-core/useChecklistMutations";
import type { CellAvailability, CellChange, ChecklistState } from "@/lib/checklist-core/types";

// DIET SYS adapter for the shared checklist interaction. Numeric records stay
// in their own section; only the checklist interaction layer is shared.
const TO_STATE: Record<DailyCheck["state"], ChecklistState> = { SUCCESS: "SUCCESS", FAILURE: "FAILURE", UNRECORDED: "NOT_RECORDED", MISSING: "UNTOUCHED" };
const TO_DIET: Record<ChecklistState, DailyCheck["state"]> = { SUCCESS: "SUCCESS", FAILURE: "FAILURE", NOT_RECORDED: "UNRECORDED", UNTOUCHED: "MISSING" };
export const toDietChanges = (changes: CellChange[]): CheckChange[] => changes.map(c => ({ date: c.date, itemId: c.rowId, state: TO_DIET[c.state] }));

const groups: Importance[] = ["CORE", "SECONDARY", "OPTIONAL"];
type RecordView = "day" | "week" | "month";

export function ChecklistRecordSection({ store }: { store: DietStore }) {
  const { data } = store;
  const [view, setView] = useState<RecordView>("week");
  const [date, setDate] = useState(today);
  const [filters, setFilters] = useState<Importance[]>([...groups]);
  const now = today();
  const first = view === "day" ? date : view === "week" ? weekStart(date) : monthStart(date);
  const last = view === "day" ? date : view === "week" ? addDays(first, 6) : monthEnd(date);
  const dates = useMemo(() => daysBetween(first, last).map(d => ({ date: d })), [first, last]);
  const checkMap = useMemo(() => new Map(data.checks.map(check => [`${check.itemId}|${check.date}`, check])), [data.checks]);
  const itemById = useMemo(() => new Map(data.items.map(i => [i.id, i])), [data.items]);

  const baseState = useCallback((itemId: string, d: string) => TO_STATE[checkMap.get(`${itemId}|${d}`)?.state ?? "MISSING"], [checkMap]);
  const mutations = useChecklistMutations({
    baseState,
    persist: async changes => {
      if (!store.saveChecks) throw new Error("저장 경로가 없습니다.");
      await store.saveChecks(toDietChanges(changes));
    },
    commit: () => {}, // saveChecks patches store data after the confirmed write.
  });
  const availability = useCallback((itemId: string, d: string): CellAvailability => {
    const item = itemById.get(itemId);
    if (!item) return "INACTIVE";
    if (d > now) return "FUTURE";
    return dietActiveOn(item, d, data.archivePeriods ?? [], data.checks) ? "EDITABLE" : "INACTIVE";
  }, [itemById, now, data.archivePeriods, data.checks]);

  // Existing DIET importance grouping/filter is preserved; order inside a group is the explicit sortOrder.
  const gridGroups: GridGroup[] = useMemo(() => groups.filter(g => filters.includes(g)).map(g => ({
    id: g,
    label: g,
    rows: data.items.filter(i => i.active && i.importance === g).sort((a, b) => a.sortOrder - b.sortOrder).map(item => ({
      id: item.id,
      label: item.title,
      meta: item.keyPoint ? <span title={item.keyPoint}>핵심</span> : undefined,
      aside: view === "day" ? <MemoInput key={`${date}-${item.id}-${checkMap.get(`${item.id}|${date}`)?.memo ?? ""}`} label={`${item.title} 메모`} memo={checkMap.get(`${item.id}|${date}`)?.memo ?? ""} disabled={date > now || date < item.startDate}
        onSave={memo => void store.saveCheck({ date, itemId: item.id, memo, state: TO_DIET[mutations.getState(item.id, date)] }).catch(() => {})} /> : undefined,
    })),
  })).filter(group => group.rows.length > 0), [data.items, filters, view, date, now, checkMap, store, mutations]);

  function shift(n: number) {
    if (view !== "month") setDate(addDays(date, n * (view === "day" ? 1 : 7)));
    else { const d = new Date(`${first}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setDate(d.toISOString().slice(0, 10)); }
  }

  return (
    <section className="diet-record-section" aria-label="체크리스트 기록">
      <h2>체크리스트 기록</h2>
      <div className="diet-toolbar">
        <div className="diet-tabs" role="group" aria-label="체크리스트 기간 필터">{(["day", "week", "month"] as const).map((v, i) => <button key={v} aria-label={`체크리스트 ${["일", "주", "월"][i]}`} aria-pressed={view === v} onClick={() => setView(v)}>{["일", "주", "월"][i]}</button>)}</div>
        <button aria-label="체크리스트 이전 기간" onClick={() => shift(-1)}>‹</button><strong>{first} {first !== last && `– ${last}`}</strong><button aria-label="체크리스트 다음 기간" onClick={() => shift(1)}>›</button>
        <button onClick={() => setDate(today())}>오늘</button>
        <input aria-label="체크리스트 기준 날짜" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="diet-toolbar" role="group" aria-label="체크리스트 중요도 필터"><strong>체크리스트</strong>{groups.map(g => <button key={g} aria-label={`체크리스트 ${g}`} aria-pressed={filters.includes(g)} onClick={() => setFilters(filters.includes(g) ? filters.filter(v => v !== g) : [...filters, g])}>{g}</button>)}</div>
      <ChecklistGrid label="DIET 체크리스트 기록" groups={gridGroups} dates={dates} today={now} mutations={mutations} availability={availability} asideHeader={view === "day" ? "메모" : undefined}
        emptyText="표시할 항목이 없습니다. 항목 관리에서 추가하거나 필터를 변경하세요." />
      <small>클릭 = 성공 · 다시 클릭 = 초기화 · 우클릭/1·2·3·0 = 상태 선택 · 드래그 = 여러 칸 선택 · 날짜 머리글 = 그 날짜 전체 기록 못함. 기록 못함은 실패와 구분하며 성공률 분모에서 제외합니다.</small>
    </section>
  );
}

function MemoInput({ label, memo, disabled, onSave }: { label: string; memo: string; disabled: boolean; onSave: (memo: string) => void }) {
  return <input aria-label={label} defaultValue={memo} disabled={disabled} placeholder="메모" style={{ width: "100%" }} onBlur={e => { if (e.target.value !== memo) onSave(e.target.value); }} />;
}
