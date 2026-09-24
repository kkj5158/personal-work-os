"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Search, X } from "lucide-react";
import { ChecklistIcon } from "@/components/checklist-core/icons";
import { IMPORTANCES, type ChecklistImportance } from "@/lib/checklist-core/types";
import { checklistSysApi, type Area, type Identity, type Item } from "@/lib/checklist-sys/api";
import { IDENTITY_COLORS, orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";
import { ItemDrawer } from "./ItemDrawer";
import { Sortable } from "./Sortable";

type Tab = "structure" | "items";

export default function Manage({ store, tab, navigate }: { store: ChecklistSysStore; tab: Tab; navigate: (href: string) => void }) {
  return (
    <>
      <header className="cks-header">
        <div>
          <h1>{tab === "structure" ? "Identity & Area 관리" : "체크리스트 항목 관리"}</h1>
          <p>{tab === "structure" ? "정체성과 그 아래 Area를 단순하게 생성·정렬·관리합니다." : "모든 항목을 검색·필터·정렬하고 보관할 수 있습니다."}</p>
        </div>
      </header>
      <div className="cks-tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === "structure"} onClick={() => navigate("/checklist/manage")}>Identity & Area</button>
        <button role="tab" type="button" aria-selected={tab === "items"} onClick={() => navigate("/checklist/manage/items")}>체크리스트 항목</button>
        <button role="tab" type="button" aria-selected={false} onClick={() => navigate("/checklist/archived")}>보관된 항목</button>
      </div>
      {tab === "structure" ? <Structure store={store} /> : <Items store={store} />}
    </>
  );
}

function RowMenu({ label, actions }: { label: string; actions: [string, () => void][] }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="cks-rowmenu" ref={host}>
      <button type="button" className="cks-icon-button" aria-label={`${label} 작업`} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={16} /></button>
      {open && <span className="cks-rowmenu-list" role="menu">{actions.map(([name, run]) => <button key={name} role="menuitem" type="button" onClick={() => { setOpen(false); run(); }}>{name}</button>)}</span>}
    </span>
  );
}

type Editing = { kind: "identity"; value: Identity } | { kind: "area"; value: Area };

