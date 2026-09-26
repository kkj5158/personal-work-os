"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Area, Identity } from "@/lib/checklist-sys/api";
import { IDENTITY_COLORS, orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";
import { Sortable } from "./Sortable";
import { SaveState, useAutosave } from "./useAutosave";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The one classification-management surface: Identity (master) + its Areas (detail).
 * Edits save in place and update every list immediately. Checklist items are
 * managed in Journal, never here.
 */
export default function Classification({ store, navigate }: { store: ChecklistSysStore; navigate: (href: string) => void }) {
  const { catalog } = store;
  const identities = useMemo(() => [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder), [catalog.identities]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = identities.find(i => i.id === selectedId) ?? identities[0];
  const areas = selected ? orderedAreas(catalog, selected.id).map(({ area }) => area) : [];
  const itemCount = (areaIds: string[]) => catalog.items.filter(i => areaIds.includes(i.areaId) && !i.archivedOn).length;

  return (
    <>
      <header className="cks-header">
        <div>
          <h1>Identity & Area</h1>
          <p>분류 구조만 관리합니다. 체크리스트 항목의 추가·수정·순서는 <button type="button" className="cks-link" onClick={() => navigate("/checklist")}>Journal</button>에서 바로 합니다.</p>
        </div>
      </header>
      <div className="cks-structure">
        <section className="cks-card cks-identity-card" aria-label="Identity 목록">
          <div className="cks-card-head"><h2>Identity</h2></div>
          <Sortable ids={identities.map(i => i.id)} onReorder={ids => void store.reorder("identities", null, ids)}>
            {(id, handle) => {
              const identity = identities.find(i => i.id === id)!;
              return (
                <div className={`cks-identity${identity.id === selected?.id ? " is-selected" : ""}`}>
                  {handle}
                  <button type="button" className="cks-identity-main" aria-pressed={identity.id === selected?.id} onClick={() => setSelectedId(identity.id)}>
                    <span className="cks-dot" style={{ background: identity.color }} />
                    <span><strong>{identity.name}</strong><small>{identity.description || "설명 없음"}</small></span>
                  </button>
                  <span className="cks-count" title="활성 항목 수">{itemCount(catalog.areas.filter(a => a.identityId === identity.id).map(a => a.id))}</span>
                </div>
              );
            }}
          </Sortable>
          {!identities.length && <p className="cks-muted">예: REN, KAFKA, JISEUNG 처럼 개인 정체성/맥락을 추가하세요.</p>}
          <QuickAdd label="새 Identity" placeholder="새 Identity 이름" onAdd={async name => {
            const identity: Identity = { id: crypto.randomUUID(), name, description: "", color: IDENTITY_COLORS[identities.length % IDENTITY_COLORS.length], sortOrder: identities.length };
            await store.saveIdentity(identity);
            setSelectedId(identity.id);
          }} />
        </section>

        <section className="cks-card cks-detail-card" aria-label="선택한 Identity와 Area">
          {selected ? (
            <>
              <IdentityForm key={selected.id} store={store} identity={selected} hasAreas={areas.length > 0} onDeleted={() => setSelectedId(null)} />
              <div className="cks-card-head cks-area-head"><h2>Area <small>{selected.name}</small></h2></div>
              <Sortable ids={areas.map(a => a.id)} onReorder={ids => void store.reorder("areas", selected.id, ids)}>
                {(id, handle) => <AreaRow key={id} store={store} area={areas.find(a => a.id === id)!} color={selected.color} identities={identities} count={itemCount([id])} handle={handle} />}
              </Sortable>
              {!areas.length && <p className="cks-muted">이 Identity 아래 Area를 추가하세요. 예: 가벼움 / 다이어트, Work, Life</p>}
              <QuickAdd label="새 Area" placeholder={`${selected.name}에 새 Area 이름`} onAdd={name => store.saveArea({ id: crypto.randomUUID(), identityId: selected.id, name, description: "", color: selected.color, sortOrder: areas.length })} />
            </>
          ) : <p className="cks-muted">왼쪽에서 Identity를 추가하세요.</p>}
        </section>
      </div>
    </>
  );
}

function IdentityForm({ store, identity, hasAreas, onDeleted }: { store: ChecklistSysStore; identity: Identity; hasAreas: boolean; onDeleted: () => void }) {
  const [draft, setDraft] = useState(identity);
  const [deleteError, setDeleteError] = useState("");
  const invalid = draft.name.trim() ? "" : "이름을 입력하면 저장됩니다.";
  const autosave = useAutosave(draft, store.saveIdentity, { valid: !invalid });
  const remove = async () => {
    setDeleteError("");
    try { await store.deleteIdentity(identity.id); onDeleted(); } catch (e) { setDeleteError(errorText(e, "삭제하지 못했습니다.")); }
  };
  return (
    <form className="cks-identity-form" aria-label={`${identity.name} Identity 편집`} onSubmit={event => { event.preventDefault(); autosave.retry(); }}>
      <div className="cks-card-head">
        <h2><span className="cks-dot" style={{ background: draft.color }} />Identity 정보</h2>
        <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} invalid={invalid} />
      </div>
      <div className="cks-field-row">
        <label className="cks-field">이름<input maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="cks-field">설명<input maxLength={500} placeholder="선택 사항" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <div className="cks-field">
        <span>대표 색상 <small>이 Identity의 Area 표시와 모든 체크리스트 아이콘이 이 색상을 따릅니다.</small></span>
        <div className="cks-colors">{IDENTITY_COLORS.map(color => <button key={color} type="button" aria-label={`색상 ${color}`} aria-pressed={draft.color === color} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}</div>
      </div>
      <div className="cks-identity-actions">
        <button type="button" className="cks-text-danger" disabled={hasAreas} title={hasAreas ? "Area가 있는 Identity는 삭제할 수 없습니다." : undefined} onClick={() => void remove()}><Trash2 size={13} />Identity 삭제</button>
        {hasAreas && <small className="cks-muted">Area를 먼저 정리해야 삭제할 수 있습니다.</small>}
        {deleteError && <p role="alert" className="cks-form-error">{deleteError}</p>}
      </div>
    </form>
  );
}

function AreaRow({ store, area, color, identities, count, handle }: { store: ChecklistSysStore; area: Area; color: string; identities: Identity[]; count: number; handle: React.ReactNode }) {
  const [draft, setDraft] = useState(area);
  const [deleteError, setDeleteError] = useState("");
  const invalid = draft.name.trim() ? "" : "이름 필요";
  const autosave = useAutosave(draft, store.saveArea, { valid: !invalid });
  const remove = async () => {
    setDeleteError("");
    try { await store.deleteArea(area.id); } catch (e) { setDeleteError(errorText(e, "삭제하지 못했습니다.")); }
  };
  return (
    <div className="cks-area-row">
      {handle}
      <span className="cks-dot" style={{ background: color }} />
      <input aria-label="Area 이름" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
      <input aria-label="Area 설명" maxLength={500} placeholder="설명 (선택)" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      <select aria-label="소속 Identity" value={draft.identityId} onChange={e => setDraft({ ...draft, identityId: e.target.value })}>
        {identities.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <span className="cks-count" title="활성 항목 수">{count}</span>
      <button type="button" className="cks-icon-button" aria-label={`${area.name} Area 삭제`} title={count ? "항목(보관 포함)이 있는 Area는 삭제할 수 없습니다." : "Area 삭제"} onClick={() => void remove()}><Trash2 size={14} /></button>
      <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} invalid={invalid} />
      {deleteError && <span role="alert" className="cks-save cks-save-error cks-area-error">{deleteError}</span>}
    </div>
  );
}

function QuickAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [state, setState] = useState<{ running: boolean; error: string }>({ running: false, error: "" });
  return (
    <form className="cks-quickadd" aria-label={label} onSubmit={async event => {
      event.preventDefault();
      if (!name.trim()) return;
      setState({ running: true, error: "" });
      try { await onAdd(name.trim()); setName(""); setState({ running: false, error: "" }); }
      catch (e) { setState({ running: false, error: errorText(e, "추가하지 못했습니다.") }); }
    }}>
      <input aria-label={placeholder} placeholder={placeholder} maxLength={100} value={name} onChange={e => setName(e.target.value)} />
      <button type="submit" className="cks-primary" disabled={state.running || !name.trim()}><Plus size={14} />{label.replace("새 ", "")} 추가</button>
      {state.error && <p role="alert" className="cks-form-error">{state.error}</p>}
    </form>
  );
}
