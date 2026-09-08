"use client";
import { useSyncExternalStore, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  CirclePlay,
  NotebookPen,
  BriefcaseBusiness,
  ListChecks,
  CalendarCheck2,
  ChartColumnBig,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SystemSwitcher } from "./SystemSwitcher";
import { isAuthRequired } from "@/lib/supabase/env";
export type NavSection = {
  section: string;
  items: {
    label: string;
    icon: LucideIcon;
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
const workGroups = [
  {
    section: "OVERVIEW",
    items: [{ label: "대시보드", href: null, icon: LayoutDashboard }],
  },
  {
    section: "WORKFLOW",
    items: [
      { label: "계획", href: "/planning", icon: CalendarRange },
      { label: "실행", href: null, icon: CirclePlay },
      { label: "회고", href: null, icon: NotebookPen },
    ],
  },
  {
    section: "WORK",
    items: [
      { label: "근무 기록", href: "/worklog", icon: BriefcaseBusiness },
      { label: "체크리스트", href: "/worklog/checklist", icon: ListChecks },
      { label: "출결 관리", href: "/worklog/attendance", icon: CalendarCheck2 },
    ],
  },
  {
    section: "ANALYTICS",
    items: [{ label: "근무 현황", href: null, icon: ChartColumnBig }],
  },
  { section: "SYSTEM", items: [{ label: "설정", href: null, icon: Settings }] },
];
export function Sidebar() {
  const pathname = usePathname(),
    router = useRouter();
  if (pathname.startsWith("/notes") || pathname === "/login") return null;
  return (
    <SharedSidebar
      system="WORK OS"
      groups={workGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          active: pathname === item.href,
          action: item.href ? () => router.push(item.href!) : undefined,
        })),
      }))}
    />
  );
}
export function SharedSidebar({
  system,
  groups,
  beforeLogout,
  beforeNavigate,
  navigate,
}: {
  system: "WORK OS" | "NOTE SYS";
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
  const router = useRouter();
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
  function body(compact: boolean) {
    return (
      <>
        <div className="app-sidebar-identity" title={system}>
          <SystemSwitcher system={system} compact={compact} beforeNavigate={beforeNavigate} />
          {mobile && (
            <button aria-label="메뉴 닫기" onClick={() => setMobile(false)}>
              <X size={18} />
            </button>
          )}
        </div>
        <nav aria-label={`${system} 메뉴`}>
          {groups.map((group) => (
            <section key={group.section}>
              {!compact && <h2>{group.section}</h2>}
              {group.items.map(
                ({ label, icon: Icon, active, action, destination }) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    title={
                      compact
                        ? label
                        : !action && !destination
                          ? `${label} · 준비 중`
                          : undefined
                    }
                    disabled={!action && !destination}
                    onClick={() => {
                      if (destination) navigate?.(destination);
                      else action?.();
                      setMobile(false);
                    }}
                  >
                    <Icon size={20} strokeWidth={1.75} />
                    {!compact && <span>{label}</span>}
                  </button>
                ),
              )}
            </section>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          {isAuthRequired() && (
            <button
              aria-label="로그아웃"
              title={compact ? "로그아웃" : undefined}
              onClick={() => void logout()}
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
        className={`app-sidebar ${system === "NOTE SYS" ? "app-note-accent" : ""} ${collapsed ? "app-collapsed" : ""}`}
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
            className={`app-sidebar app-mobile-drawer ${system === "NOTE SYS" ? "app-note-accent" : ""}`}
          >
            {body(false)}
          </aside>
        </div>
      )}
    </>
  );
}
