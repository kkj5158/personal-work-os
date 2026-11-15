"use client";
import { useRef, useState, useEffect, type MouseEvent } from "react";
import { BriefcaseBusiness, BookOpen, GraduationCap, Heart, Wallet, Home, LayoutGrid, PanelsTopLeft, X, Settings2 } from "lucide-react";
import { SPACES, SYSTEMS, routeNavigation, spaceDestination, systemDestination, type SpaceHistory } from "@/lib/spaceNavigation";
import { useGlobalTabs } from "./GlobalTabs";
import { NavigationMenu } from "./NavigationMenu";
import { SystemOrderDialog } from "./SystemSwitcher";
import { useSystemOrder } from "./SystemOrder";

const icons = { work: BriefcaseBusiness, knowledge: BookOpen, growth: GraduationCap, life: Heart, finance: Wallet };
export function SpaceNavigation({ pathname, history, tabsVisible, onToggleTabs }: {
  pathname: string; history: SpaceHistory; tabsVisible: boolean; onToggleTabs: () => void;
}) {
  const shell = useGlobalTabs();
  const current = routeNavigation(pathname);
  const [home, setHome] = useState(false), [settings, setSettings] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const order = useSystemOrder();
  useEffect(() => {
    if (!home) return;
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [home]);
  if (pathname === "/login") return null;
  const go = (href: string, newTab = false) => shell?.navigate(href, { newTab });
  const link = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); setHome(false); go(href, event.ctrlKey || event.metaKey);
  };
  const spaceOptions = SPACES.map(space => ({ id: space.id, label: space.name, href: spaceDestination(history, space.id), active: current?.spaceId === space.id, description: space.description }));
  const systems = SYSTEMS.filter(row => row.spaceId === current?.spaceId);
  return <>
    <header className="pos-space-header" aria-label="POS 탐색">
      <button type="button" className="pos-home" aria-label="POS 전체 홈" onClick={() => setHome(true)}><Home size={17}/><strong>POS</strong></button>
      <span className="pos-head-divider" aria-hidden="true" />
      <span className="pos-space-crumb">{current?.space.name ?? "PERSONAL OS"}</span>
      {current && current.spaceId !== "work" && <><span className="pos-crumb-separator" aria-hidden="true">/</span>
        {systems.length > 1 ? <NavigationMenu label={`${current.space.name} 시스템 전환`} className="pos-system-select" onNavigate={go}
          options={systems.map(system => ({ id: system.id, label: system.displayName, href: systemDestination(history, system.id), active: current.id === system.id }))}>
          <strong>{current.displayName}</strong>
        </NavigationMenu> : <strong className="pos-single-system">{current.displayName}</strong>}
      </>}
      <div className="pos-header-actions">
        {current?.spaceId !== "work" && <button type="button" className="pos-tabs-toggle" aria-label="저장된 전역 탭" aria-expanded={tabsVisible} onClick={onToggleTabs}><PanelsTopLeft size={17}/></button>}
        <NavigationMenu label="Space 전환" className="pos-space-select" options={spaceOptions} onNavigate={go}><LayoutGrid size={16}/><span>Space 전환</span></NavigationMenu>
      </div>
    </header>
    {current?.spaceId === "work" && <nav className="pos-space-rail" aria-label="Space 선택">
      <button type="button" className="pos-rail-home" aria-label="POS 전체 홈" onClick={() => setHome(true)}>P.</button>
      {SPACES.map(space => { const Icon = icons[space.id], href = spaceDestination(history, space.id); return <a key={space.id} href={href} aria-label={space.name} aria-current={current.spaceId === space.id ? "page" : undefined} title={space.name} onClick={event => link(event, href)}><Icon size={20}/><span>{space.shortName}</span></a>; })}
    </nav>}
    {home && <dialog ref={dialog} className="pos-space-home" aria-labelledby="pos-space-home-title" onCancel={() => setHome(false)} onClick={event => { if (event.target === event.currentTarget) setHome(false); }}>
      <div><header><div><small>PERSONAL OS / 5 SPACES</small><h1 id="pos-space-home-title">Space 홈</h1></div><button type="button" aria-label="Space 홈 닫기" onClick={() => setHome(false)}><X size={20}/></button></header>
        <nav aria-label="전체 Space">{SPACES.map(space => { const Icon = icons[space.id], href = spaceDestination(history, space.id); return <a key={space.id} href={href} aria-current={current?.spaceId === space.id ? "page" : undefined} onClick={event => link(event, href)}><Icon size={24}/><strong>{space.name}</strong><span>{space.description}</span></a>; })}</nav>
        {order && <button type="button" className="pos-order-settings" onClick={() => { setHome(false); setSettings(true); }}><Settings2 size={16}/>시스템 순서 설정</button>}
      </div>
    </dialog>}
    {settings && <SystemOrderDialog onClose={() => setSettings(false)}/>}
  </>;
}
