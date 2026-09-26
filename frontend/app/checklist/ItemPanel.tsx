"use client";
import { useState } from "react";
import { Archive, ArchiveRestore, X } from "lucide-react";
import { IconPicker } from "@/components/checklist-core/IconPicker";
import { ChecklistIcon, DEFAULT_ICON } from "@/components/checklist-core/icons";
import { seoulToday } from "@/lib/checklist-core/dates";
import { IMPORTANCES } from "@/lib/checklist-core/types";
import type { Item } from "@/lib/checklist-sys/api";
import { identityColorOf, orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";
import { SaveState, useAutosave } from "./useAutosave";

export type PanelMode = { kind: "create"; areaId?: string } | { kind: "edit"; itemId: string };

const short = (date: string | null | undefined) => (date ? date.slice(5).replace("-", ".") : "—");

/**
 * Journal's docked right-side item panel. Not a modal: the grid stays visible and
 * usable. Create and edit share this component; edits autosave in place.
 */
export function ItemPanel({ store, mode, onClose, onCreated }: { store: ChecklistSysStore; mode: PanelMode; onClose: () => void; onCreated: (itemId: string) => void }) {
  const item = mode.kind === "edit" ? store.catalog.items.find(i => i.id === mode.itemId) : undefined;
  return (
    <aside className="cks-panel" aria-labelledby="cks-panel-title" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      {mode.kind === "edit" && !item
        ? <p className="cks-muted">항목을 찾을 수 없습니다.</p>
        : <PanelForm key={item?.id ?? "new"} store={store} item={item} initialAreaId={mode.kind === "create" ? mode.areaId : undefined} onClose={onClose} onCreated={onCreated} />}
    </aside>
  );
}

function PanelForm({ store, item, initialAreaId, onClose, onCreated }: { store: ChecklistSysStore; item?: Item; initialAreaId?: string; onClose: () => void; onCreated: (itemId: string) => void }) {
  const { catalog } = store;
  const firstArea = catalog.areas.find(a => a.id === (item?.areaId ?? initialAreaId)) ?? orderedAreas(catalog)[0]?.area;
  const [draft, setDraft] = useState<Item>(() => item ?? {
    id: crypto.randomUUID(), areaId: firstArea?.id ?? "", name: "", description: "", importance: "CORE",
    icon: DEFAULT_ICON, sortOrder: 0, startDate: seoulToday(), archivedOn: null,
  });
  const [identityId, setIdentityId] = useState(firstArea?.identityId ?? catalog.identities[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [lifecycle, setLifecycle] = useState<{ running: boolean; error: string }>({ running: false, error: "" });
  const areas = orderedAreas(catalog, identityId || null).map(({ area }) => area);
  const invalid = !draft.name.trim() ? "이름을 입력하면 저장됩니다." : !draft.areaId ? "Area를 선택하세요." : "";
  // Edit mode autosaves; create mode commits once with an explicit button.
  const autosave = useAutosave(draft, store.saveItem, { valid: !!item && !invalid });
  const color = identityColorOf(catalog, draft.areaId);
  const current = item ? catalog.items.find(i => i.id === item.id) ?? item : undefined;
  const set = (patch: Partial<Item>) => setDraft(d => ({ ...d, ...patch }));

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (invalid) { setCreateError(invalid); return; }
    setCreating(true); setCreateError("");
    try { await store.saveItem(draft); onCreated(draft.id); }
    catch (e) { setCreateError(e instanceof Error ? e.message : "추가하지 못했습니다."); }
    finally { setCreating(false); }
  }

  async function setArchived(archived: boolean) {
    if (!current) return;
    setLifecycle({ running: true, error: "" });
    try { await autosave.flush(); await store.setItemArchived(current, archived); setLifecycle({ running: false, error: "" }); }
    catch (e) { setLifecycle({ running: false, error: e instanceof Error ? e.message : "처리하지 못했습니다." }); }
  }

  return (
    <form className="cks-panel-form" onSubmit={item ? event => { event.preventDefault(); autosave.retry(); } : create}>
      <header className="cks-panel-head">
        <span className="cks-panel-icon" style={{ color }}><ChecklistIcon name={draft.icon} size={18} /></span>
        <div>
          <h2 id="cks-panel-title">{item ? "체크리스트 항목" : "체크리스트 추가"}</h2>
          {item ? <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} invalid={invalid} /> : <p>시간·알림 없이 하루 수행 여부만 기록합니다.</p>}
        </div>
        <button type="button" className="cks-icon-button" aria-label="패널 닫기" onClick={onClose}><X size={17} /></button>
      </header>

      <div className="cks-panel-body">
        {current?.archivedOn && (
          <p className="cks-panel-note">보관된 항목입니다 ({short(current.archivedOn)}). 과거 기록은 유지되며, 복원하면 같은 항목으로 이어서 기록합니다.</p>
        )}
        <label className="cks-field">항목 이름
          <input required maxLength={200} autoFocus={!item} placeholder="예: 매일 식단 기록" value={draft.name} onChange={e => set({ name: e.target.value })} />
        </label>
        <label className="cks-field">설명
          <textarea maxLength={2000} rows={2} placeholder="선택 사항" value={draft.description} onChange={e => set({ description: e.target.value })} />
        </label>
        <div className="cks-field-row">
          <label className="cks-field">Identity
            <select value={identityId} onChange={e => { setIdentityId(e.target.value); set({ areaId: orderedAreas(catalog, e.target.value).at(0)?.area.id ?? "" }); }}>
              {[...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="cks-field">Area
            <select required value={draft.areaId} onChange={e => set({ areaId: e.target.value })}>
              {!areas.length && <option value="">Area 없음</option>}
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="cks-field">
          <legend>중요도</legend>
          <div className="cks-importance" role="radiogroup" aria-label="중요도">
            {IMPORTANCES.map(level => (
              <button key={level} type="button" role="radio" aria-checked={draft.importance === level} className={`cks-importance-${level.toLowerCase()}`} onClick={() => set({ importance: level })}>{level}</button>
            ))}
          </div>
          <small>분류·필터 용도입니다. 순서와 통계 가중치에는 영향을 주지 않습니다.</small>
        </fieldset>
        <fieldset className="cks-field">
          <legend>아이콘 <small>색상은 Identity 대표 색상을 따릅니다.</small></legend>
          <IconPicker value={draft.icon} color={color} onChange={icon => set({ icon })} />
        </fieldset>
        <label className="cks-field">기록 시작일
          <input type="date" required value={draft.startDate} onChange={e => e.target.value && set({ startDate: e.target.value })} />
        </label>
        {current && (
          <div className="cks-field">
            <span>상태</span>
            <div className="cks-lifecycle">
              {current.archivedOn
                ? <button type="button" className="cks-outline" disabled={lifecycle.running} onClick={() => void setArchived(false)}><ArchiveRestore size={14} />{lifecycle.running ? "복원 중…" : "복원"}</button>
                : <button type="button" className="cks-outline" disabled={lifecycle.running} onClick={() => void setArchived(true)}><Archive size={14} />{lifecycle.running ? "보관 중…" : "보관 (삭제)"}</button>}
              <small>{current.archivedOn ? "복원하면 오늘부터 다시 기록합니다." : "보관해도 과거 기록은 유지됩니다. 마지막 기록 " + short(current.lastRecordOn)}</small>
            </div>
            {lifecycle.error && <p role="alert" className="cks-form-error">{lifecycle.error}</p>}
          </div>
        )}
        {createError && <p role="alert" className="cks-form-error">{createError}</p>}
      </div>
      {!item && (
        <footer className="cks-panel-foot">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="cks-primary" disabled={creating}>{creating ? "추가 중…" : "항목 추가"}</button>
        </footer>
      )}
    </form>
  );
}