function Structure({ store }: { store: ChecklistSysStore }) {
  const { catalog } = store;
  const identities = useMemo(() => [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder), [catalog.identities]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = identities.find(i => i.id === selectedId) ?? identities[0];
  const areas = selected ? orderedAreas(catalog, selected.id).map(({ area }) => area) : [];
  const [editing, setEditing] = useState<Editing | null>(null);
  const itemCount = (areaIds: string[]) => catalog.items.filter(i => areaIds.includes(i.areaId) && !i.archivedOn).length;

  const remove = (run: () => Promise<unknown>) => { void store.mutate(run).catch(() => {}); };

  return (
    <div className="cks-structure">
      <section className="cks-card cks-identity-card">
        <div className="cks-card-head">
          <h2>Identity</h2>
          <button type="button" className="cks-primary" onClick={() => setEditing({ kind: "identity", value: { id: crypto.randomUUID(), name: "", description: "", color: IDENTITY_COLORS[identities.length % IDENTITY_COLORS.length], sortOrder: identities.length } })}><Plus size={14} />추가</button>
        </div>
        <Sortable ids={identities.map(i => i.id)} onReorder={ids => void store.mutate(() => checklistSysApi.orderIdentities(ids)).catch(() => {})}>
          {(id, handle) => {
            const identity = identities.find(i => i.id === id)!;
            return (
              <div className={`cks-identity${identity.id === selected?.id ? " is-selected" : ""}`}>
                {handle}
                <button type="button" className="cks-identity-main" onClick={() => setSelectedId(identity.id)}>
                  <span className="cks-dot" style={{ background: identity.color }} />
                  <span><strong>{identity.name}</strong><small>{identity.description || "설명 없음"}</small></span>
                </button>
                <span className="cks-count">{itemCount(catalog.areas.filter(a => a.identityId === identity.id).map(a => a.id))}</span>
                <RowMenu label={identity.name} actions={[["수정", () => setEditing({ kind: "identity", value: identity })], ["삭제", () => remove(() => checklistSysApi.deleteIdentity(identity.id))]]} />
              </div>
            );
          }}
        </Sortable>
        {!identities.length && <p className="cks-muted">예: REN, KAFKA, JISEUNG 처럼 개인 정체성/맥락을 추가하세요.</p>}
      </section>

      <section className="cks-card cks-area-card">
        <div className="cks-card-head">
          <h2>{selected ? `Area (${selected.name})` : "Area"}</h2>
          <button type="button" className="cks-primary" disabled={!selected} onClick={() => selected && setEditing({ kind: "area", value: { id: crypto.randomUUID(), identityId: selected.id, name: "", description: "", color: selected.color, sortOrder: areas.length } })}><Plus size={14} />Area</button>
        </div>
        <table className="cks-table">
          <thead><tr><th aria-label="순서" /><th>#</th><th>Area</th><th>설명</th><th>항목 수</th><th>관리</th></tr></thead>
          <tbody>
            <Sortable as="tr" ids={areas.map(a => a.id)} onReorder={ids => selected && void store.mutate(() => checklistSysApi.orderAreas(selected.id, ids)).catch(() => {})}>
              {(id, handle) => {
                const area = areas.find(a => a.id === id)!;
                return (
                  <>
                    <td className="cks-handle-cell">{handle}</td>
                    <td className="cks-muted">{areas.indexOf(area) + 1}</td>
                    <td><span className="cks-dot" style={{ background: area.color }} /><strong>{area.name}</strong></td>
                    <td className="cks-muted">{area.description}</td>
                    <td><span className="cks-count">{itemCount([area.id])}</span></td>
                    <td className="cks-actions">
                      <button type="button" className="cks-link" onClick={() => setEditing({ kind: "area", value: area })}>수정</button>
                      <RowMenu label={area.name} actions={[["삭제", () => remove(() => checklistSysApi.deleteArea(area.id))]]} />
                    </td>
                  </>
                );
              }}
            </Sortable>
          </tbody>
        </table>
        {selected && !areas.length && <p className="cks-muted">이 Identity 아래 Area를 추가하세요. 예: 가벼움 / 다이어트, Work, Life</p>}
      </section>
      {editing && <StructureEditor store={store} editing={editing} identities={identities} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StructureEditor({ store, editing, identities, onClose }: { store: ChecklistSysStore; editing: Editing; identities: Identity[]; onClose: () => void }) {
  const [draft, setDraft] = useState(editing.value);
  const [error, setError] = useState("");
  const isNew = editing.kind === "identity" ? !store.catalog.identities.some(i => i.id === draft.id) : !store.catalog.areas.some(a => a.id === draft.id);
  const noun = editing.kind === "identity" ? "Identity" : "Area";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await store.mutate(() => editing.kind === "identity" ? checklistSysApi.saveIdentity(draft as Identity) : checklistSysApi.saveArea(draft as Area));
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
  }
  return (
    <div className="cks-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="cks-modal" role="dialog" aria-modal="true" aria-label={`${noun} ${isNew ? "추가" : "수정"}`} onSubmit={submit}>
        <header><h2>{noun} {isNew ? "추가" : "수정"}</h2><button type="button" className="cks-icon-button" aria-label="닫기" onClick={onClose}><X size={16} /></button></header>
        <label className="cks-field">이름<input required autoFocus maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="cks-field">설명<input maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        {editing.kind === "area" && (
          <label className="cks-field">Identity<select value={(draft as Area).identityId} onChange={e => setDraft({ ...(draft as Area), identityId: e.target.value })}>{identities.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        )}
        <div className="cks-field"><span>색상</span><div className="cks-colors">{IDENTITY_COLORS.map(color => <button key={color} type="button" aria-label={`색상 ${color}`} aria-pressed={draft.color === color} style={{ background: color }} onClick={() => setDraft({ ...draft, color })} />)}</div></div>
        {error && <p role="alert" className="cks-form-error">{error}</p>}
        <footer><button type="button" onClick={onClose}>취소</button><button type="submit" className="cks-primary" disabled={store.busy}>저장</button></footer>
      </form>
    </div>
  );
}

function Items({ store }: { store: ChecklistSysStore }) {
  const { catalog } = store;
  const [identityId, setIdentityId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [importance, setImportance] = useState<ChecklistImportance | "">("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const areaById = new Map(catalog.areas.map(a => [a.id, a]));
  const identityById = new Map(catalog.identities.map(i => [i.id, i]));
  const areaOptions = orderedAreas(catalog, identityId || null);
  // Display order follows Identity → Area → explicit sort order; importance never reorders.
  const ordered = orderedAreas(catalog).flatMap(({ area }) => catalog.items.filter(i => i.areaId === area.id).sort((a, b) => a.sortOrder - b.sortOrder));
  const items = ordered.filter(item => {
    const area = areaById.get(item.areaId);
    return (!identityId || area?.identityId === identityId) && (!areaId || item.areaId === areaId) && (!importance || item.importance === importance)
      && (status === "all" || (status === "active" ? !item.archivedOn : !!item.archivedOn)) && (!query.trim() || item.name.includes(query.trim()));
  });
  const canReorder = !!areaId && !importance && status === "active" && !query.trim();

  const row = (item: Item, handle: React.ReactNode) => {
    const area = areaById.get(item.areaId);
    return (
      <>
        <td className="cks-handle-cell">{handle}</td>
        <td><span className="cks-cell-icon"><ChecklistIcon name={item.icon} size={15} /></span>{item.name}</td>
        <td className="cks-muted">{area ? identityById.get(area.identityId)?.name : ""}</td>
        <td className="cks-muted">{area?.name}</td>
        <td><span className={`cks-badge cks-badge-${item.importance.toLowerCase()}`}>{item.importance}</span></td>
        <td>{item.archivedOn ? <span className="cks-badge cks-badge-archived">보관</span> : <span className="cks-badge cks-badge-active">활성</span>}</td>
        <td className="cks-muted">{item.startDate.slice(5).replace("-", ".")}</td>
        <td className="cks-actions"><RowMenu label={item.name} actions={[["수정", () => setEditing(item)], item.archivedOn ? ["복원", () => void store.restoreItem(item).catch(() => {})] : ["보관 (삭제)", () => void store.archiveItem(item).catch(() => {})]]} /></td>
      </>
    );
  };

  return (
    <>
      <div className="cks-filters cks-card cks-filterbar">
        <label>Identity<select value={identityId} onChange={e => { setIdentityId(e.target.value); setAreaId(""); }}><option value="">전체</option>{[...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <label>Area<select value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">전체</option>{areaOptions.map(({ area, identity }) => <option key={area.id} value={area.id}>{identityId ? area.name : `${identity.name} · ${area.name}`}</option>)}</select></label>
        <label>중요도<select value={importance} onChange={e => setImportance(e.target.value as ChecklistImportance | "")}><option value="">전체</option>{IMPORTANCES.map(l => <option key={l}>{l}</option>)}</select></label>
        <label>상태<select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="active">활성</option><option value="archived">보관</option><option value="all">전체</option></select></label>
        <label className="cks-search"><Search size={14} /><input type="search" aria-label="항목 이름 검색" placeholder="항목 이름 검색…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <button type="button" className="cks-primary cks-wide" disabled={!catalog.areas.length} onClick={() => setEditing("new")}><Plus size={14} />항목 추가</button>
      </div>
      <section className="cks-card">
        <table className="cks-table">
          <thead><tr><th aria-label="순서" /><th>항목</th><th>Identity</th><th>Area</th><th>중요도</th><th>상태</th><th>시작일</th><th>작업</th></tr></thead>
          <tbody>
            {canReorder
              ? <Sortable as="tr" ids={items.map(i => i.id)} onReorder={ids => void store.reorderItems(areaId, ids)}>{(id, handle) => row(items.find(i => i.id === id)!, handle)}</Sortable>
              : items.map(item => <tr key={item.id}>{row(item, null)}</tr>)}
          </tbody>
        </table>
        {!items.length && <p className="cks-muted">표시할 항목이 없습니다.</p>}
        <p className="cks-hint">{canReorder ? "핸들을 드래그해 이 Area 안의 순서를 바꿉니다." : "순서를 바꾸려면 Area 하나를 선택하세요 (활성 · 필터 없음). 순서는 Area 안에서만 적용되며 중요도와 무관합니다."}</p>
      </section>
      {editing && <ItemDrawer store={store} item={editing === "new" ? undefined : editing} initialAreaId={areaId || undefined} onClose={() => setEditing(null)} />}
    </>
  );
}
