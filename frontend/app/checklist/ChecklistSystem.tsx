"use client";
import "./checklist.css";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartColumn, ChevronDown, ChevronRight, Diamond, LayoutGrid } from "lucide-react";
import { SharedSidebar, type NavSection } from "@/components/Sidebar";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { orderedAreas } from "@/lib/checklist-sys/model";
import { useChecklistSysStore } from "./store";
import Journal from "./Journal";
import Progress from "./Progress";
import Classification from "./Classification";
import { IdentityAreaTree } from "./IdentityAreaTree";

export default function ChecklistSystem() {
  const store = useChecklistSysStore();
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const shell = useGlobalTabs();
  const navigate = (href: string) => (shell ? shell.navigate(href) : router.push(href));
  useShellNavigationGuard(proceed => { void store.mutations.idle().then(proceed); });

  const identityId = params.get("identity");
  const areaId = params.get("area");
  const withScope = (href: string, identity: string | null = identityId, area: string | null = areaId) => {
    const query = new URLSearchParams();
    if (identity) query.set("identity", identity);
    if (area) query.set("area", area);
    return `${href}${query.size ? `?${query}` : ""}`;
  };
  const journalBase = path === "/checklist/progress" ? "/checklist/progress" : "/checklist";
  const { catalog } = store;
  const selectedIdentity = catalog.identities.find(i => i.id === identityId) ?? null;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const groups: NavSection[] = [
    { section: "CHECKLIST SYS", items: [
      { label: "Journal", icon: LayoutGrid, active: path === "/checklist", destination: "/checklist", action: () => navigate(withScope("/checklist")) },
      { label: "Progress", icon: ChartColumn, active: path === "/checklist/progress", destination: "/checklist/progress", action: () => navigate(withScope("/checklist/progress")) },
      { label: "Identity & Area", icon: Diamond, active: path.startsWith("/checklist/manage"), destination: "/checklist/manage", action: () => navigate("/checklist/manage") },
    ] },
  ];
  // Sidebar AREA = the global Area directory: every Area, always, grouped under its owning
  // Identity (group header). Selecting an Identity scopes Journal but never hides other groups.
  // Handles reorder Identities, reorder Areas, or drag an Area into another Identity group.
  const navButton = (label: string, color: string, active: boolean, go: () => void, compact: boolean, done: () => void, extra?: ReactNode) => (
    <button type="button" aria-label={label} aria-current={active ? "page" : undefined} title={compact ? label : undefined} onClick={() => { go(); done(); }}>
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" fill={color} /></svg>
      {!compact && <span>{label}</span>}
      {!compact && extra}
    </button>
  );
  const identities = [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder);
  if (identities.length) {
    groups.push({ section: "AREA", items: [], content: ({ compact, done }) => (
      <>
        <div className="cks-navrow cks-navrow-all"><span className="cks-drag-spacer" />{navButton("전체 보기", "#c3c9d2", !identityId && !areaId, () => navigate(withScope(journalBase, null, null)), compact, done)}</div>
        <IdentityAreaTree
          className="cks-navtree"
          disabled={compact}
          identities={identities}
          areasOf={id => orderedAreas(catalog, id).map(({ area }) => area)}
          collapsed={id => collapsed.has(id)}
          onReorderIdentities={ids => void store.reorder("identities", null, ids)}
          onReorderAreas={(id, ids) => void store.reorder("areas", id, ids)}
          onMoveArea={(areaId, id, ids) => void store.moveArea(areaId, id, ids)}
          renderIdentity={(identity, handle) => (
            <div className="cks-navrow cks-navrow-identity">
              {!compact && (handle ?? <span className="cks-drag-spacer" />)}
              {navButton(identity.name, identity.color, identity.id === identityId && !areaId, () => navigate(withScope(journalBase, identity.id, null)), compact, done,
                <small className="cks-navcount">{catalog.areas.filter(a => a.identityId === identity.id).length}</small>)}
              {!compact && <button type="button" className="cks-navfold" aria-label={`${identity.name} ${collapsed.has(identity.id) ? "펼치기" : "접기"}`} aria-expanded={!collapsed.has(identity.id)} onClick={() => toggle(identity.id)}>{collapsed.has(identity.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>}
            </div>
          )}
          renderArea={(area, owner, handle) => (
            <div className="cks-navrow cks-navrow-area">
              {!compact && (handle ?? <span className="cks-drag-spacer" />)}
              {/* Area cue uses the owning Identity's color (single source of truth). */}
              {navButton(area.name, owner.color, area.id === areaId, () => navigate(withScope(journalBase, owner.id, area.id)), compact, done)}
            </div>
          )}
        />
      </>
    ) });
  }

  const scopeIdentity = selectedIdentity?.id ?? null;
  const scopeArea = catalog.areas.some(a => a.id === areaId) ? areaId : null;
  const scope = useMemo(() => ({ identityId: scopeIdentity, areaId: scopeArea }), [scopeIdentity, scopeArea]);
  return (
    <div className="cks-shell">
      <SharedSidebar system="CHECKLIST SYS" groups={groups} beforeNavigate={() => store.mutations.idle()} />
      <main className="cks">
        {store.error && <div role="alert" className="cks-error">{store.error} <button type="button" onClick={() => { store.setError(""); void store.reloadCatalog(); }}>다시 불러오기</button></div>}
        {store.loading ? <p className="cks-loading">CHECKLIST SYS 불러오는 중…</p>
          : path === "/checklist/progress" ? <Progress store={store} scope={scope} onScope={(identity, area) => navigate(withScope("/checklist/progress", identity, area))} />
          : path.startsWith("/checklist/manage") ? <Classification store={store} navigate={navigate} />
          : <Journal store={store} scope={scope} initialArchived={params.get("archived") === "1"} onClearScope={(keepIdentity) => navigate(withScope("/checklist", keepIdentity ? identityId : null, null))} navigate={navigate} />}
      </main>
    </div>
  );
}
