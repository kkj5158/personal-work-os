"use client";
import "./checklist.css";
import { useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChartColumn, Diamond, LayoutGrid } from "lucide-react";
import { SharedSidebar, type NavSection } from "@/components/Sidebar";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { orderedAreas } from "@/lib/checklist-sys/model";
import { useChecklistSysStore } from "./store";
import Journal from "./Journal";
import Progress from "./Progress";
import Classification from "./Classification";
import { Sortable } from "./Sortable";

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
  const areas = useMemo(() => orderedAreas(catalog, selectedIdentity?.id ?? null), [catalog, selectedIdentity]);

  const groups: NavSection[] = [
    { section: "CHECKLIST SYS", items: [
      { label: "Journal", icon: LayoutGrid, active: path === "/checklist", destination: "/checklist", action: () => navigate(withScope("/checklist")) },
      { label: "Progress", icon: ChartColumn, active: path === "/checklist/progress", destination: "/checklist/progress", action: () => navigate(withScope("/checklist/progress")) },
      { label: "Identity & Area", icon: Diamond, active: path.startsWith("/checklist/manage"), destination: "/checklist/manage", action: () => navigate("/checklist/manage") },
    ] },
  ];
  // Sidebar Identity / Area: navigation + direct DnD. Identities reorder among Identities;
  // Areas only among the Areas of their own Identity (one sortable list per Identity).
  const navRow = (key: string, label: string, color: string, active: boolean, go: () => void, compact: boolean, done: () => void, handle: ReactNode) => (
    <div className="cks-navrow" key={key}>
      {!compact && handle}
      <button type="button" aria-label={label} aria-current={active ? "page" : undefined} title={compact ? label : undefined} onClick={() => { go(); done(); }}>
        <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" fill={color} /></svg>
        {!compact && <span>{label}</span>}
      </button>
    </div>
  );
  const identities = [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder);
  if (identities.length) {
    groups.push({ section: "IDENTITY", items: [], content: ({ compact, done }) => (
      <Sortable ids={identities.map(i => i.id)} disabled={compact} onReorder={ids => void store.reorder("identities", null, ids)}>
        {(id, handle) => {
          const identity = identities.find(i => i.id === id)!;
          return navRow(id, identity.name, identity.color, identity.id === identityId, () => navigate(withScope(journalBase, identity.id === identityId ? null : identity.id, null)), compact, done, handle);
        }}
      </Sortable>
    ) });
    const owners = selectedIdentity ? [selectedIdentity] : identities;
    groups.push({ section: selectedIdentity ? `AREA (${selectedIdentity.name})` : "AREA", items: [], content: ({ compact, done }) => (
      <>
        {navRow("all", "전체 보기", "#c3c9d2", !areaId, () => navigate(withScope(journalBase, identityId, null)), compact, done, <span className="cks-drag-spacer" />)}
        {owners.map(owner => {
          const owned = areas.filter(({ identity }) => identity.id === owner.id).map(({ area }) => area);
          return (
            <Sortable key={owner.id} ids={owned.map(a => a.id)} disabled={compact} onReorder={ids => void store.reorder("areas", owner.id, ids)}>
              {(id, handle) => {
                const area = owned.find(a => a.id === id)!;
                // Area cue uses the owning Identity's color (single source of truth).
                return navRow(id, selectedIdentity ? area.name : `${owner.name} · ${area.name}`, owner.color, area.id === areaId, () => navigate(withScope(journalBase, owner.id, area.id)), compact, done, handle);
              }}
            </Sortable>
          );
        })}
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
