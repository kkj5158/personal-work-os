"use client";
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Area, Identity } from "@/lib/checklist-sys/api";
import { IDENTITY_COLORS, orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";
import { IdentityAreaTree } from "./IdentityAreaTree";
import { ColorPicker } from "./ColorPicker";
import { SaveState, useAutosave } from "./useAutosave";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The one classification-management surface, table-first: every Identity is a
 * parent row with its Areas as indented child rows. Rows edit and autosave in place;
 * handles reorder Identities, reorder Areas, or drag an Area into another Identity.
 * Checklist items are managed in Journal, never here.
 */
export default function Classification({ store, navigate }: { store: ChecklistSysStore; navigate: (href: string) => void }) {
  const { catalog } = store;
  const identities = useMemo(() => [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder), [catalog.identities]);
  const areasOf = (identityId: string) => orderedAreas(catalog, identityId).map(({ area }) => area);
  const activeCount = (areaIds: string[]) => catalog.items.filter(i => areaIds.includes(i.areaId) && !i.archivedOn).length;
  const [addingArea, setAddingArea] = useState<string | null>(null);
  const identityInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="cks-header">
        <div>
          <h1>Identity & Area</h1>
          <p>분류 구조만 관리합니다. 체크리스트 항목의 추가·수정·순서는 <button type="button" className="cks-link" onClick={() => navigate("/checklist")}>Journal</button>에서 바로 합니다.</p>
        </div>
        <div className="cks-toolbar">
          <button type="button" className="cks-primary" onClick={() => identityInput.current?.focus()}><Plus size={14} />Identity 추가</button>
        </div>
      </header>
      <section className="cks-card cks-ctable" role="table" aria-label="Identity와 Area">
        <div className="cks-trow cks-thead" role="row">
          <span role="columnheader" aria-label="순서" /><span role="columnheader">구분</span><span role="columnheader">이름</span><span role="columnheader">설명</span>
          <span role="columnheader">색상</span><span role="columnheader">항목 수</span><span role="columnheader" className="cks-tactions">작업</span><span role="columnheader" aria-label="저장 상태" />
        </div>
        <IdentityAreaTree
          identities={identities}
          areasOf={areasOf}
          onReorderIdentities={ids => void store.reorder("identities", null, ids)}
          onReorderAreas={(identityId, ids) => void store.reorder("areas", identityId, ids)}
          onMoveArea={(areaId, identityId, ids) => void store.moveArea(areaId, identityId, ids)}
          renderIdentity={(identity, handle, { dropTarget }) => (
            <IdentityRow key={identity.id} store={store} identity={identity} handle={handle} dropTarget={dropTarget}
              count={activeCount(catalog.areas.filter(a => a.identityId === identity.id).map(a => a.id))}
              hasAreas={catalog.areas.some(a => a.identityId === identity.id)} onAddArea={() => setAddingArea(identity.id)} />
          )}
          renderArea={(area, identity, handle, { dropBefore }) => (
            <AreaRow key={area.id} store={store} area={area} identity={identity} identities={identities} handle={handle} dropBefore={dropBefore} count={activeCount([area.id])} />
          )}
          renderGroupEnd={identity => addingArea === identity.id && (
            <div className="cks-trow cks-trow-add" role="row">
              <span /><span className="cks-type cks-type-area">A</span>
              <QuickAdd autoFocus label={`${identity.name}에 Area 추가`} placeholder="새 Area 이름 (Enter)" onCancel={() => setAddingArea(null)}
                onAdd={async name => { await store.saveArea({ id: crypto.randomUUID(), identityId: identity.id, name, description: "", color: identity.color, sortOrder: 0 }); }} />
            </div>
          )}
        />
        <div className="cks-trow cks-trow-add" role="row">
          <span /><span className="cks-type cks-type-identity">I</span>
          <QuickAdd inputRef={identityInput} label="Identity 추가" placeholder="새 Identity 이름 (Enter)" onAdd={async name => {
            await store.saveIdentity({ id: crypto.randomUUID(), name, description: "", color: IDENTITY_COLORS[identities.length % IDENTITY_COLORS.length], sortOrder: identities.length });
          }} />
        </div>
        {!identities.length && <p className="cks-muted cks-table-empty">예: REN, KAFKA, JISEUNG 처럼 개인 정체성/맥락을 추가하세요.</p>}
      </section>
      <p className="cks-hint">⋮⋮ 핸들로 Identity 순서 · Area 순서를 바꾸고, Area를 다른 Identity 행/그룹으로 끌어 놓으면 소속이 바뀝니다 (Area·항목·기록은 그대로 유지). Area 색상 표시는 Identity 대표 색상을 따릅니다.</p>
    </>
  );
}

