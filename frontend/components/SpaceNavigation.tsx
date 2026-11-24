"use client";
import { useRef, useState, useEffect, type MouseEvent } from "react";
import { BriefcaseBusiness, BookOpen, GraduationCap, Heart, Wallet, Utensils, Home, LayoutGrid, PanelsTopLeft, X, Settings2 } from "lucide-react";
import { INITIAL_SPACE_DEFAULTS, SPACES, SYSTEMS, resolveSpaceEntry, routeNavigation, systemDestination, type SpaceDefaults, type SpaceHistory } from "@/lib/spaceNavigation";
import type { TabSystem } from "@/lib/globalTabs";
import { useGlobalTabs } from "./GlobalTabs";
import { NavigationMenu } from "./NavigationMenu";
import { useSpaceDefaults } from "./SpaceDefaults";

export const spaceIcons = { work: BriefcaseBusiness, knowledge: BookOpen, growth: GraduationCap, life: Heart, finance: Wallet, diet: Utensils };

function SpaceDefaultsSettings({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const preferences = useSpaceDefaults();
  const [changes, setChanges] = useState<Partial<SpaceDefaults>>({});
  const draft = { ...preferences.defaults, ...changes };
  const changed = SPACES.some(space => draft[space.id] !== preferences.defaults[space.id]);
  const { saveStatus, loadFailed, loading, canSave } = preferences;
  const saving = saveStatus === "saving", conflict = saveStatus === "conflict";
  const failed = saveStatus === "failed" && changed;
  const message = loading ? "기본 Space 설정을 불러오는 중입니다."
    : loadFailed ? "기본 Space 설정을 불러오지 못했습니다."
    : saving ? "저장 중입니다."
    : conflict ? "다른 세션에서 설정이 변경되었습니다. 최신 설정을 불러온 후 다시 저장하세요."
    : failed ? "설정을 저장하지 못했습니다. 다시 시도하세요."
    : changed ? "저장하지 않은 변경사항이 있습니다."
    : saveStatus === "saved" ? "기본 Space 설정을 저장했습니다." : "";

  return <div className="pos-space-defaults-content">
    <header>
      <div><h1 id="pos-space-defaults-title">기본 Space 설정</h1><p>각 Space에 진입했을 때 처음 열릴 <strong>기본 시스템</strong>을 지정합니다.</p></div>
      <button type="button" aria-label="기본 Space 설정 닫기" data-dialog-focus onClick={onClose}><X size={20}/></button>
    </header>
    <div className="pos-space-defaults-list">
      {SPACES.map(space => {
        const Icon = spaceIcons[space.id];
        const candidates = SYSTEMS.filter(system => system.spaceId === space.id);
        return <label key={space.id}>
          <span><Icon size={17} aria-hidden="true"/>{space.name}</span>
          <select aria-label={`${space.name} 기본 시스템`} value={draft[space.id]} disabled={candidates.length === 1 || !canSave || saving}
            onChange={event => {
              const system = event.currentTarget.value as TabSystem;
              setChanges(previous => {
                const next = { ...previous };
                if (system === preferences.defaults[space.id]) delete next[space.id];
                else next[space.id] = system;
                return next;
              });
            }}>
            {candidates.map(system => <option key={system.id} value={system.id}>
              {candidates.filter(candidate => candidate.displayName === system.displayName).length > 1 ? system.id : system.displayName}
            </option>)}
          </select>
        </label>;
      })}
    </div>
    <div className="pos-space-defaults-actions">
      <p>FINANCE는 MONEY SYS, DIET는 DIET SYS로 고정됩니다.</p>
      <button type="button" disabled={!canSave || saving} onClick={() => setChanges(INITIAL_SPACE_DEFAULTS)}>기본값으로 초기화</button>
      <button type="button" className="pos-space-defaults-save" disabled={!canSave || saving || !changed} onClick={async () => {
        if (await preferences.save(draft)) setChanges({});
      }}>{failed ? "저장 다시 시도" : "설정 저장"}</button>
    </div>
    <footer>
      <button type="button" onClick={onBack}>← Space 홈으로 돌아가기</button>
      <div>
        <span role={loadFailed || failed || conflict ? "alert" : "status"}>{message}</span>
        {(loadFailed || conflict) && <button type="button" onClick={preferences.reload}>{conflict ? "최신 설정 불러오기" : "다시 불러오기"}</button>}
      </div>
    </footer>
  </div>;
}

export function SpaceNavigation({ pathname, history, tabsVisible, onToggleTabs }: {
  pathname: string; history: SpaceHistory; tabsVisible: boolean; onToggleTabs: () => void;
}) {
  const shell = useGlobalTabs();
  const current = routeNavigation(pathname);
  const [view, setView] = useState<"home" | "settings" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const preferences = useSpaceDefaults();
  const dialogOpen = view !== null && pathname !== "/login";
  const returnToSettings = useRef(false);
  useEffect(() => {
    if (!dialogOpen) return;
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [dialogOpen]);
  useEffect(() => {
    if (view === "settings" || returnToSettings.current) {
      dialog.current?.querySelector<HTMLElement>(view === "settings" ? "[data-dialog-focus]" : ".pos-default-settings")?.focus();
      returnToSettings.current = false;
    }
  }, [view]);
  if (pathname === "/login") return null;
  const close = () => setView(null);
  const go = (href: string, newTab = false) => shell?.navigate(href, { newTab });
  const link = (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
    if (event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (!href) return;
    close(); go(href, event.ctrlKey || event.metaKey);
  };
  const spaceOptions = SPACES.map(space => {
    const href = preferences.entryPending ? undefined : resolveSpaceEntry(history, space.id, preferences.defaults);
    return { ...space, label: space.name, href, active: current?.spaceId === space.id,
      navigateWhenActive: !!href && routeNavigation(href)?.id !== current?.id };
  });
  const systems = SYSTEMS.filter(row => row.spaceId === current?.spaceId);
  return <>
    <header className="pos-space-header" aria-label="POS 탐색">
      <button type="button" className="pos-home" aria-label="POS 전체 홈" onClick={() => setView("home")}><Home size={17}/><strong>POS</strong></button>
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
      <button type="button" className="pos-rail-home" aria-label="POS 전체 홈" onClick={() => setView("home")}>P.</button>
      {spaceOptions.map(space => { const Icon = spaceIcons[space.id]; return <a key={space.id} href={space.href} aria-disabled={!space.href || undefined} aria-label={space.name} aria-current={space.active ? "page" : undefined} title={space.name} onClick={event => link(event, space.href)}><Icon size={20}/><span>{space.shortName}</span></a>; })}
    </nav>}
    {dialogOpen && <dialog ref={dialog} className={`pos-space-home${view === "settings" ? " pos-space-defaults" : ""}`} aria-labelledby={view === "settings" ? "pos-space-defaults-title" : "pos-space-home-title"} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {view === "settings" ? <SpaceDefaultsSettings key={preferences.scope} onClose={close} onBack={() => { returnToSettings.current = true; setView("home"); }}/>
        : <div><header><div><small>PERSONAL OS / {SPACES.length} SPACES</small><h1 id="pos-space-home-title">Space 홈</h1></div><button type="button" aria-label="Space 홈 닫기" onClick={close}><X size={20}/></button></header>
          <nav aria-label="전체 Space">{spaceOptions.map(space => { const Icon = spaceIcons[space.id]; return <a key={space.id} href={space.href} aria-disabled={!space.href || undefined} aria-current={space.active ? "page" : undefined} onClick={event => link(event, space.href)}><Icon size={24}/><strong>{space.name}</strong><span>{space.description}</span></a>; })}</nav>
          <footer className="pos-space-home-footer">
            <button type="button" className="pos-default-settings" onClick={() => setView("settings")}><Settings2 size={16}/>기본 Space 설정</button>
            <span role="status">{preferences.entryPending ? "기본 Space 설정을 불러오는 중입니다." : "카드를 선택하면 해당 Space의 기본 시스템으로 이동합니다."}</span>
          </footer>
        </div>}
    </dialog>}
  </>;
}
