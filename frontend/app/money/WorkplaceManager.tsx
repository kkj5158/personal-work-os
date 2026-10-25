"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { moneyApi as api } from "@/lib/money/model";
import { validKrw, type Workplace, type WorkTemplate } from "@/lib/money/calendar";
import { CalendarField, TemplateEditor } from "./MoneyCalendarEditors";
import { PanelContext } from "./MoneyPanel";

type Selected = { kind: "place"; value: Workplace } | { kind: "template"; value: WorkTemplate };
export function WorkplaceManager({ workplaces, templates, onSaved }: { workplaces: Workplace[]; templates: WorkTemplate[]; onSaved: () => void }) {
  const [selected, setSelected] = useState<Selected | null>(null), [archived, setArchived] = useState(false);
  const dirty = useRef(false), parent = useContext(PanelContext);
  const setDirty = (value: boolean) => { dirty.current = value; parent.setDirty(value); };
  const select = (next: Selected) => {
    if (dirty.current && !window.confirm("저장하지 않은 변경을 버리고 이동할까요?")) return;
    setDirty(false); setSelected(next);
  };
  const addPlace = () => { select({ kind: "place", value: { id: crypto.randomUUID(), version: 0, name: "새 근무지", active: true, presets: [] } }); };
  const addTemplate = (place: Workplace) => {
    select({ kind: "template", value: { id: crypto.randomUUID(), version: 0, workplaceId: place.id, workplaceName: place.name, workplaceActive: place.active, name: "새 근무 템플릿", durationMinutes: 240, startTime: "09:00", endTime: "13:00", breakMinutes: 0, overnight: false, shiftDescription: "", groupName: "", active: true, presets: place.presets, defaultPresetId: place.presets.find(p => p.active)?.id ?? null } });
  };
  return <PanelContext.Provider value={{ ...parent, setDirty }}><div className="mc-management">
    <nav aria-label="근무지 및 템플릿 탐색"><button type="button" onClick={addPlace}>＋ 근무지</button>
      <label className="mc-check"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />보관 항목 표시</label>
      {workplaces.filter(p => p.active || archived).map(place => <details key={place.id} open><summary>{place.name}{!place.active && " · 보관됨"}</summary>
        <button type="button" aria-pressed={selected?.kind === "place" && selected.value.id === place.id} onClick={() => select({ kind: "place", value: place })}>{place.name} · 설정 / 프리셋</button>
        {templates.filter(t => t.workplaceId === place.id && (t.active || archived)).map(t => <button type="button" key={t.id} aria-pressed={selected?.kind === "template" && selected.value.id === t.id} onClick={() => select({ kind: "template", value: t })}>↳ {t.name}{!t.active && " · 보관됨"}</button>)}
        {place.active && <button type="button" onClick={() => addTemplate(place)}>＋ 템플릿</button>}
      </details>)}
    </nav>
    <section aria-label="선택 항목 편집" className="mc-management-detail">{selected?.kind === "place" ? <WorkplaceForm key={selected.value.id} initial={selected.value} onSaved={place => { setSelected({ kind: "place", value: place }); onSaved(); }} /> : selected?.kind === "template" ? <TemplateEditor key={selected.value.id} initial={selected.value} workplaces={workplaces} onSaved={template => { setSelected({ kind: "template", value: template }); onSaved(); }} /> : <p className="mc-state">근무지를 선택하거나 추가하세요. 같은 근무지의 모든 템플릿이 금액 프리셋을 공유합니다.</p>}</section>
  </div></PanelContext.Provider>;
}

function WorkplaceForm({ initial, onSaved }: { initial: Workplace; onSaved: (place: Workplace) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(initial)), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const { setDirty } = useContext(PanelContext), busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const patch = (value: Partial<Workplace>) => { setDraft(p => ({ ...p, ...value })); setDirty(true); setSaved(false); };
  return <form className="mc-editor" onSubmit={async e => {
    e.preventDefault(); if (busy.current) return;
    if (!draft.name.trim() || draft.presets.some(p => !p.name.trim() || !validKrw(p.amount))) { setError("근무지·프리셋 이름과 0 이상의 원 단위 금액을 확인하세요."); return; }
    busy.current = true; setSaving(true); setError("");
    try { const result = await api.put<Workplace>("/calendar/workplaces/" + draft.id, { expectedVersion: draft.version, name: draft.name, active: draft.active, presets: draft.presets }); if (!active.current) return; setDraft(result); setDirty(false); setSaved(true); onSaved(result); }
    catch (e) { if (active.current) setError(e instanceof Error ? e.message : "근무지 저장 실패"); }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }}><fieldset disabled={saving}>
    <CalendarField label="근무지 이름"><input required maxLength={120} value={draft.name} onChange={e => patch({ name: e.target.value })} /></CalendarField>
    <label className="mc-check"><input type="checkbox" checked={draft.active} onChange={e => patch({ active: e.target.checked })} />활성 (해제 후 저장하면 보관, 다시 선택 후 저장하면 복원)</label>
    <p className="mc-hint">보관해도 기존 근무와 금액·입금 이력은 남습니다. 복원하면 템플릿·프리셋 각각의 사용 상태가 유지됩니다.</p>
    <h3>공유 금액 프리셋</h3><p className="mc-hint">이 근무지의 모든 템플릿에서 사용합니다. 수정해도 저장된 근무의 확정 일급은 바뀌지 않습니다.</p>
    {draft.presets.map((preset, index) => <section key={preset.id} className="mc-payment">
      <CalendarField label={`프리셋 ${index + 1} 이름`}><input required maxLength={120} value={preset.name} onChange={e => patch({ presets: draft.presets.map(p => p.id === preset.id ? { ...p, name: e.target.value } : p) })} /></CalendarField>
      <CalendarField label={`프리셋 ${index + 1} 금액 (원)`}><input required type="number" min={0} max={999999999999} step={1} value={Number.isFinite(preset.amount) ? preset.amount : ""} onChange={e => patch({ presets: draft.presets.map(p => p.id === preset.id ? { ...p, amount: e.target.value === "" ? NaN : Number(e.target.value) } : p) })} /></CalendarField>
      <label className="mc-check"><input type="checkbox" checked={preset.active} onChange={e => patch({ presets: draft.presets.map(p => p.id === preset.id ? { ...p, active: e.target.checked } : p) })} />사용 (해제하면 보관)</label>
    </section>)}
    <button type="button" disabled={draft.presets.length >= 100} onClick={() => patch({ presets: [...draft.presets, { id: crypto.randomUUID(), name: "새 금액 프리셋", amount: 0, active: true }] })}>＋ 금액 프리셋</button>
    {error && <p className="mc-error" role="alert">{error} 초안은 유지됩니다. 최신 목록을 확인한 후 다시 열어 주세요.</p>}{saved && <p className="mc-success" role="status">근무지를 저장했습니다.</p>}
  </fieldset><footer><button className="money-primary" disabled={saving}>{saving ? "저장 중…" : "근무지 저장"}</button></footer></form>;
}
