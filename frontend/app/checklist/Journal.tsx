"use client";
import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { ChecklistIcon } from "@/components/checklist-core/icons";
import { ChecklistGrid, type GridGroup } from "@/components/checklist-core/ChecklistGrid";
import { addDays, addMonths, daysBetween, monthEnd, monthLabel, monthStart, seoulToday } from "@/lib/checklist-core/dates";
import { IMPORTANCES, type ChecklistImportance } from "@/lib/checklist-core/types";
import { availabilityOf, journalGroups, orderedAreas, periodsByItem, ALL_IMPORTANCE } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";
import { ItemPanel, type PanelMode } from "./ItemPanel";

type View = "2w" | "month";
type Scope = { identityId: string | null; areaId: string | null };

const short = (date: string | null | undefined) => (date ? date.slice(5).replace("-", ".") : "—");

/**
 * Journal — the primary working surface: record, add, edit (docked right panel),
 * reorder (row handles, same Area only) and reach archived items, all without
 * leaving the date × item grid or losing its date/filter/scroll context.
 */
export default function Journal({ store, scope, onClearScope, navigate, initialArchived = false }: { store: ChecklistSysStore; scope: Scope; onClearScope: (keepIdentity: boolean) => void; navigate: (href: string) => void; initialArchived?: boolean }) {
  const today = seoulToday();
  const [view, setView] = useState<View>("2w");
  const [anchor, setAnchor] = useState(today);
  const [importance, setImportance] = useState<ChecklistImportance[]>(ALL_IMPORTANCE);
  const [filterOpen, setFilterOpen] = useState(false);
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [showArchived, setShowArchived] = useState(initialArchived);
  const { catalog, ensureRange, mutations } = store;

  // 2-week window keeps today near the right edge, like the reference Journal.
  const from = view === "2w" ? addDays(anchor, -9) : monthStart(anchor);
  const to = view === "2w" ? addDays(anchor, 4) : monthEnd(anchor);
  const dates = useMemo(() => daysBetween(from, to).map(date => ({ date })), [from, to]);
  useEffect(() => { void ensureRange(from, to); }, [ensureRange, from, to]);

  const identity = catalog.identities.find(i => i.id === scope.identityId);
  const area = catalog.areas.find(a => a.id === scope.areaId);
  const sections = useMemo(() => journalGroups(catalog, { identityId: scope.identityId, areaId: scope.areaId, importance }), [catalog, scope.identityId, scope.areaId, importance]);
  const groups: GridGroup[] = useMemo(() => sections.map(({ identity: owner, area: section, items }) => ({
    id: section.id,
    label: scope.identityId ? section.name : `${owner.name} / ${section.name}`,
    // Icon color is the owning Identity's representative color — one source of truth.
    rows: items.map(item => ({ id: item.id, label: item.name, icon: item.icon, color: owner.color })),
  })), [sections, scope.identityId]);
  const archived = useMemo(() => orderedAreas(catalog, scope.identityId)
    .filter(({ area }) => !scope.areaId || area.id === scope.areaId)
    .flatMap(({ identity: owner, area: section }) => catalog.items.filter(i => i.areaId === section.id && i.archivedOn).map(item => ({ item, owner, section }))), [catalog, scope.identityId, scope.areaId]);
  const itemById = useMemo(() => new Map(catalog.items.map(i => [i.id, i])), [catalog.items]);
  const periods = useMemo(() => periodsByItem(catalog.archivePeriods), [catalog.archivePeriods]);
  const availability = useMemo(() => (rowId: string, date: string) => availabilityOf(itemById.get(rowId), date, today, periods), [itemById, periods, today]);

  const title = area ? `${identity?.name ?? catalog.identities.find(i => i.id === area.identityId)?.name} / ${area.name}` : identity ? identity.name : "모든 체크리스트";
  const shift = (n: number) => setAnchor(view === "2w" ? addDays(anchor, n * 14) : addMonths(anchor, n));
  const filtered = importance.length !== ALL_IMPORTANCE.length;

  return (
    <>
      <header className="cks-header">
        <div>
          <h1>{title}</h1>
          <p>{identity || area ? "Identity와 Area를 선택하면 같은 Grid가 즉시 필터링됩니다." : "시간대 없이 하루 수행 여부만 빠르게 기록합니다."}</p>
          {(identity || area || filtered) && (
            <div className="cks-chips">
              {identity && <button type="button" className="cks-chip" onClick={() => onClearScope(false)}>Identity · {identity.name} <X size={12} /></button>}
              {area && <button type="button" className="cks-chip cks-chip-area" onClick={() => onClearScope(true)}>Area · {area.name} <X size={12} /></button>}
              {filtered && <button type="button" className="cks-chip cks-chip-muted" onClick={() => setImportance(ALL_IMPORTANCE)}>중요도 · {importance.join(", ") || "없음"} <X size={12} /></button>}
            </div>
          )}
        </div>
        <div className="cks-toolbar">
          <div className="cks-period">
            <button type="button" aria-label="이전 기간" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
            <strong>{monthLabel(view === "2w" ? to : anchor)}</strong>
            <button type="button" aria-label="다음 기간" onClick={() => shift(1)}><ChevronRight size={15} /></button>
          </div>
          <button type="button" className="cks-today" onClick={() => setAnchor(today)}>오늘</button>
          <div className="cks-segment" role="group" aria-label="Journal 기간">
            <button type="button" aria-pressed={view === "2w"} onClick={() => setView("2w")}>2주</button>
            <button type="button" aria-pressed={view === "month"} onClick={() => setView("month")}>월</button>
          </div>
          <button type="button" className="cks-archived-toggle" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}><Archive size={14} />보관 {archived.length}</button>
          <div className="cks-filter">
            <button type="button" aria-expanded={filterOpen} aria-pressed={filtered} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={14} />필터</button>
            {filterOpen && (
              <div className="cks-popover" role="group" aria-label="중요도 필터">
                <p>중요도</p>
                {IMPORTANCES.map(level => (
                  <label key={level}><input type="checkbox" checked={importance.includes(level)} onChange={e => setImportance(e.target.checked ? IMPORTANCES.filter(l => l === level || importance.includes(l)) : importance.filter(l => l !== level))} /><span className={`cks-badge cks-badge-${level.toLowerCase()}`}>{level}</span></label>
                ))}
                <small>중요도는 분류·필터일 뿐 정렬이나 점수에 영향을 주지 않습니다.</small>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`cks-journal${panel ? " has-panel" : ""}`}>
        <div className="cks-journal-main">
          {!catalog.areas.length ? (
            <div className="cks-empty">
              <p>먼저 Identity와 Area를 만들어 주세요.</p>
              <button type="button" className="cks-primary" onClick={() => navigate("/checklist/manage")}>Identity & Area 관리</button>
            </div>
          ) : (
            <ChecklistGrid
              label="체크리스트 Journal"
              groups={groups}
              dates={dates}
              today={today}
              mutations={mutations}
              availability={availability}
              emptyText={filtered ? "필터와 일치하는 항목이 없습니다." : "이 범위에 활성 항목이 없습니다."}
              onRowOpen={itemId => setPanel({ kind: "edit", itemId })}
              activeRowId={panel?.kind === "edit" ? panel.itemId : null}
              onReorder={(areaId, ids) => void store.reorder("items", areaId, ids)}
            />
          )}
          <p className="cks-hint">셀 클릭 = 성공 · 다시 클릭 = 초기화 · 우클릭/1·2·3·0 키 = 상태 선택 · 셀 드래그 = 여러 칸 선택 · 날짜 머리글 = 날짜 전체 기록 못함 · 항목 이름 = 편집 패널 · ⋮⋮ 핸들 = 같은 Area 안 순서 변경</p>
          {catalog.areas.length > 0 && <button type="button" className="cks-add" onClick={() => setPanel({ kind: "create", areaId: scope.areaId ?? catalog.areas.find(a => !scope.identityId || a.identityId === scope.identityId)?.id })}><Plus size={14} />체크리스트 추가</button>}
          {showArchived && (
            <section className="cks-archived" aria-label="보관된 항목">
              <h2><Archive size={14} />보관된 항목 <small>과거 기록은 유지됩니다. 항목을 누르면 패널에서 복원할 수 있습니다.</small></h2>
              {archived.length ? (
                <ul>
                  {archived.map(({ item, owner, section }) => (
                    <li key={item.id}>
                      <button type="button" aria-label={`${item.name} 보관 항목 열기`} aria-pressed={panel?.kind === "edit" && panel.itemId === item.id} onClick={() => setPanel({ kind: "edit", itemId: item.id })}>
                        <span className="cks-cell-icon" style={{ color: owner.color }}><ChecklistIcon name={item.icon} size={15} /></span>
                        <strong>{item.name}</strong>
                        <span className="cks-muted">{owner.name} / {section.name}</span>
                        <span className="cks-muted">마지막 기록 {short(item.lastRecordOn)} · 보관 {short(item.archivedOn)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="cks-muted">이 범위에 보관된 항목이 없습니다.</p>}
            </section>
          )}
        </div>
        {panel && <ItemPanel store={store} mode={panel} onClose={() => setPanel(null)} onCreated={itemId => setPanel({ kind: "edit", itemId })} />}
      </div>
    </>
  );
}
