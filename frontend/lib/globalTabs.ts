export type TabSystem = "WORK OS" | "NOTE SYS" | "LIFE CODE" | "DIET SYS" | "Calendar" | "WORK FLOW" | "AUTHORING";
export type GlobalTab = { tabId: string; system: TabSystem; route: string; title: string; contextKey: string };
export type TabState = { version: 1; tabs: GlobalTab[]; activeTabId: string | null };
export const TAB_STORAGE_KEY = "orbit.globalTabs.v1";
export const personalOsTitle = (page?: string) => page ? `${page} | Personal OS` : "Personal OS";
export const EMPTY_TABS: TabState = { version: 1, tabs: [], activeTabId: null };

const noteModules: Record<string, string> = { DAILY_HUB: "데일리 허브", DAILY_NOTES: "Daily Notes", ALL_NOTES: "모든 노트", RECENT_NOTES: "최근 노트", TAGS: "태그", CONNECTED_NOTES: "연결된 노트", GRAPH: "그래프", WORKSPACE_SETTINGS: "Workspace 설정", SYSTEM_SETTINGS: "NOTE SYS 설정", TRASH: "휴지통" };
// Only route context belongs in shell preferences. Unknown query parameters,
// credentials, content, selections and transient editor state are never stored.
const keys: Record<TabSystem, string[]> = {
  "WORK OS": ["date"], "NOTE SYS": ["workspace", "workspaceName", "note", "module", "date", "tag"],
  "LIFE CODE": [], "DIET SYS": [], Calendar: ["date", "view", "mode"], "WORK FLOW": ["date", "block"], AUTHORING: [],
};
export function tabTarget(href: string): Omit<GlobalTab, "tabId"> | null {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return null;
  const url = new URL(href, "https://orbit.local");
  const path = url.pathname;
  const authoring = path === "/authoring" || /^\/authoring\/(quick-motivation|recovery|reality|grounded-future|past|review)\/session\/[\da-f-]{36}(\/(full|report))?$/.test(path);
  const system: TabSystem | null = authoring ? "AUTHORING" : ["/workflow", "/workflow/projects", "/workflow/timeline", "/workflow/todo", "/workflow/today"].includes(path) ? "WORK FLOW" : ["/diet", "/diet/record", "/diet/planner", "/diet/progress", "/diet/gallery", "/diet/identity"].includes(path) ? "DIET SYS" : path === "/notes" ? "NOTE SYS" : path === "/calendar" ? "Calendar" : path === "/life/categories" ? "LIFE CODE" : ["/worklog", "/worklog/checklist", "/worklog/attendance"].includes(path) ? "WORK OS" : null;
  if (!system) return null;
  const query = new URLSearchParams();
  for (const key of keys[system]) {
    const value = url.searchParams.get(key);
    if (value && value.length <= 240) query.set(key, value);
  }
  query.sort();
  const route = `${path}${query.size ? `?${query}` : ""}`;
  // A document has one logical identity even when opened from another module.
  const contextKey = system === "NOTE SYS" && query.has("note")
    ? `/notes?workspace=${query.get("workspace") ?? query.get("workspaceName") ?? ""}&note=${query.get("note")}` : system === "AUTHORING" ? path.replace(/\/(full|report)$/, "") : route;
  const title = system === "AUTHORING" ? "AUTHORING" : system === "WORK FLOW" ? `WORK FLOW · ${{"/workflow":"Today","/workflow/today":"Today","/workflow/projects":"Projects","/workflow/timeline":"Timeline","/workflow/todo":"To-do"}[path]}` : system === "DIET SYS" ? `DIET SYS · ${{"/diet":"홈","/diet/record":"기록","/diet/planner":"플래너","/diet/progress":"통계","/diet/gallery":"갤러리","/diet/identity":"정체성/목표"}[path]}` : system === "LIFE CODE" ? "LIFE CODE · 카테고리" : system === "Calendar" ? `Calendar${query.get("date") ? ` · ${query.get("date")}` : ""}`
    : system === "NOTE SYS" ? (query.has("note") ? "NOTE SYS · 노트" : noteModules[query.get("module") ?? "DAILY_NOTES"] ?? "NOTE SYS")
    : path.endsWith("/checklist") ? "체크리스트" : path.endsWith("/attendance") ? "출결 관리" : "근무 기록";
  return { system, route, title, contextKey };
}
export function visitTab(state: TabState, href: string, newTab = false, title?: string): TabState {
  const target = tabTarget(href);
  if (!target) return state;
  const existing = state.tabs.find(tab => tab.contextKey === target.contextKey);
  if (existing) return { ...state, activeTabId: existing.tabId, tabs: state.tabs.map(tab => tab === existing ? { ...tab, ...target, title: title ?? tab.title } : tab) };
  const active = !newTab && state.tabs.find(tab => tab.tabId === state.activeTabId);
  const next = { ...target, title: title?.slice(0, 160) || target.title, tabId: active ? active.tabId : crypto.randomUUID() };
  return { version: 1, tabs: active ? state.tabs.map(tab => tab === active ? next : tab) : [...state.tabs, next], activeTabId: next.tabId };
}
export function closeTab(state: TabState, tabId: string): TabState {
  const index = state.tabs.findIndex(tab => tab.tabId === tabId);
  if (index < 0) return state;
  const tabs = state.tabs.filter(tab => tab.tabId !== tabId);
  return { ...state, tabs, activeTabId: state.activeTabId === tabId ? tabs[Math.min(index, tabs.length - 1)]?.tabId ?? null : state.activeTabId };
}
export function reorderTabs(state: TabState, from: string, to: string): TabState {
  const source = state.tabs.findIndex(tab => tab.tabId === from), destination = state.tabs.findIndex(tab => tab.tabId === to);
  if (source < 0 || destination < 0 || source === destination) return state;
  const tabs = [...state.tabs]; const [tab] = tabs.splice(source, 1); tabs.splice(destination, 0, tab);
  return { ...state, tabs };
}
export function restoreTabs(raw: string | null): TabState {
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (parsed?.version !== 1 || !Array.isArray(parsed.tabs)) return EMPTY_TABS;
    const tabs: GlobalTab[] = [];
    for (const row of parsed.tabs.slice(0, 100)) {
      const target = typeof row?.route === "string" ? tabTarget(row.route) : null;
      if (!target || typeof row.tabId !== "string" || tabs.some(tab => tab.tabId === row.tabId || tab.contextKey === target.contextKey)) continue;
      tabs.push({ ...target, tabId: row.tabId.slice(0, 100), title: typeof row.title === "string" ? row.title.slice(0, 160) : target.title });
    }
    return { version: 1, tabs, activeTabId: tabs.find(tab => tab.tabId === parsed.activeTabId)?.tabId ?? tabs[0]?.tabId ?? null };
  } catch { return EMPTY_TABS; }
}
