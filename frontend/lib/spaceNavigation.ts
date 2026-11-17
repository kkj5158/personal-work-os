import { tabTarget, type TabSystem } from "./globalTabs";

// Space identity is shell-only. Legacy SystemName, tab IDs and server preferences stay intact.
export const SPACES = [
  { id: "work", name: "WORK", shortName: "WORK", description: "Plan · Execute · Record", defaultRoute: "/workflow/week" },
  { id: "knowledge", name: "KNOWLEDGE & LOG", shortName: "K & LOG", description: "지식과 개인 일상 기록", defaultRoute: "/notes" },
  { id: "growth", name: "GROWTH", shortName: "GROWTH", description: "학습 · 자기 탐구 · 글쓰기", defaultRoute: "/study" },
  { id: "life", name: "LIFE", shortName: "LIFE", description: "생활 · 건강 · 수행 체크리스트", defaultRoute: "/life/categories" },
  { id: "finance", name: "FINANCE", shortName: "FINANCE", description: "금융 · 가계부 · 부채", defaultRoute: "/money" },
] as const;
export type SpaceId = typeof SPACES[number]["id"];
export const SYSTEMS: readonly { id: TabSystem; spaceId: SpaceId; displayName: string; defaultRoute: string }[] = [
  { id: "WORK FLOW", spaceId: "work", displayName: "WORK", defaultRoute: "/workflow/week" },
  { id: "WORK OS", spaceId: "work", displayName: "WORK", defaultRoute: "/worklog" },
  { id: "Calendar", spaceId: "work", displayName: "Calendar", defaultRoute: "/calendar" },
  { id: "NOTE SYS", spaceId: "knowledge", displayName: "NOTE SYS", defaultRoute: "/notes" },
  { id: "BLOG", spaceId: "knowledge", displayName: "Blog · LOG", defaultRoute: "/blog" },
  { id: "NAVER ARCHIVE", spaceId: "knowledge", displayName: "네이버 블로그", defaultRoute: "/naver-archive" },
  { id: "STUDY", spaceId: "growth", displayName: "STUDY", defaultRoute: "/study" },
  { id: "AUTHORING", spaceId: "growth", displayName: "AUTHORING", defaultRoute: "/authoring" },
  { id: "LIFE CODE", spaceId: "life", displayName: "LIFE OS", defaultRoute: "/life/categories" },
  { id: "DIET SYS", spaceId: "life", displayName: "DIET SYS", defaultRoute: "/diet" },
  { id: "CHECKLIST SYS", spaceId: "life", displayName: "CHECKLIST SYS", defaultRoute: "/checklist" },
  { id: "MONEY SYS", spaceId: "finance", displayName: "MONEY SYS", defaultRoute: "/money" },
];
export const WORK_GROUPS = [
  { section: "PLANNING", items: [
    { label: "This Week", href: "/workflow/week" }, { label: "Projects", href: "/workflow/projects" },
    { label: "All To-dos", href: "/workflow/todo" }, { label: "Timeline", href: "/workflow/timeline" },
    { label: "Waiting", href: "/workflow/waiting" }, { label: "WORK QUEUE", href: "/workflow/attention" },
  ] },
  { section: "EXECUTION", items: [{ label: "Calendar", href: "/calendar" }, { label: "Work Routine", href: "/workflow/routine" }] },
  { section: "RECORDS", items: [{ label: "근무 기록", href: "/worklog" }, { label: "출결 관리", href: "/worklog/attendance" }, { label: "근무 체크리스트", href: "/worklog/checklist" }] },
  { section: "TOOLS", items: [{ label: "공유 작업대", href: "/workflow/shared-desk" }] },
  { section: "ARCHIVED", items: [{ label: "Workpad", href: "/workflow/today" }] },
] as const;
export function routeNavigation(href: string) {
  const target = tabTarget(href);
  // Existing non-tab pages remain direct links. Never remember authorization challenges or fixtures.
  const legacy = href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? ({
    "/planning": "WORK OS", "/workflow/attention/connect": "WORK FLOW", "/notes/fixture": "NOTE SYS",
  } as Record<string, TabSystem>)[href.split(/[?#]/)[0]] : undefined;
  const system = SYSTEMS.find(row => row.id === (target?.system ?? legacy));
  if (!system) return null;
  return { ...system, route: target?.route ?? href.split(/[?#]/)[0], restorable: !!target, space: SPACES.find(row => row.id === system.spaceId)! };
}
export const SPACE_STORAGE_KEY = "pos.navigation.v1";
export type SpaceHistory = { version: 1; spaces: Partial<Record<SpaceId, string>>; systems: Partial<Record<TabSystem, string>> };
export const emptySpaceHistory = (): SpaceHistory => ({ version: 1, spaces: {}, systems: {} });
export function rememberSpace(history: SpaceHistory, href: string): SpaceHistory {
  const entry = routeNavigation(href);
  return entry?.restorable ? { version: 1, spaces: { ...history.spaces, [entry.spaceId]: entry.route }, systems: { ...history.systems, [entry.id]: entry.route } } : history;
}
export function restoreSpaceHistory(raw: string | null): SpaceHistory {
  const history = emptySpaceHistory();
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1) return history;
    for (const space of SPACES) {
      const route = value.spaces?.[space.id];
      if (typeof route === "string" && routeNavigation(route)?.restorable && routeNavigation(route)?.spaceId === space.id) history.spaces[space.id] = routeNavigation(route)!.route;
    }
    for (const system of SYSTEMS) {
      const route = value.systems?.[system.id];
      if (typeof route === "string" && routeNavigation(route)?.restorable && routeNavigation(route)?.id === system.id) history.systems[system.id] = routeNavigation(route)!.route;
    }
  } catch { /* Corrupt/disabled storage never prevents navigation. */ }
  return history;
}
export function spaceDestination(history: SpaceHistory, id: SpaceId) {
  const route = history.spaces[id];
  return route && routeNavigation(route)?.spaceId === id ? routeNavigation(route)!.route : SPACES.find(row => row.id === id)!.defaultRoute;
}
export function systemDestination(history: SpaceHistory, id: TabSystem) {
  const route = history.systems[id];
  return route && routeNavigation(route)?.id === id ? routeNavigation(route)!.route : SYSTEMS.find(row => row.id === id)!.defaultRoute;
}
