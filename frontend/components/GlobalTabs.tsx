"use client";
import { createContext, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, HeartPulse, Leaf, ListTodo, NotebookPen, Feather, Pin, Plus, ExternalLink, X } from "lucide-react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { closeTab, closeOtherTabs, closeTabsToRight, duplicateTab, selectTab, toggleTabPin, EMPTY_TABS, personalOsTitle, reorderTabs, restoreTabs, TAB_STORAGE_KEY, tabTarget, visitTab, type GlobalTab, type TabState } from "@/lib/globalTabs";
import { GlobalTabContextMenu, type TabMenuAction, type TabMenuAnchor } from "./GlobalTabContextMenu";

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
const icons = { "WORK OS": BriefcaseBusiness, "NOTE SYS": NotebookPen, "LIFE CODE": Leaf, "DIET SYS": HeartPulse, Calendar: CalendarDays, "WORK FLOW":ListTodo, AUTHORING: Feather, "MONEY SYS": BriefcaseBusiness };
function Tab({ tab, active, select, close, prefetch, openMenu }: { tab: GlobalTab; active: boolean; select: () => void; close: () => void; prefetch: () => void; openMenu: (anchor: TabMenuAnchor) => void }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: tab.tabId });
  const Icon = icons[tab.system];
  return <div ref={setNodeRef} className={`orbit-tab ${active ? "active" : ""}`} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1 }} onContextMenu={event => {
    event.preventDefault();
    const trigger = event.currentTarget.querySelector<HTMLElement>('[role="tab"]')!;
    const box = trigger.getBoundingClientRect();
    openMenu({ tabId: tab.tabId, x: event.clientX || box.left, y: event.clientY || box.bottom, trigger });
  }}>
    <button className="orbit-tab-target" title={`${tab.title} · ${tab.system} (드래그로 순서 변경)`} onMouseEnter={prefetch} onFocus={prefetch} onClick={select} {...attributes} {...listeners} role="tab" aria-selected={active}>
      <Icon size={15}/><span>{tab.title}</span>{tab.pinned && <Pin size={12} aria-label="고정된 탭"/>}
    </button>
    <button className="orbit-tab-close" aria-label={`${tab.title} 탭 닫기`} onClick={close}><X size={13}/></button>
  </div>;
}
export function GlobalTabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname();
  const [state, setState] = useState<TabState>(EMPTY_TABS);
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
  const activeTitle = state.tabs.find(tab => tab.tabId === state.activeTabId)?.title;
  useEffect(() => { document.title = personalOsTitle(pathname === "/login" ? "로그인" : activeTitle); }, [pathname, activeTitle]);
  return <Context.Provider value={context}>
    <Suspense fallback={null}><RouteObserver onRoute={onRoute}/></Suspense>
    <div className={`orbit-app ${visible ? "has-global-tabs" : ""}`}>
      {visible && <div className="orbit-tab-bar">
        <span className="orbit-tab-brand">Personal OS</span>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <SortableContext items={state.tabs.map(tab => tab.tabId)} strategy={horizontalListSortingStrategy}>
            <div className="orbit-tab-list" role="tablist" aria-label="Personal OS 전역 탭">{state.tabs.map(tab => <Tab key={tab.tabId} tab={tab} active={tab.tabId === state.activeTabId} select={() => { if (tab.tabId !== state.activeTabId) mutateTabs(value => selectTab(value, tab.tabId)); }} close={() => close(tab)} prefetch={() => router.prefetch?.(tab.route)} openMenu={anchor => { setMenu(false); setTabMenu(anchor); }}/>)}</div>
          </SortableContext>
        </DndContext>
        <button type="button" className="orbit-tab-close" aria-label="새 창에서 열기" title="Open in new window · 현재 페이지를 독립 창으로 열기" onClick={() => openWindow()}><ExternalLink size={17}/></button>
        <div className="orbit-new-tab" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(false); }}>
          <button aria-label="새 탭으로 열기" title="새 탭으로 열기 · 시스템 메뉴에서 Ctrl/Cmd 클릭도 가능" aria-expanded={menu} onClick={() => setMenu(!menu)}><Plus size={17}/></button>
          {menu && <div className="orbit-new-tab-menu">{[["WORK OS", "/worklog"], ["NOTE SYS", "/notes"], ["DIET SYS", "/diet"], ["LIFE CODE", "/life/categories"], ["Calendar", "/calendar"], ["WORK FLOW", "/workflow/today"], ["AUTHORING", "/authoring"], ["MONEY SYS", "/money"]].map(([label, href]) => <button key={href} onClick={() => navigate(href, { newTab: true })}>{label} 새 탭으로 열기</button>)}</div>}
        </div>
      </div>}
      {visible && tabMenu && state.tabs.some(tab => tab.tabId === tabMenu.tabId) && <GlobalTabContextMenu anchor={tabMenu} pinned={state.tabs.find(tab => tab.tabId === tabMenu.tabId)!.pinned} onAction={menuAction} onClose={dismissTabMenu}/>}
      {error && <div role="alert" className="orbit-tab-error">{error}<button onClick={() => retry.current?.()}>다시 시도</button><button onClick={() => setError("")} aria-label="오류 닫기">×</button></div>}
      {children}
    </div>
  </Context.Provider>;
}
