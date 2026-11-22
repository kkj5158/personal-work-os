"use client";
import { systemDisplay } from "@/lib/systemDisplay";
import { useSyncExternalStore, useState, useId, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  ListChecks,
  CalendarCheck2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SystemSwitcher, type SystemName } from "./SystemSwitcher";
import { useGlobalTabs } from "./GlobalTabs";
import { isAuthRequired } from "@/lib/supabase/env";
import { WORK_GROUPS } from "@/lib/spaceNavigation";
import { FolderKanban, ListTodo, ChartGantt, Clock3, CalendarDays, PanelsTopLeft, NotebookPen } from "lucide-react";
export type NavSection = {
  section: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  revealActive?: boolean;
  bottom?: boolean;
  /** Optional custom section body (e.g. a reorderable list) rendered instead of `items`. `done` closes the mobile drawer. */
  content?: (context: { compact: boolean; done: () => void }) => ReactNode;
  items: {
    label: string;
    icon: LucideIcon;
    iconText?: string;
    count?: number;
    active?: boolean;
    action?: () => void;
    destination?: string;
  }[];
};
const subscribeCollapse = (notify: () => void) => {
  window.addEventListener("sidebar-collapse", notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener("sidebar-collapse", notify);
    window.removeEventListener("storage", notify);
  };
};
const readCollapse = () =>
  localStorage.getItem("app.sidebarCollapsed") === "true";
