"use client";
import { useState } from "react";
import { Info, Search } from "lucide-react";
import { ChecklistIcon } from "@/components/checklist-core/icons";
import { orderedAreas } from "@/lib/checklist-sys/model";
import type { ChecklistSysStore } from "./store";

const short = (date: string | null | undefined) => (date ? date.slice(5).replace("-", ".") : "—");

/** Delete = archive: hidden from current/future views, history kept, restore continues the same item. */
export default function Archived({ store, navigate }: { store: ChecklistSysStore; navigate: (href: string) => void }) {
  const { catalog } = store;
  const [query, setQuery] = useState("");
  const [identityId, setIdentityId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [restoring, setRestoring] = useState<string | null>(null);
  const areaById = new Map(catalog.areas.map(a => [a.id, a]));
  const identityById = new Map(catalog.identities.map(i => [i.id, i]));
  const items = catalog.items
    .filter(item => item.archivedOn)
    .filter(item => {
      const area = areaById.get(item.areaId);
      return (!identityId || area?.identityId === identityId) && (!areaId || item.areaId === areaId) && (!query.trim() || item.name.includes(query.trim()));
    })
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "ko") : (b.archivedOn ?? "").localeCompare(a.archivedOn ?? "")));

  return (
    <>
      <header className="cks-header">
        <div>
          <h1>보관된 항목</h1>
          <p>보관된 항목은 현재·미래에서 숨기고, 과거 기록은 유지하며 언제든 복원합니다.</p>
        </div>
      </header>
      <div className="cks-banner">
        <Info size={16} />
        <div>
          <strong>보관 = 현재/미래에서 숨김 · 과거 기록 유지 · 복원 시 동일 항목으로 이어서 기록</strong>
          <p>복원하면 기존 Item ID와 과거 History를 그대로 사용하고, 복원한 날짜부터 다시 기록합니다. 보관 기간은 실패로 집계되지 않습니다.</p>
        </div>
      </div>
      <div className="cks-filters cks-card cks-filterbar">
        <label className="cks-search"><Search size={14} /><input type="search" aria-label="보관된 항목 검색" placeholder="보관된 항목 검색…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label><select aria-label="Identity" value={identityId} onChange={e => { setIdentityId(e.target.value); setAreaId(""); }}><option value="">모든 Identity</option>{catalog.identities.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <label><select aria-label="Area" value={areaId} onChange={e => setAreaId(e.target.value)}><option value="">모든 Area</option>{orderedAreas(catalog, identityId || null).map(({ area }) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label><select aria-label="정렬" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="recent">최근 보관순</option><option value="name">이름순</option></select></label>
      </div>
      <section className="cks-card">
        <table className="cks-table">
          <thead><tr><th>항목명</th><th>Identity</th><th>Area</th><th>마지막 기록</th><th>보관일</th><th>작업</th></tr></thead>
          <tbody>
            {items.map(item => {
              const area = areaById.get(item.areaId);
              return (
                <tr key={item.id}>
                  <td><span className="cks-cell-icon"><ChecklistIcon name={item.icon} size={15} /></span>{item.name}</td>
                  <td className="cks-muted">{area ? identityById.get(area.identityId)?.name : ""}</td>
                  <td className="cks-muted">{area?.name}</td>
                  <td className="cks-muted">{short(item.lastRecordOn)}</td>
                  <td className="cks-muted">{short(item.archivedOn)}</td>
                  <td className="cks-actions">
                    <button type="button" className="cks-outline" disabled={restoring === item.id} aria-label={`${item.name} 복원`}
                      onClick={() => { setRestoring(item.id); void store.restoreItem(item).catch(() => {}).finally(() => setRestoring(null)); }}>
                      {restoring === item.id ? "복원 중…" : "복원"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <p className="cks-muted">보관된 항목이 없습니다. 항목을 삭제하면 이곳에 보관됩니다.</p>}
        <p className="cks-hint">보관된 항목의 과거 기록은 <button type="button" className="cks-link" onClick={() => navigate("/checklist/progress")}>Progress</button> 통계에 그대로 남습니다.</p>
      </section>
    </>
  );
}
