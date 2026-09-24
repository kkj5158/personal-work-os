"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconPicker } from "@/components/checklist-core/IconPicker";
import { DEFAULT_ICON } from "@/components/checklist-core/icons";
import { seoulToday } from "@/lib/checklist-core/dates";
import { IMPORTANCES } from "@/lib/checklist-core/types";
import { checklistSysApi, type Item } from "@/lib/checklist-sys/api";
import { orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";

/** Create/Edit drawer — name, Identity, Area, importance, icon and active state only (no time settings). */
export function ItemDrawer({ store, item, initialAreaId, onClose }: { store: ChecklistSysStore; item?: Item; initialAreaId?: string; onClose: () => void }) {
  const { catalog } = store;
  const firstArea = catalog.areas.find(a => a.id === (item?.areaId ?? initialAreaId)) ?? orderedAreas(catalog)[0]?.area;
  const [draft, setDraft] = useState<Item>(() => item ?? {
    id: crypto.randomUUID(), areaId: firstArea?.id ?? "", name: "", description: "", importance: "CORE",
    icon: DEFAULT_ICON, sortOrder: 0, startDate: seoulToday(), archivedOn: null,
  });
  const [identityId, setIdentityId] = useState(firstArea?.identityId ?? catalog.identities[0]?.id ?? "");
  const [active, setActive] = useState(!item?.archivedOn);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const areas = orderedAreas(catalog, identityId || null).map(({ area }) => area);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.areaId) { setError("Area를 선택하세요."); return; }
    setSaving(true); setError("");
    try {
      await store.mutate(async () => {
        await checklistSysApi.saveItem(draft);
        if (item && item.archivedOn && active) await checklistSysApi.restoreItem(item.id);
        if (item && !item.archivedOn && !active) await checklistSysApi.archiveItem(item.id);
      });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  return (
    <div className="cks-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="cks-drawer" role="dialog" aria-modal="true" aria-labelledby="cks-drawer-title">
        <form onSubmit={submit}>
          <header>
            <div>
              <h2 id="cks-drawer-title">{item ? "체크리스트 항목 수정" : "체크리스트 항목 만들기"}</h2>
              <p>시간·알림 없이 하루 수행 여부만 기록합니다.</p>
            </div>
            <button type="button" className="cks-icon-button" aria-label="닫기" onClick={onClose}><X size={18} /></button>
          </header>
          <div className="cks-drawer-body">
            <label className="cks-field">항목 이름
              <input required maxLength={200} autoFocus placeholder="예: 매일 식단 기록" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="cks-field">설명
              <textarea maxLength={2000} placeholder="선택 사항" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            </label>
            <div className="cks-field-row">
              <label className="cks-field">Identity
                <select value={identityId} onChange={e => { setIdentityId(e.target.value); setDraft({ ...draft, areaId: orderedAreas(catalog, e.target.value).at(0)?.area.id ?? "" }); }}>
                  {[...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </label>
              <label className="cks-field">Area
                <select required value={draft.areaId} onChange={e => setDraft({ ...draft, areaId: e.target.value })}>
                  {!areas.length && <option value="">Area 없음</option>}
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="cks-field">
              <legend>중요도</legend>
              <div className="cks-importance" role="radiogroup" aria-label="중요도">
                {IMPORTANCES.map(level => (
                  <button key={level} type="button" role="radio" aria-checked={draft.importance === level} className={`cks-importance-${level.toLowerCase()}`} onClick={() => setDraft({ ...draft, importance: level })}>{level}</button>
                ))}
              </div>
              <small>분류·필터 용도입니다. 정렬 순서와 통계 가중치에는 영향을 주지 않습니다.</small>
            </fieldset>
            <fieldset className="cks-field">
              <legend>아이콘</legend>
              <IconPicker value={draft.icon} onChange={icon => setDraft({ ...draft, icon })} />
            </fieldset>
            <label className="cks-field">기록 시작일
              <input type="date" required value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} />
            </label>
            {item && (
              <div className="cks-field">
                <span>상태</span>
                <label className="cks-switch">
                  <input type="checkbox" role="switch" checked={active} onChange={e => setActive(e.target.checked)} />
                  <span aria-hidden="true" />
                  {active ? "활성" : "보관 (과거 기록 유지)"}
                </label>
              </div>
            )}
            {error && <p role="alert" className="cks-form-error">{error}</p>}
          </div>
          <footer>
            <button type="button" onClick={onClose}>취소</button>
            <button type="submit" className="cks-primary" disabled={saving || store.busy}>{item ? "저장" : "항목 추가"}</button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