function IdentityRow({ store, identity, handle, count, hasAreas, dropTarget, onAddArea }: { store: ChecklistSysStore; identity: Identity; handle: React.ReactNode; count: number; hasAreas: boolean; dropTarget: boolean; onAddArea: () => void }) {
  const [draft, setDraft] = useState(identity);
  const [deleteError, setDeleteError] = useState("");
  const invalid = draft.name.trim() ? "" : "이름 필요";
  const autosave = useAutosave(draft, store.saveIdentity, { valid: !invalid });
  const remove = async () => {
    setDeleteError("");
    try { await store.deleteIdentity(identity.id); } catch (e) { setDeleteError(errorText(e, "삭제하지 못했습니다.")); }
  };
  return (
    <div className={`cks-trow cks-trow-identity${dropTarget ? " is-drop-target" : ""}`} role="row" aria-label={`Identity ${identity.name}`}>
      <span role="cell">{handle}</span>
      <span role="cell" className="cks-type cks-type-identity" style={{ background: draft.color }} title="Identity">I</span>
      <input role="cell" aria-label="Identity 이름" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
      <input role="cell" aria-label="Identity 설명" maxLength={500} placeholder="설명 없음" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      <span role="cell"><ColorPicker label={identity.name} value={draft.color} onChange={color => setDraft(d => ({ ...d, color }))} /></span>
      <span role="cell" className="cks-tcount" title="활성 항목 수">{count}</span>
      <span role="cell" className="cks-tactions">
        <button type="button" className="cks-link" onClick={onAddArea}><Plus size={12} />Area</button>
        <button type="button" className="cks-icon-button" aria-label={`${identity.name} Identity 삭제`} disabled={hasAreas} title={hasAreas ? "Area가 있는 Identity는 삭제할 수 없습니다." : "Identity 삭제"} onClick={() => void remove()}><Trash2 size={14} /></button>
      </span>
      <span role="cell" className="cks-tsave">
        <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} invalid={invalid} />
        {deleteError && <span role="alert" className="cks-save cks-save-error">{deleteError}</span>}
      </span>
    </div>
  );
}

function AreaRow({ store, area, identity, identities, handle, count, dropBefore }: { store: ChecklistSysStore; area: Area; identity: Identity; identities: Identity[]; handle: React.ReactNode; count: number; dropBefore: boolean }) {
  // Only name/description are edited here; ownership changes go through the atomic move.
  const [draft, setDraft] = useState({ name: area.name, description: area.description });
  const [deleteError, setDeleteError] = useState("");
  const invalid = draft.name.trim() ? "" : "이름 필요";
  const current = store.catalog.areas.find(a => a.id === area.id) ?? area;
  const save = useMemo(() => (value: { name: string; description: string }) => store.saveArea({ ...current, ...value }), [store, current]);
  const autosave = useAutosave(draft, save, { valid: !invalid });
  const remove = async () => {
    setDeleteError("");
    try { await store.deleteArea(area.id); } catch (e) { setDeleteError(errorText(e, "삭제하지 못했습니다.")); }
  };
  const moveTo = (identityId: string) => {
    const ids = [...store.catalog.areas.filter(a => a.identityId === identityId).sort((a, b) => a.sortOrder - b.sortOrder).map(a => a.id), area.id];
    void store.moveArea(area.id, identityId, ids);
  };
  return (
    <div className={`cks-trow cks-trow-area${dropBefore ? " is-drop-before" : ""}`} role="row" aria-label={`Area ${area.name}`}>
      <span role="cell">{handle}</span>
      <span role="cell" className="cks-type cks-type-area" title="Area">A</span>
      <input role="cell" aria-label="Area 이름" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
      <input role="cell" aria-label="Area 설명" maxLength={500} placeholder="설명 없음" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      <span role="cell"><span className="cks-swatch cks-swatch-inherited" style={{ background: identity.color }} title={`${identity.name} 대표 색상`} /></span>
      <span role="cell" className="cks-tcount" title="활성 항목 수">{count}</span>
      <span role="cell" className="cks-tactions">
        <select aria-label={`${area.name} 소속 Identity`} value={identity.id} onChange={e => moveTo(e.target.value)}>
          {identities.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <button type="button" className="cks-icon-button" aria-label={`${area.name} Area 삭제`} title={count ? "항목(보관 포함)이 있는 Area는 삭제할 수 없습니다." : "Area 삭제"} onClick={() => void remove()}><Trash2 size={14} /></button>
      </span>
      <span role="cell" className="cks-tsave">
        <SaveState status={autosave.status} error={autosave.error} retry={autosave.retry} invalid={invalid} />
        {deleteError && <span role="alert" className="cks-save cks-save-error">{deleteError}</span>}
      </span>
    </div>
  );
}

function QuickAdd({ label, placeholder, onAdd, onCancel, autoFocus, inputRef }: { label: string; placeholder: string; onAdd: (name: string) => Promise<unknown>; onCancel?: () => void; autoFocus?: boolean; inputRef?: React.Ref<HTMLInputElement> }) {
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
      <input ref={inputRef} autoFocus={autoFocus} aria-label={placeholder} placeholder={placeholder} maxLength={100} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onCancel?.(); }} />
      <button type="submit" className="cks-primary" disabled={state.running || !name.trim()}><Plus size={14} />추가</button>
      {onCancel && <button type="button" className="cks-link" onClick={onCancel}>닫기</button>}
      {state.error && <p role="alert" className="cks-form-error">{state.error}</p>}
    </form>
  );
}
