"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * System-wide navigation sidebar, rendered once from the root layout so it
 * is present on every route. This is distinct from (and must stay
 * decoupled from) any Planning-page-local UI such as category filtering.
 *
 * Only "Planning" links to a real route; the rest are inert placeholders
 * for sections that exist in the product plan (docs/time-work-management-v1.md,
 * and this project's own out-of-scope lists) but have no implemented page
 * yet, matching how this list previously existed in this repo.
 */
const NAV_ITEMS: { label: string; href: string | null; icon: string }[] = [
  { label: "Dashboard", href: null, icon: "🏠" },
  { label: "Planning", href: "/planning", icon: "🗓️" },
  { label: "Execution", href: null, icon: "▶️" },
  { label: "Review", href: null, icon: "🔍" },
  { label: "Work Log", href: null, icon: "📝" },
  { label: "Analytics", href: null, icon: "📈" },
  { label: "Settings", href: null, icon: "⚙️" },
];

const COLLAPSED_STORAGE_KEY = "app.sidebarCollapsed";

export function Sidebar() {
  const pathname = usePathname();
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
        <SidebarBody collapsed={collapsed} onToggleCollapsed={toggleCollapsed} pathname={pathname} />
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
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        <span className="text-lg" aria-hidden>
          🧭
        </span>
        {!collapsed && <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Work OS</span>}
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const active = item.href != null && pathname === item.href;
          const inactive = !item.href;
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
              <span aria-hidden>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </span>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} onClick={onNavigate}>
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
        <button
          onClick={onToggleCollapsed}
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
