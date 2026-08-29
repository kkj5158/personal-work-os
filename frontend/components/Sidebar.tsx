"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutIcon } from "@primer/octicons-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAuthRequired } from "@/lib/supabase/env";

/**
 * System-wide navigation sidebar, rendered once from the root layout so it
 * is present on every route. This is distinct from (and must stay
 * decoupled from) any Planning-page-local UI such as category filtering.
 *
 * Only "계획" (Planning), "근무 기록", "체크리스트", and "출결 관리" (the
 * latter three all under the WORK group) link to real routes; the rest are
 * inert placeholders for sections that exist in the product plan but have
 * no implemented page yet — including "근무 현황" (ANALYTICS), which
 * replaces the old standalone "분석" placeholder without introducing a new
 * route. Every route is matched by exact pathname, not startsWith, so
 * navigating between them never highlights the wrong one.
 */
type NavItem = { label: string; href: string | null };
type NavSection = { section: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  { section: "OVERVIEW", items: [{ label: "대시보드", href: null }] },
  {
    section: "WORKFLOW",
    items: [
      { label: "계획", href: "/planning" },
      { label: "실행", href: null },
      { label: "회고", href: null },
    ],
  },
  {
    section: "WORK",
    items: [
      { label: "근무 기록", href: "/worklog" },
      { label: "체크리스트", href: "/worklog/checklist" },
      { label: "출결 관리", href: "/worklog/attendance" },
    ],
  },
  { section: "ANALYTICS", items: [{ label: "근무 현황", href: null }] },
  { section: "SYSTEM", items: [{ label: "설정", href: null }] },
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
        className="fixed left-3 top-3 z-40 rounded-md border border-border-default bg-canvas-default p-2 text-fg-muted shadow-sm md:hidden"
        aria-label="Open menu"
      >
        ☰
      </button>

      <aside
        className={`hidden h-full shrink-0 border-r border-border-default bg-canvas-default md:block ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <SidebarBody collapsed={collapsed} onToggleCollapsed={toggleCollapsed} pathname={pathname} onLogout={handleLogout} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border-default bg-canvas-default">
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
      <div
        className={`flex items-center gap-2 border-b border-border-muted px-3 pb-3 pt-4 ${
          collapsed ? "justify-center" : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/personal-work-os-crow.png"
          alt="Personal Work OS"
          width={22}
          height={22}
          className="h-[22px] w-[22px] shrink-0 object-contain"
        />
        {!collapsed && <span className="text-sm font-semibold text-fg-default">Personal Work OS</span>}
      </div>

      <nav className="flex flex-col gap-3 overflow-y-auto px-2 pb-2 pt-3">
        {NAV_SECTIONS.map((group) => (
          <div key={group.section} className="flex flex-col gap-0.5">
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {group.section}
              </div>
            )}
            {group.items.map((item) => {
              const active = item.href != null && pathname === item.href;
              const inert = !item.href;
              const body = (
                <span
                  className={`flex items-center rounded-md border-l-2 py-1.5 text-sm transition-colors ${
                    collapsed ? "justify-center px-2" : "px-2.5"
                  } ${
                    active
                      ? "border-row-selected-indicator bg-row-selected-bg font-medium text-primary-fg"
                      : inert
                        ? "border-transparent text-disabled-fg"
                        : "border-transparent text-fg-muted hover:bg-canvas-subtle hover:text-fg-default"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
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
          </div>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-border-muted px-2 py-2">
        {isAuthRequired() && (
          <button
            onClick={onLogout}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-canvas-subtle hover:text-fg-default ${
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
          className={`hidden w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-muted hover:bg-canvas-subtle hover:text-fg-default md:flex ${
            collapsed ? "justify-center" : ""
          }`}
          title={collapsed ? "사이드바 펼치기" : undefined}
        >
          <span aria-hidden>{collapsed ? "›" : "‹"}</span>
          {!collapsed && <span>사이드바 접기</span>}
        </button>
      </div>
    </div>
  );
}