const serverCollapse = () => false;
export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/naver-archive" || pathname === "/study" || pathname.startsWith("/blog") || pathname.startsWith("/notes") || pathname.startsWith("/life") || pathname.startsWith("/diet") || pathname.startsWith("/workflow") || pathname.startsWith("/authoring") || pathname.startsWith("/money") || pathname.startsWith("/checklist") || pathname === "/login") return null;
  return (
    <SharedSidebar
      system="WORK OS"
      groups={[]}
    />
  );
}
export function SharedSidebar({
  system,
  groups: originalGroups,
  beforeLogout,
  beforeNavigate,
  navigate,
}: {
  system: SystemName;
  groups: NavSection[];
  beforeLogout?: () => Promise<void>;
  beforeNavigate?: () => Promise<void>;
  navigate?: (destination: string) => void;
}) {
  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    readCollapse,
    serverCollapse,
  );
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  const shell = useGlobalTabs();
  const router = useRouter();
  const integratedWork = !!shell && ["WORK OS", "WORK FLOW"].includes(system);
  const workIcons = [CalendarDays, FolderKanban, ListTodo, ChartGantt, Clock3, ListChecks, CalendarDays, ListChecks, BriefcaseBusiness, CalendarCheck2, ListChecks, PanelsTopLeft, NotebookPen];
  let iconIndex = 0;
  const groups: NavSection[] = integratedWork ? WORK_GROUPS.map(group => ({
    section: group.section, collapsible: group.section === "ARCHIVED", defaultCollapsed: group.section === "ARCHIVED", revealActive: true,
    items: group.items.map(item => ({ label: item.label, icon: workIcons[iconIndex++], active: pathname === item.href || item.href === "/workflow/today" && pathname === "/workflow", destination: item.href, action: () => shell.navigate(item.href) })),
  })) : originalGroups;
  const [groupState, setGroupState] = useState<{ pathname: string; closedGroups: Record<string, boolean> }>({ pathname, closedGroups: {} });
  let closedGroups = groupState.closedGroups;
  if (groupState.pathname !== pathname) {
    closedGroups = { ...closedGroups };
    for (const group of groups) if (group.revealActive) delete closedGroups[group.section];
    setGroupState({ pathname, closedGroups });
  }
  const groupId = useId();
  const [logoutError, setLogoutError] = useState("");
  function collapse() {
    localStorage.setItem("app.sidebarCollapsed", String(!collapsed));
    window.dispatchEvent(new Event("sidebar-collapse"));
  }
  async function logout() {
    await beforeLogout?.();
    const client = createSupabaseBrowserClient();
    if (!client) return;
    await client.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  function body(compact: boolean, drawer = false) {
    return (
      <>
        <div className="app-sidebar-identity" title={systemDisplay(system)}>
          <SystemSwitcher system={system} compact={compact} beforeNavigate={beforeNavigate} />
          {mobile && (
            <button aria-label="메뉴 닫기" onClick={() => setMobile(false)}>
              <X size={18} />
            </button>
          )}
        </div>
        <nav aria-label={`${integratedWork ? "WORK" : systemDisplay(system)} 메뉴`}>
          {groups.map((group, index) => {
            const hasActiveItem = group.items.some(item => item.active);
            // Reveal an active child on route entry, while still allowing a manual fold.
            const closed = closedGroups[group.section] ?? (group.revealActive && hasActiveItem ? false : group.defaultCollapsed ?? false);
            const items = group.content ? group.content({ compact, done: () => setMobile(false) }) : group.items.map(
                ({ label, icon: Icon, iconText, count, active, action, destination }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={count === undefined ? label : label + " " + count + "건"}
                    aria-current={active ? "page" : undefined}
                    title={
                      compact
                        ? label
                        : !action && !destination
                          ? `${label} · 준비 중`
                          : undefined
                    }
                    disabled={!action && !destination}
                    onClick={(event) => {
                      if (shell && destination && (event.ctrlKey || event.metaKey)) {
                        if (destination.startsWith("/")) shell.navigate(destination, { newTab: true });
                        else if (system === "NOTE SYS") {
                          const current = new URLSearchParams(window.location.search);
                          const query = new URLSearchParams({ module: destination });
                          for (const key of ["workspace", "workspaceName"]) if (current.has(key)) query.set(key, current.get(key)!);
                          shell.navigate(`/notes?${query}`, { newTab: true });
                        }
                      } else if (destination && navigate) navigate(destination);
                      else action?.();
                      setMobile(false);
                    }}
                  >
                    {iconText ? <span aria-hidden="true" style={{ width: 20, flexShrink: 0, textAlign: "center" }}>{iconText}</span> : <Icon size={20} strokeWidth={1.75} />}
                    {!compact && <span>{label}</span>}
                    {!compact && count !== undefined && <small className="money-notice-nav-count">{count}</small>}
                  </button>
                ),
              );
            const id = `${groupId}-${drawer ? "mobile" : "desktop"}-${index}`;
            return <section key={group.section} className={group.bottom ? "app-nav-bottom" : undefined}>
              {!compact && (group.collapsible ? <h2><button
                type="button"
                className="app-nav-group-toggle"
                aria-expanded={!closed}
                aria-controls={id}
                data-active={closed && hasActiveItem ? "true" : undefined}
                onClick={() => setGroupState(value => ({ pathname, closedGroups: { ...value.closedGroups, [group.section]: !closed } }))}
              ><span>{group.section}</span>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button></h2> : !group.bottom && <h2>{group.section}</h2>)}
              {group.collapsible ? <div id={id} hidden={!compact && closed}>{items}</div> : items}
            </section>
          })}
        </nav>
        <div className="app-sidebar-bottom">
          {logoutError && <p role="alert">{logoutError}</p>}
          {isAuthRequired() && (
            <button
              aria-label="로그아웃"
              title={compact ? "로그아웃" : undefined}
              onClick={() => { setLogoutError(""); void logout().catch(e => setLogoutError(e.message)); }}
            >
              <LogOut size={19} />
              {!compact && <span>로그아웃</span>}
            </button>
          )}
          <button
            className="app-collapse"
            aria-label={compact ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!compact}
            title={compact ? "사이드바 펼치기" : undefined}
            onClick={collapse}
          >
            {compact ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span>사이드바 접기</span>
              </>
            )}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <button
        className="app-mobile-menu"
        aria-label="메뉴 열기"
        onClick={() => setMobile(true)}
      >
        <Menu size={20} />
      </button>
      <aside
        className={`app-sidebar ${system === "NOTE SYS" ? "app-note-accent" : system === "LIFE CODE" ? "app-life-accent" : ""} ${collapsed ? "app-collapsed" : ""}`}
      >
        {body(collapsed)}
      </aside>
      {mobile && (
        <div className="app-mobile-overlay">
          <button
            className="app-mobile-backdrop"
            aria-label="메뉴 닫기"
            onClick={() => setMobile(false)}
          />
          <aside
            className={`app-sidebar app-mobile-drawer ${system === "NOTE SYS" ? "app-note-accent" : system === "LIFE CODE" ? "app-life-accent" : ""}`}
          >
            {body(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
