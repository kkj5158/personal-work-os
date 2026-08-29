"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type OcticonProps,
  CalendarIcon,
  GearIcon,
  GraphIcon,
  HistoryIcon,
  HomeIcon,
  LogIcon,
  PlayIcon,
  SignOutIcon,
} from "@primer/octicons-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

/**
 * System-wide navigation sidebar, rendered once from the root layout so it
 * is present on every route. This is distinct from (and must stay
 * decoupled from) any Planning-page-local UI such as category filtering.
 *
 * Only "계획" (Planning), "근무 기록", "근무 체크리스트", and "출결 관리"
 * (the latter three all under the Work Log area) link to real routes; the
 * rest are inert placeholders for sections that exist in the product plan
 * but have no implemented page yet.
 *
 * "근무 체크리스트"/"출결 관리" are visually grouped under "근무 기록"
 * (`indent: true`) rather than a true collapsible parent/child tree — the
 * existing sidebar has no such nesting primitive, and building one is out
 * of scope for this IA refinement (see docs/product/work-log-policy.md).
 * Every route is matched by exact pathname, not startsWith, so navigating
 * between them never highlights the wrong one.
 */
const NAV_ITEMS: { label: string; href: string | null; icon: ComponentType<OcticonProps>; indent?: boolean }[] = [
  { label: "대시보드", href: null, icon: HomeIcon },
  { label: "계획", href: "/planning", icon: CalendarIcon },
  { label: "실행", href: null, icon: PlayIcon },
  { label: "회고", href: null, icon: HistoryIcon },
  { label: "근무 기록", href: "/worklog", icon: LogIcon },
  { label: "근무 체크리스트", href: "/worklog/checklist", icon: LogIcon, indent: true },
  { label: "출결 관리", href: "/worklog/attendance", icon: LogIcon, indent: true },
  { label: "분석", href: null, icon: GraphIcon },
  { label: "설정", href: null, icon: GearIcon },
];

const COLLAPSED_STORAGE_KEY = "app.sidebarCollapsed";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border border-zinc-200 bg-white p-2 text-zinc-600 shadow-sm md:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        aria-label="Open menu"
      >
        ☰
      </button>

      <aside
        className={`hidden h-full shrink-0 border-r border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-950 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        <SidebarBody collapsed={collapsed} onToggleCollapsed={toggleCollapsed} pathname={pathname} onLogout={handleLogout} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <SidebarBody
              collapsed={false}
              onToggleCollapsed={toggleCollapsed}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarBody({
  collapsed,
  onToggleCollapsed,
  pathname,
  onNavigate,
  onLogout,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Personal Work OS</span>}
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href != null && pathname === item.href;
          const inactive = !item.href;
          const Icon = item.icon;
          const body = (
            <span
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : inactive
                    ? "text-zinc-400 dark:text-zinc-600"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={16} aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </span>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}>
              {body}
            </Link>
          ) : (
            <span key={item.label} className="cursor-default">
              {body}
            </span>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-zinc-200 px-2 py-2 dark:border-zinc-800">
        {isAuthRequired() && (
          <button
            onClick={onLogout}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${
              collapsed ? "justify-center" : ""
            }`}
            title={collapsed ? "로그아웃" : undefined}
          >
            <SignOutIcon size={16} aria-hidden="true" />
            {!collapsed && <span>로그아웃</span>}
          </button>
        )}
        <button
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className={`hidden w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 md:flex dark:text-zinc-400 dark:hover:bg-zinc-800 ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden>{collapsed ? "»" : "«"}</span>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}
