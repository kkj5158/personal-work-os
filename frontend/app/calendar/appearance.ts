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
  stateVisible?: boolean;
  mode?: "actual" | "plan" | "compare";
  recentColors?: string[];
}
export const EMPTY_PREFERENCES: CalendarPreferences = { hidden: {}, colors: {}, showInactive: false, stateVisible:true, mode:"actual", recentColors:[] };
export const PREFERENCE_KEY = "calendar.appearance.v1";
export const categoryKey = (domain: string, id: string | null) => `${domain}:${id ?? "uncategorized"}`;
export function calendarCategories(work: ActivityCategory[], life: LifeCategoryDto[]): CalendarCategory[] {
  return [...work.map(c => ({ ...c, domain: "WORK" as const })), ...life.map(c => ({ ...c, domain: "LIFE" as const, parentId: c.parentId ?? null }))].sort((a, b) => a.sortOrder - b.sortOrder);
}
const PALETTE = ["#4b89dc", "#9674cf", "#48a78a", "#d5a344", "#d97991", "#679aa7"];
export const PICKER_COLORS = ["#6489b8", "#7584bd", "#937fb6", "#b27fa3", "#c7838c", "#c99376", "#c5a660", "#9ba66d", "#76a184", "#65a59d", "#6b9dad", "#8c96a4"];
export function recentColor(colors:string[] = [], color:string) {
  return [color.toLowerCase(),...colors.filter(c => c.toLowerCase() !== color.toLowerCase())].filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0,8);
}
export function readPreferences(raw:string|null):CalendarPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return {...EMPTY_PREFERENCES};
    const colors = Object.fromEntries(Object.entries(value.colors ?? {}).filter(([,v]) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v))) as Record<string,string>;
    return {...EMPTY_PREFERENCES,hidden:value.hidden && typeof value.hidden === "object" ? value.hidden : {},colors,showInactive:value.showInactive === true,stateVisible:value.stateVisible !== false,mode:["actual","plan","compare"].includes(value.mode) ? value.mode : "actual",recentColors:Array.isArray(value.recentColors) ? [...new Set<string>(value.recentColors.filter((v:unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)).map((v:string)=>v.toLowerCase()))].slice(0,8) : []};
  } catch { return {...EMPTY_PREFERENCES}; }
}
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
