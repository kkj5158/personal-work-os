import type { ActivityCategory, LifeCategoryDto } from "@/lib/api/types";

export interface CalendarCategory {
  id: string;
  domain: "WORK" | "LIFE";
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Server-persisted color; null on a child means "inherit the root". */
  color?: string | null;
}
export interface CalendarPreferences {
  hidden: Record<string, boolean>;
  /** Legacy (pre-V65) browser-local overrides. Never used for display: uploaded
   * once via legacyColorImports (server keeps owner-chosen colors), then cleared. */
  colors: Record<string, string>;
  showInactive: boolean;
  stateVisible?: boolean;
  groupVisibility?: Partial<Record<"all"|"actual"|"plan"|"compare"|"review",boolean>>;
  mode?: "all" | "actual" | "plan" | "compare" | "review";
  recentColors?: string[];
}
export const EMPTY_PREFERENCES: CalendarPreferences = { hidden: {}, colors: {}, showInactive: false, stateVisible:true, mode:"all", recentColors:[] };
export const PREFERENCE_KEY = "calendar.appearance.v1";
export const groupsVisible = (prefs:CalendarPreferences,mode:"all"|"actual"|"plan"|"compare"|"review") => prefs.groupVisibility?.[mode] ?? mode !== "compare";
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
    const groupVisibility=Object.fromEntries(Object.entries(value.groupVisibility ?? {}).filter(([key,v])=>["all","actual","plan","compare","review"].includes(key) && typeof v === "boolean"));
    return {...EMPTY_PREFERENCES,groupVisibility,hidden:value.hidden && typeof value.hidden === "object" ? value.hidden : {},colors,showInactive:value.showInactive === true,stateVisible:value.stateVisible !== false,mode:["all","actual","plan","compare","review"].includes(value.mode) ? value.mode : "all",recentColors:Array.isArray(value.recentColors) ? [...new Set<string>(value.recentColors.filter((v:unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)).map((v:string)=>v.toLowerCase()))].slice(0,8) : []};
  } catch { return {...EMPTY_PREFERENCES}; }
}
/** Only for keys without a category row ("WORK:uncategorized"/"LIFE:uncategorized"):
 * fixed strings, so the result is identical in every environment. */
export function defaultColor(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
/** Neutral color for a category row missing from the catalog (never a UUID hash). */
export const UNKNOWN_CATEGORY_COLOR = "#8c96a4";
/** The single Calendar color resolver (rail, blocks, editor, Reflection). The
 * server-persisted root color is the parent identity; a child's own persisted
 * color is its body, otherwise it inherits. Browser storage is never consulted. */
export function categoryAppearance(domain: string, id: string | null, categories: CalendarCategory[]) {
  if (id === null) { const color = defaultColor(categoryKey(domain, null)); return { parent: color, body: color }; }
  const category = categories.find(c => c.domain === domain && c.id === id);
  const root = category?.parentId ? categories.find(c => c.domain === domain && c.id === category.parentId) : category;
  const parent = root?.color ?? UNKNOWN_CATEGORY_COLOR;
  return { parent, body: category?.color ?? parent };
}
/** Legacy browser overrides that still match a category row, for the one-time upload. */
export function legacyColorImports(prefs: CalendarPreferences, categories: CalendarCategory[]) {
  return Object.entries(prefs.colors).flatMap(([key, color]) => {
    const category = categories.find(c => categoryKey(c.domain, c.id) === key);
    return category && category.color?.toLowerCase() !== color.toLowerCase() ? [{ category, color: color.toLowerCase() }] : [];
  });
}
export function categoryVisible(domain: string, id: string | null, categories: CalendarCategory[], prefs: CalendarPreferences) {
  const category = categories.find(c => c.domain === domain && c.id === id);
  const parent = categories.find(c => c.domain === domain && c.id === category?.parentId);
  return !prefs.hidden[categoryKey(domain, id)] && (prefs.showInactive || ((!category || category.isActive) && (!parent || parent.isActive)));
}
