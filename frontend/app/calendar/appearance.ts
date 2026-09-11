import type { ActivityCategory, LifeCategoryDto } from "@/lib/api/types";

export interface CalendarCategory {
  id: string;
  domain: "WORK" | "LIFE";
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
}
export interface CalendarPreferences {
  hidden: Record<string, boolean>;
  colors: Record<string, string>;
  showInactive: boolean;
}
export const EMPTY_PREFERENCES: CalendarPreferences = { hidden: {}, colors: {}, showInactive: false };
export const PREFERENCE_KEY = "calendar.appearance.v1";
export const categoryKey = (domain: string, id: string | null) => `${domain}:${id ?? "uncategorized"}`;
export function calendarCategories(work: ActivityCategory[], life: LifeCategoryDto[]): CalendarCategory[] {
  return [...work.map(c => ({ ...c, domain: "WORK" as const })), ...life.map(c => ({ ...c, domain: "LIFE" as const, parentId: null }))].sort((a, b) => a.sortOrder - b.sortOrder);
}
const PALETTE = ["#4b89dc", "#9674cf", "#48a78a", "#d5a344", "#d97991", "#679aa7"];
export function defaultColor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
export function categoryAppearance(domain: string, id: string | null, categories: CalendarCategory[], prefs: CalendarPreferences) {
  const category = categories.find(c => c.domain === domain && c.id === id);
  const parentKey = categoryKey(domain, category?.parentId ?? id);
  const parent = prefs.colors[parentKey] ?? defaultColor(parentKey);
  return { parent, body: prefs.colors[categoryKey(domain, id)] ?? parent };
}
export function categoryVisible(domain: string, id: string | null, categories: CalendarCategory[], prefs: CalendarPreferences) {
  const category = categories.find(c => c.domain === domain && c.id === id);
  const parent = categories.find(c => c.domain === domain && c.id === category?.parentId);
  return !prefs.hidden[categoryKey(domain, id)] && (prefs.showInactive || ((!category || category.isActive) && (!parent || parent.isActive)));
}
