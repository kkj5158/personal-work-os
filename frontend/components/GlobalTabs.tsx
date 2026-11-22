"use client";
import { systemDisplay } from "@/lib/systemDisplay";
import { createContext, Suspense, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, HeartPulse, Leaf, ListTodo, NotebookPen, Feather, SquareCheckBig, BookOpen, Pin, Plus, ExternalLink, X } from "lucide-react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { closeTab, closeOtherTabs, closeTabsToRight, duplicateTab, selectTab, toggleTabPin, EMPTY_TABS, personalOsTitle, reorderTabs, restoreTabs, TAB_STORAGE_KEY, tabTarget, visitTab, type GlobalTab, type TabState } from "@/lib/globalTabs";
import { GlobalTabContextMenu, type TabMenuAction, type TabMenuAnchor } from "./GlobalTabContextMenu";
import { SpaceNavigation, spaceIcons } from "./SpaceNavigation";
import { useSpaceDefaults } from "./SpaceDefaults";
import { emptySpaceHistory, rememberSpace, resolveSpaceEntry, restoreSpaceHistory, routeNavigation, SPACES, SPACE_STORAGE_KEY, type SpaceHistory } from "@/lib/spaceNavigation";

type LeaveGuard = (proceed: () => void) => void | Promise<void>;
type TabsContext = {
  navigate: (href: string, options?: { newTab?: boolean; title?: string }) => void;
  setTitle: (title: string) => void;
  registerGuard: (guard: LeaveGuard) => () => void;
};
const Context = createContext<TabsContext | null>(null);
export const useGlobalTabs = () => useContext(Context);
/** Register the domain's existing leave operation, including its save/discard UI. */
export function useShellNavigationGuard(guard: LeaveGuard) {
  const shell = useGlobalTabs();
  const latest = useRef(guard);
  useLayoutEffect(() => { latest.current = guard; }, [guard]);
  const register = shell?.registerGuard;
  useEffect(() => register?.(proceed => latest.current(proceed)), [register]);
}
function RouteObserver({ onRoute }: { onRoute: (route: string) => void }) {
  const pathname = usePathname(), params = useSearchParams();
  const route = `${pathname}${params.size ? `?${params}` : ""}`;
  useEffect(() => onRoute(route), [onRoute, route]);
  return null;
}
const icons = { "NAVER ARCHIVE": BookOpen, BLOG: BookOpen, STUDY: BookOpen, "WORK OS": BriefcaseBusiness, "NOTE SYS": NotebookPen, "LIFE CODE": Leaf, "DIET SYS": HeartPulse, Calendar: CalendarDays, "WORK FLOW":ListTodo, AUTHORING: Feather, "MONEY SYS": BriefcaseBusiness, "CHECKLIST SYS": SquareCheckBig };

function NewSpaceTabMenu({ history, open, setOpen, onOpen }: {
  history: SpaceHistory; open: boolean; setOpen: (open: boolean) => void; onOpen: (href: string) => void;
}) {
  const preferences = useSpaceDefaults();
  const host = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const last = useRef(false), id = useId();
  const items = () => Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (!open) return;
    const align = () => {
      if (popup.current && trigger.current) {
        popup.current.dataset.align = trigger.current.getBoundingClientRect().left + popup.current.offsetWidth + 8 > document.documentElement.clientWidth ? "right" : "left";
      }
    };
    align();
    const options = items();
    (last.current ? options.at(-1) : options[0])?.focus();
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", align);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", align);
    };
  }, [open, setOpen]);
  const close = () => { trigger.current?.focus(); setOpen(false); };

  return <div ref={host} className="orbit-new-tab" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" aria-label="새 탭으로 열기" title="새 탭으로 열기" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { last.current = false; setOpen(!open); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); last.current = event.key === "ArrowUp";
          if (open) (last.current ? items().at(-1) : items()[0])?.focus();
          else setOpen(true);
        }
      }}><Plus size={17}/></button>
    {open && <div ref={popup} id={id} className="orbit-new-tab-menu" role="menu" aria-label="새 탭으로 열기" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const options = items(), index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    }}>
      {SPACES.map(space => {
        const Icon = spaceIcons[space.id];
        return <button key={space.id} type="button" role="menuitem" tabIndex={-1} aria-disabled={preferences.entryPending || undefined} onClick={() => {
          if (preferences.entryPending) return;
          close(); onOpen(resolveSpaceEntry(history, space.id, preferences.defaults));
        }}><Icon size={16} aria-hidden="true"/>{space.name} 새 탭으로 열기</button>;
      })}
    </div>}
  </div>;
}

