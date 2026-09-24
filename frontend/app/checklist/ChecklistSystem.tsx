"use client";
import "./checklist.css";
import { forwardRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ChartColumn, Diamond, LayoutGrid, type LucideIcon, type LucideProps } from "lucide-react";
import { SharedSidebar, type NavSection } from "@/components/Sidebar";
import { useGlobalTabs, useShellNavigationGuard } from "@/components/GlobalTabs";
import { orderedAreas } from "@/lib/checklist-sys/model";
import { useChecklistSysStore } from "./store";
import Journal from "./Journal";
import Progress from "./Progress";
import Manage from "./Manage";
import Archived from "./Archived";

const dots = new Map<string, LucideIcon>();
/** Sidebar Identity/Area color cue, shaped like a lucide icon for SharedSidebar. */
function dot(color: string): LucideIcon {
  let icon = dots.get(color);
  if (!icon) {
    const Dot = forwardRef<SVGSVGElement, LucideProps>(function Dot({ size = 20 }, ref) {
      return <svg ref={ref} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5" fill={color} /></svg>;
    });
    icon = Dot as unknown as LucideIcon;
    dots.set(color, icon);
  }
  return icon;
}

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
      { label: "Manage", icon: Diamond, active: path.startsWith("/checklist/manage"), destination: "/checklist/manage", action: () => navigate("/checklist/manage") },
      { label: "보관된 항목", icon: Archive, active: path === "/checklist/archived", destination: "/checklist/archived", action: () => navigate("/checklist/archived") },
    ] },
  ];
  if (catalog.identities.length) {
    groups.push({ section: "IDENTITY", items: [...catalog.identities].sort((a, b) => a.sortOrder - b.sortOrder).map(identity => ({
      label: identity.name, icon: dot(identity.color), active: identity.id === identityId,
      destination: journalBase, action: () => navigate(withScope(journalBase, identity.id === identityId ? null : identity.id, null)),
    })) });
    groups.push({ section: selectedIdentity ? `AREA (${selectedIdentity.name})` : "AREA", items: [
      { label: "전체 보기", icon: dot("#c3c9d2"), active: !areaId, destination: journalBase, action: () => navigate(withScope(journalBase, identityId, null)) },
      ...areas.map(({ area, identity }) => ({
        label: selectedIdentity ? area.name : `${identity.name} · ${area.name}`, icon: dot(area.color), active: area.id === areaId,
        destination: journalBase, action: () => navigate(withScope(journalBase, identity.id, area.id)),
      })),
    ] });
  }

  const scope = { identityId: selectedIdentity?.id ?? null, areaId: catalog.areas.some(a => a.id === areaId) ? areaId : null };
  return (
    <div className="cks-shell">
      <SharedSidebar system="CHECKLIST SYS" groups={groups} beforeNavigate={() => store.mutations.idle()} />
      <main className="cks">
        {store.error && <div role="alert" className="cks-error">{store.error} <button type="button" onClick={() => { store.setError(""); void store.reloadCatalog(); }}>다시 불러오기</button></div>}
        {store.loading ? <p className="cks-loading">CHECKLIST SYS 불러오는 중…</p>
          : path === "/checklist/progress" ? <Progress store={store} scope={scope} onScope={(identity, area) => navigate(withScope("/checklist/progress", identity, area))} />
          : path.startsWith("/checklist/manage") ? <Manage store={store} tab={path === "/checklist/manage/items" ? "items" : "structure"} navigate={navigate} />
          : path === "/checklist/archived" ? <Archived store={store} navigate={navigate} />
          : <Journal store={store} scope={scope} onClearScope={(keepIdentity) => navigate(withScope("/checklist", keepIdentity ? identityId : null, null))} navigate={navigate} />}
      </main>
    </div>
  );
}
