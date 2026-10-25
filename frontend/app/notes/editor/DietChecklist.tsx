"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ChecklistGrid } from "@/components/checklist-core/ChecklistGrid";
import { useChecklistMutations } from "@/components/checklist-core/useChecklistMutations";
import { TO_STATE, toDietChanges } from "@/app/diet/ChecklistRecord";
import { checklistStats, dietActiveOn, today } from "@/lib/diet/model";
import { checklistOn } from "@/lib/diet/day";
import { IMPORTANCES, type CellAvailability } from "@/lib/checklist-core/types";
import type { DietStore } from "@/lib/diet/types";
import { useNoteEnvironment } from "../NoteContext";

/** Date adapter only. Interaction, write queue, rollback and API are shared with DIET Record. */
export function DietChecklist({ store, date, readonly }: { store: DietStore; date: string; readonly: boolean }) {
  const { data } = store;
  const env = useNoteEnvironment();
  const register = env.register;
  const items = checklistOn(date, data).rows.map(row => row.item);
  const mutations = useChecklistMutations({
    baseState: (id, d) => TO_STATE[data.checks.find(c => c.itemId === id && c.date === d)?.state ?? "MISSING"],
    persist: async changes => {
      if (!store.saveChecks) throw new Error("체크리스트 저장 경로를 사용할 수 없습니다.");
      await store.saveChecks(toDietChanges(changes));
    },
    commit: () => {},
  });
  const latest = useRef(mutations);
  useLayoutEffect(() => { latest.current = mutations; });
  useEffect(() => register(`diet-checklist/${date}`, () => latest.current.flush(), () => latest.current.saving || !!latest.current.error), [register, date]);
  const availability = useCallback((id: string, d: string): CellAvailability => {
    if (readonly) return "INACTIVE";
    if (d > today()) return "FUTURE";
    const item = data.items.find(i => i.id === id);
    return item && dietActiveOn(item, d, data.archivePeriods ?? [], data.checks) ? "EDITABLE" : "INACTIVE";
  }, [readonly, data]);
  const summary = checklistStats(data, items.map(i => i.id), date, date, true);
  return <>
    <div className="diet-dashboard-section-title"><h4>오늘의 체크리스트</h4><span>{summary.success} / {summary.eligible} 완료 · {summary.rate == null ? "집계 대기" : `${Math.round(summary.rate)}%`}</span>{mutations.saving && <small role="status">저장 중…</small>}<a href={`/diet/record?date=${date}`}>체크리스트 관리 ↗</a></div>
    {summary.rate != null && <progress aria-label="체크리스트 성공률" value={summary.rate} max={100}/>}
    <ChecklistGrid singleDay label={`${date} DIET 체크리스트`} groups={IMPORTANCES.map(importance => ({ id: importance, label: importance, rows: items.filter(i => i.importance === importance).sort((a, b) => a.sortOrder - b.sortOrder).map(i => ({ id: i.id, label: i.title })) })).filter(g => g.rows.length)} dates={[{ date }]} today={today()} mutations={mutations} availability={availability}/>
    {mutations.error && <div role="alert">{mutations.error}<button onClick={mutations.retry}>재시도</button><button onClick={mutations.clearError}>확인</button></div>}
    <small>기존 DIET SYS와 같은 기록입니다. 클릭: 성공 / 초기화 · 상태 선택: 실패 / 기록 못함 / 미입력. 기록 못함은 성공률 분모에서 제외됩니다.</small>
  </>;
}