function Tab({ tab, active, select, close, prefetch, openMenu }: { tab: GlobalTab; active: boolean; select: () => void; close: () => void; prefetch: () => void; openMenu: (anchor: TabMenuAnchor) => void }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: tab.tabId });
  const Icon = icons[tab.system];
  return <div ref={setNodeRef} className={`orbit-tab ${active ? "active" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1 }} onContextMenu={event => {
    event.preventDefault();
    const trigger = event.currentTarget.querySelector<HTMLElement>('[role="tab"]')!;
    const box = trigger.getBoundingClientRect();
    openMenu({ tabId: tab.tabId, x: event.clientX || box.left, y: event.clientY || box.bottom, trigger });
  }}>
    <button className="orbit-tab-target" title={`${tab.title} · ${systemDisplay(tab.system)} (드래그로 순서 변경)`} onMouseEnter={prefetch} onFocus={prefetch} onClick={select} {...attributes} {...listeners} role="tab" aria-selected={active}>
      <Icon size={15}/><span>{tab.title}</span>{tab.pinned && <Pin size={12} aria-label="고정된 탭"/>}
    </button>
    <button className="orbit-tab-close" aria-label={`${tab.title} 탭 닫기`} onClick={close}><X size={13}/></button>
  </div>;
}
export function GlobalTabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const [state, setState] = useState<TabState>(EMPTY_TABS);
  const [history, setHistory] = useState(emptySpaceHistory);
  const historyCurrent = useRef(emptySpaceHistory());
  const [showSavedTabs, setShowSavedTabs] = useState(false);
  const historyInitialized = useRef(false);
  const [menu, setMenu] = useState(false), [error, setError] = useState("");
  const [tabMenu, setTabMenu] = useState<TabMenuAnchor | null>(null);
  const dismissTabMenu = useCallback(() => setTabMenu(null), []);
  const current = useRef(EMPTY_TABS), initialized = useRef(false), pending = useRef<string | null>(null), guards = useRef<LeaveGuard[]>([]);
  const retry = useRef<(() => void) | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const commit = useCallback((value: TabState) => {
    current.current = value; setState(value);
    try { window.sessionStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(value)); } catch { /* Tabs still work when browser storage is unavailable. */ }
  }, []);
  const onRoute = useCallback((route: string) => {
    // Remember observed routes only: a blocked/cancelled leave must never update recent pages.
    let previous = historyCurrent.current;
    if (!historyInitialized.current) {
      historyInitialized.current = true;
      try { previous = restoreSpaceHistory(window.sessionStorage.getItem(SPACE_STORAGE_KEY)); } catch { /* Storage is optional. */ }
    }
    const nextHistory = rememberSpace(previous, route);
    historyCurrent.current = nextHistory;
    setHistory(nextHistory);
    try { window.sessionStorage.setItem(SPACE_STORAGE_KEY, JSON.stringify(nextHistory)); } catch { /* Storage is optional. */ }
    const target = tabTarget(route);
    if (!target) return;
    if (!initialized.current) {
      initialized.current = true;
      let saved = EMPTY_TABS;
      try { saved = restoreTabs(window.sessionStorage.getItem(TAB_STORAGE_KEY) ?? localStorage.getItem(TAB_STORAGE_KEY)); } catch { /* Private storage may be disabled. */ }
      // The URL is authoritative for a deep link; refresh restores its existing tab.
      commit(visitTab(saved, target.route, true));
      return;
    }
    if (pending.current && pending.current !== target.route) return;
    pending.current = null;
    commit(visitTab(current.current, target.route));
  }, [commit]);
  const registerGuard = useCallback((next: LeaveGuard) => {
    guards.current.push(next);
    return () => { guards.current=guards.current.filter(item=>item!==next); };
  }, []);
  const leave = useCallback((proceed: () => void) => {
    const run = () => {
    setError("");
    try {
      const guard=guards.current.at(-1);
      const result = guard ? guard(proceed) : proceed();
      if (result) void result.catch(e => setError(e instanceof Error ? e.message : "저장 후 다시 시도하세요."));
    } catch (e) { setError(e instanceof Error ? e.message : "저장 후 다시 시도하세요."); }
    };
    retry.current = run;
    run();
  }, []);
  const navigate = useCallback((href: string, options?: { newTab?: boolean; title?: string }) => {
    const target = tabTarget(href);
    if (!target) return;
    leave(() => {
      const value = visitTab(current.current, target.route, options?.newTab, options?.title);
      pending.current = target.route; commit(value); setMenu(false); setTabMenu(null);
      router.push(target.route, { scroll: false });
    });
  }, [commit, leave, router]);
  const setTitle = useCallback((title: string) => {
    const target = tabTarget(`${window.location.pathname}${window.location.search}`);
    if (!target) return;
    const value = current.current;
    const tab = value.tabs.find(row => row.tabId === value.activeTabId && row.contextKey === target.contextKey);
    if (!tab || tab.title === title.slice(0, 160)) return;
    commit({ ...value, tabs: value.tabs.map(row => row === tab ? { ...row, title: title.slice(0, 160) } : row) });
  }, [commit]);
  const mutateTabs = (change: (value: TabState) => TabState) => {
    const proceed = () => {
      const previous = current.current;
      let value = change(previous);
      if (!value.tabs.length) value = visitTab(value, "/worklog", true);
      const next = value.tabs.find(row => row.tabId === value.activeTabId)!;
      commit(value); setTabMenu(null);
      if (value.activeTabId !== previous.activeTabId) {
        pending.current = next.route; router.push(next.route, { scroll: false });
      }
    };
    // Bulk actions and duplicate obey the same save/discard continuation as
    // left-click switching. No state changes until the active editor permits it.
    if (change(current.current).activeTabId !== current.current.activeTabId) leave(proceed);
    else proceed();
  };
  const close = (tab: GlobalTab) => mutateTabs(value => closeTab(value, tab.tabId));
  const openWindow = (href = `${window.location.pathname}${window.location.search}${window.location.hash}`) => {
    const target = tabTarget(href);
    if (!target) return;
    window.open(target.route, "_blank", "popup=yes,noopener,noreferrer,width=1280,height=900");
    setMenu(false); setTabMenu(null);
  };
  const menuAction = (action: TabMenuAction) => {
    if (!tabMenu) return;
    if (action === "newWindow") {
      const tab = current.current.tabs.find(row => row.tabId === tabMenu.tabId);
      if (tab) openWindow(tab.route);
      return;
    }
    const actions = { close: closeTab, closeOthers: closeOtherTabs, closeRight: closeTabsToRight, pin: toggleTabPin, duplicate: duplicateTab };
    mutateTabs(value => actions[action](value, tabMenu.tabId));
  };
  const reorder = ({ active, over }: DragEndEvent) => { if (over) commit(reorderTabs(current.current, String(active.id), String(over.id))); };
  const context = useMemo(() => ({ navigate, registerGuard, setTitle }), [navigate, registerGuard, setTitle]);
  const visible = pathname !== "/login";
  const space = routeNavigation(pathname)?.spaceId;
  const tabsVisible = space === "work" || showSavedTabs;
  const activeTitle = state.tabs.find(tab => tab.tabId === state.activeTabId)?.title;
  useEffect(() => { document.title = personalOsTitle(pathname === "/login" ? "로그인" : activeTitle); }, [pathname, activeTitle]);
  return <Context.Provider value={context}>
    <Suspense fallback={null}><RouteObserver onRoute={onRoute}/></Suspense>
    <div className={`orbit-app ${visible ? "has-space-navigation" : ""} ${visible && tabsVisible ? "has-global-tabs" : ""} ${visible && space === "work" ? "pos-work-space" : "pos-focused-space"}`}>
      {visible && <SpaceNavigation pathname={pathname} history={history} tabsVisible={tabsVisible} onToggleTabs={() => setShowSavedTabs(value => !value)}/>}
      {visible && <div className="orbit-tab-bar" hidden={!tabsVisible}>
        <span className="orbit-tab-brand">Personal OS</span>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <SortableContext items={state.tabs.map(tab => tab.tabId)} strategy={horizontalListSortingStrategy}>
            <div className="orbit-tab-list" role="tablist" aria-label="Personal OS 전역 탭">{state.tabs.map(tab => <Tab key={tab.tabId} tab={tab} active={tab.tabId === state.activeTabId} select={() => { if (tab.tabId !== state.activeTabId) mutateTabs(value => selectTab(value, tab.tabId)); }} close={() => close(tab)} prefetch={() => router.prefetch?.(tab.route)} openMenu={anchor => { setMenu(false); setTabMenu(anchor); }}/>)}</div>
          </SortableContext>
        </DndContext>
        <button type="button" className="orbit-tab-close" aria-label="새 창에서 열기" title="Open in new window · 현재 페이지를 독립 창으로 열기" onClick={() => openWindow()}><ExternalLink size={17}/></button>
        <NewSpaceTabMenu history={history} open={menu && tabsVisible} setOpen={setMenu} onOpen={href => navigate(href, { newTab: true })}/>
        <button type="button" className={`orbit-blog-entry ${pathname === "/blog" ? "active" : ""}`} onClick={() => navigate("/blog", { newTab: true })} aria-label="Blog · LOG 열기"><BookOpen size={15}/> Blog</button>
      </div>}
      {visible && tabMenu && state.tabs.some(tab => tab.tabId === tabMenu.tabId) && <GlobalTabContextMenu anchor={tabMenu} pinned={state.tabs.find(tab => tab.tabId === tabMenu.tabId)!.pinned} onAction={menuAction} onClose={dismissTabMenu}/>}
      {error && <div role="alert" className="orbit-tab-error">{error}<button onClick={() => retry.current?.()}>다시 시도</button><button onClick={() => setError("")} aria-label="오류 닫기">×</button></div>}
      {children}
    </div>
  </Context.Provider>;
}
