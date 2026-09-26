import type { CellAvailability, ChecklistImportance, ChecklistState } from "@/lib/checklist-core/types";
import { addCell, currentStreak, emptySummary, finalize, isActiveOn, type ArchivePeriod, type RateSummary } from "@/lib/checklist-core/stats";
import { addDays, daysBetween } from "@/lib/checklist-core/dates";
import type { Area, Catalog, DailyRecord, Identity, Item } from "./api";

export type JournalFilter = { identityId: string | null; areaId: string | null; importance: ChecklistImportance[] };
export const ALL_IMPORTANCE: ChecklistImportance[] = ["CORE", "SECONDARY", "OPTIONAL"];

export const recordKey = (itemId: string, date: string) => `${itemId}|${date}`;
export function recordMap(records: readonly DailyRecord[]) {
  return new Map(records.map(r => [recordKey(r.itemId, r.date), r.state as ChecklistState]));
}

const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/**
 * Journal order = Identity order → Area order → explicit item sort order.
 * Importance is a filter only and never reorders anything.
 */
export function orderedAreas(catalog: Catalog, identityId: string | null = null): { identity: Identity; area: Area }[] {
  const identities = [...catalog.identities].sort(bySort).filter(i => !identityId || i.id === identityId);
  return identities.flatMap(identity => catalog.areas.filter(a => a.identityId === identity.id).sort(bySort).map(area => ({ identity, area })));
}

/** An item's (and its Area's) visual color: always the owning Identity's representative color. */
export function identityColorOf(catalog: Catalog, areaId: string | null | undefined): string {
  const area = catalog.areas.find(a => a.id === areaId);
  return catalog.identities.find(i => i.id === area?.identityId)?.color ?? NEUTRAL_COLOR;
}

/**
 * Applies an explicit order to a sibling subset exactly like the backend
 * `reorder`: every sibling keeps its slot unless it is in `ids`, whose members
 * fill their own former slots in the given order. Returns id → new sortOrder.
 */
export function reorderSubset<T extends { id: string; sortOrder: number }>(siblings: readonly T[], ids: readonly string[]): Map<string, number> {
  const all = [...siblings].sort(bySort);
  const selected = new Set(ids);
  const next = ids[Symbol.iterator]();
  return new Map(all.map((row, index) => [selected.has(row.id) ? next.next().value as string : row.id, index]));
}

/**
 * Moves an Area into `identityId` with the target group's new order `ids` (which
 * includes the Area), mirroring the backend `moveArea`: only ownership and order change.
 */
export function moveAreaIn(areas: readonly Area[], areaId: string, identityId: string, ids: readonly string[]): Area[] {
  const moved = areas.map(a => (a.id === areaId ? { ...a, identityId } : a));
  const order = reorderSubset(moved.filter(a => a.identityId === identityId), ids);
  return moved.map(a => (order.has(a.id) ? { ...a, sortOrder: order.get(a.id)! } : a));
}

export function itemsInArea(catalog: Catalog, areaId: string, includeArchived = false) {
  return catalog.items.filter(i => i.areaId === areaId && (includeArchived || !i.archivedOn)).sort(bySort);
}

export function journalGroups(catalog: Catalog, filter: JournalFilter) {
  return orderedAreas(catalog, filter.identityId)
    .filter(({ area }) => !filter.areaId || area.id === filter.areaId)
    .map(({ identity, area }) => ({ identity, area, items: itemsInArea(catalog, area.id).filter(i => filter.importance.includes(i.importance)) }))
    .filter(group => group.items.length > 0);
}

export function periodsByItem(periods: readonly ArchivePeriod[]) {
  const map = new Map<string, ArchivePeriod[]>();
  for (const p of periods) map.set(p.itemId, [...(map.get(p.itemId) ?? []), p]);
  return map;
}

export function availabilityOf(item: Item | undefined, date: string, today: string, periods: Map<string, ArchivePeriod[]>): CellAvailability {
  if (!item) return "INACTIVE";
  if (date > today) return "FUTURE";
  return isActiveOn(date, item.startDate, periods.get(item.id) ?? [], item.archivedOn) ? "EDITABLE" : "INACTIVE";
}

export type ItemProgress = { item: Item; area: Area | undefined; identity: Identity | undefined; summary: RateSummary; streak: number; recorded: number };
export type ProgressReport = {
  total: RateSummary;
  byIdentity: { identity: Identity; summary: RateSummary }[];
  byArea: { area: Area; identity: Identity | undefined; summary: RateSummary }[];
  items: ItemProgress[];
  /** Daily completion across the scope, for the heatmap. */
  days: { date: string; summary: RateSummary }[];
};

/**
 * Progress over [from, to]: every active item-day counts once — archived
 * intervals and pre-start days are excluded, NOT_RECORDED never counts as a
 * failure, and importance never changes the weight.
 */
export function progressReport(catalog: Catalog, records: Map<string, ChecklistState>, from: string, to: string, today: string, scope: { identityId: string | null; areaId: string | null }): ProgressReport {
  const periods = periodsByItem(catalog.archivePeriods);
  const areaById = new Map(catalog.areas.map(a => [a.id, a]));
  const identityById = new Map(catalog.identities.map(i => [i.id, i]));
  const end = to < today ? to : today;
  const dates = from <= end ? daysBetween(from, end) : [];
  const items = catalog.items.filter(item => {
    const area = areaById.get(item.areaId);
    return area && (!scope.identityId || area.identityId === scope.identityId) && (!scope.areaId || area.id === scope.areaId);
  });
  const total = emptySummary();
  const identitySums = new Map<string, RateSummary>();
  const areaSums = new Map<string, RateSummary>();
  const daySums = new Map(dates.map(d => [d, emptySummary()]));
  const itemRows: ItemProgress[] = [];
  const state = (itemId: string, date: string) => records.get(recordKey(itemId, date)) ?? "UNTOUCHED";
  for (const item of items) {
    const area = areaById.get(item.areaId)!;
    const own = emptySummary();
    const active = (date: string) => isActiveOn(date, item.startDate, periods.get(item.id) ?? [], item.archivedOn);
    for (const date of dates) {
      if (!active(date)) continue;
      const s = state(item.id, date);
      const isToday = date === today;
      for (const target of [own, total, daySums.get(date)!, sumFor(identitySums, area.identityId), sumFor(areaSums, area.id)]) addCell(target, s, isToday);
    }
    const history = daysBetween(addDays(today, -400) > item.startDate ? addDays(today, -400) : item.startDate, today).reverse();
    const summary = finalize(own);
    itemRows.push({ item, area, identity: identityById.get(area.identityId), summary, streak: currentStreak(history, today, active, d => state(item.id, d)), recorded: summary.success + summary.failure + summary.notRecorded });
  }
  return {
    total: finalize(total),
    byIdentity: [...catalog.identities].sort(bySort).filter(i => identitySums.has(i.id)).map(identity => ({ identity, summary: finalize(identitySums.get(identity.id)!) })),
    byArea: orderedAreas(catalog).filter(({ area }) => areaSums.has(area.id)).map(({ area, identity }) => ({ area, identity, summary: finalize(areaSums.get(area.id)!) })),
    items: itemRows,
    days: dates.map(date => ({ date, summary: finalize(daySums.get(date)!) })),
  };
}

function sumFor(map: Map<string, RateSummary>, key: string) {
  let value = map.get(key);
  if (!value) map.set(key, (value = emptySummary()));
  return value;
}

export const NEUTRAL_COLOR = "#7a8190";
/** Representative color presets; any #rrggbb (custom picker) is equally valid and persisted as-is. */
export const IDENTITY_COLORS = [
  "#6cc68b", "#4bbfb0", "#5bb0e8", "#4c7ef0", "#6b72e8", "#9b7fe6", "#c77dd8", "#e8738f",
  "#e05f5f", "#f08a4b", "#e9b64f", "#c9c24a", "#8fbf5a", "#7a8190", "#5d7089", "#a58a74",
];
