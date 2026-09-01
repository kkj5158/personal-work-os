// Pure, framework-free logic for the Checklist restructure — split out from
// the view components so it can be unit tested without a bundler (this
// repo's plain-Node *.test.ts convention; see checklistLogic.test.ts).
import { addDays, startOfWeek } from "@/lib/date";
import type { ChecklistCategoryDto, ChecklistItemDto, ChecklistMatrixColumnDto, ChecklistMatrixResponseDto, ChecklistPriority } from "@/lib/api/types";

export interface WeekGroup {
  from: Date;
  to: Date;
}

// Month view (§27): weekly groups, Monday-Sunday, partial first/last groups
// allowed — never one flat 30/31-row table. `from`/`to` bound each group to
// the visible month itself (a group's Monday may fall in the previous month,
// its Sunday in the next), matching the reference's partial-group behavior.
export function groupIntoWeeks(monthFrom: Date, monthTo: Date): WeekGroup[] {
  const groups: WeekGroup[] = [];
  let cursor = startOfWeek(monthFrom);
  while (cursor.getTime() <= monthTo.getTime()) {
    const weekEnd = addDays(cursor, 6);
    const from = cursor.getTime() < monthFrom.getTime() ? monthFrom : cursor;
    const to = weekEnd.getTime() > monthTo.getTime() ? monthTo : weekEnd;
    groups.push({ from, to });
    cursor = addDays(cursor, 7);
  }
  return groups;
}

// Canonical order (§34/§40): (category.position, item.position) — never by
// achievement rate, never a separate per-surface ordering. The backend
// matrix/by-item responses are already sorted this way; this helper exists
// for surfaces that combine item lists from a DIFFERENT endpoint (e.g. the
// Individual Tracking selector's /checklist-items/history call), which is
// not guaranteed pre-sorted.
export function sortItemsCanonically<T extends { categoryId: string | null; position: number }>(items: T[], categories: ChecklistCategoryDto[]): T[] {
  const positionByCategory = new Map(categories.map((c) => [c.id, c.position]));
  return [...items].sort((a, b) => {
    const catA = a.categoryId != null ? (positionByCategory.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
    const catB = b.categoryId != null ? (positionByCategory.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER - 1) : Number.MAX_SAFE_INTEGER;
    if (catA !== catB) return catA - catB;
    return a.position - b.position;
  });
}

// Day view hierarchy (§12): CORE / SECONDARY is the PRIMARY grouping —
// Category is metadata beneath the item, never a second grouping layer.
// Items are already canonically ordered on input (matrix columns); this
// only partitions by priority, preserving that relative order within each
// bucket.
export function groupByPriority<T extends { priority: ChecklistPriority }>(items: T[]): { core: T[]; secondary: T[] } {
  return {
    core: items.filter((i) => i.priority === "CORE"),
    secondary: items.filter((i) => i.priority === "SECONDARY"),
  };
}

// --- Per-date x per-item bullet memo (§18) ---
// Persisted as newline-joined text (smallest correct model, per the task's
// own preference over a heavyweight Bullet entity) — the frontend owns the
// bullet-list <-> text conversion.

export function textToBullets(text: string | null): string[] {
  if (!text) return [];
  return text.split("\n");
}

export function bulletsToText(bullets: string[]): string | null {
  const meaningful = bullets.filter((b) => b.trim() !== "");
  if (meaningful.length === 0) return null;
  return bullets.join("\n");
}

// --- Day's "이번 주 X/Y" Goal progress (§15) ---
// Computed from the containing week's already-fetched matrix — achieved vs.
// applicable instances of ONE item across that Monday-Sunday week. Shown
// only when the item was applicable at least once that week (applicable=0
// means "no meaningful progress to show yet", never rendered as "0/0").

export interface WeekProgress {
  achieved: number;
  applicable: number;
}

export function computeWeekProgressForItem(itemId: string, weekMatrix: ChecklistMatrixResponseDto | null): WeekProgress | null {
  if (!weekMatrix) return null;
  let achieved = 0;
  let applicable = 0;
  for (const row of weekMatrix.rows) {
    if (!row.applicable) continue;
    const cell = row.cells.find((c) => c.itemId === itemId);
    if (!cell) continue;
    applicable++;
    if (cell.achieved) achieved++;
  }
  if (applicable === 0) return null;
  return { achieved, applicable };
}

// --- Applicability (§19) ---
// A date x item is "applicable" purely based on whether the backend matrix
// actually returned a cell for it on an applicable (workday) row — NEVER
// re-derived from the attendance status label itself (근무/휴일/연차/... are
// context only). This mirrors exactly what ChecklistDailyService already
// computes server-side (row.applicable && a cell exists for that item).

export function isApplicable(row: { applicable: boolean; cells: { itemId: string }[] } | undefined, itemId: string): boolean {
  if (!row || !row.applicable) return false;
  return row.cells.some((c) => c.itemId === itemId);
}

export function findCell(row: { cells: { itemId: string; entryId: string; achieved: boolean }[] } | undefined, itemId: string) {
  return row?.cells.find((c) => c.itemId === itemId);
}

// --- Filter application (shared by Day/Week/Month) ---

export interface ChecklistFilterState {
  coreOnly: boolean;
  incompleteOnly: boolean;
  priority: "ALL" | ChecklistPriority;
  categoryIds: string[];
  includeNotApplicable: boolean;
  includeDeleted: boolean;
}

export const DEFAULT_CHECKLIST_FILTERS: ChecklistFilterState = {
  coreOnly: false,
  incompleteOnly: false,
  priority: "ALL",
  categoryIds: [],
  includeNotApplicable: false,
  includeDeleted: false,
};

// Applies the visible-column filter (코어만 / 상세 필터 priority+category+
// deleted) — 미완료만 is date-scoped (depends on a specific row's cells) and
// is applied separately by the caller per visible date, not here.
export function filterColumns(columns: ChecklistMatrixColumnDto[], filters: ChecklistFilterState): ChecklistMatrixColumnDto[] {
  return columns.filter((c) => {
    if (filters.coreOnly && c.priority !== "CORE") return false;
    if (filters.priority !== "ALL" && c.priority !== filters.priority) return false;
    if (!filters.includeDeleted && c.deleted) return false;
    if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(c.categoryId ?? "none")) return false;
    return true;
  });
}

export function itemCategoryLabel(item: { categoryId: string | null } | undefined, categories: ChecklistCategoryDto[]): string {
  if (!item || item.categoryId == null) return "미분류";
  return categories.find((c) => c.id === item.categoryId)?.name ?? "미분류";
}

// Local yyyy-MM-dd (not UTC ISO) — shared by every item-management surface
// that schedules an effective-dated version change (create/edit/activate/
// deactivate) starting today.
export function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Item reorder sibling reconstruction ---
// ChecklistSettingsSection's inline drag list only shows the ACTIVE subset
// of a category's items — but the backend validates a reorder payload
// against ALL non-deleted siblings in that category
// (ChecklistItemService.reorder): there is exactly ONE canonical position
// sequence per category, never a separate active-only order. This threads
// the user's reordered VISIBLE subset back into the full canonical sibling
// list: items outside the visible subset (e.g. inactive items)
// keep their original relative order/slot untouched.
export function reconstructFullSiblingOrder(fullIdsInCanonicalOrder: string[], visibleIdsInNewOrder: string[]): string[] {
  const visibleSet = new Set(visibleIdsInNewOrder);
  let cursor = 0;
  return fullIdsInCanonicalOrder.map((id) => (visibleSet.has(id) ? visibleIdsInNewOrder[cursor++] : id));
}

// --- Analytics X-axis tick density (§ monthly-view label overlap fix) ---
// AchievementTrendChart is fed AchievementPointDto/ItemTrendPointDto rows
// whose resolution the backend already picked from the requested range span
// (ChecklistAnalyticsService: <=31 days -> DAILY, <=186 -> WEEKLY, else
// MONTHLY — see docs/backend/checklist.md). DAILY and WEEKLY buckets both
// label with a plain calendar date (yyyy-MM-dd); MONTHLY buckets label with
// a yyyy-MM YearMonth string. Only the former ever has enough points on
// screen at once (up to 31 for a full 월 view) to overlap, so tick
// thinning applies only to those — never to already-sparse MONTHLY labels,
// and never to the underlying data points themselves, which always render
// in full regardless of which labels are shown.
const ISO_DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/;

export function isDateLabel(label: string): boolean {
  return ISO_DATE_LABEL.test(label);
}

/** yyyy-MM-dd -> "M/D" (no leading zeros), e.g. "2026-08-01" -> "8/1". */
export function formatShortDateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * Picks which of `n` sequential positions get a visible X-axis tick, capped
 * at `maxTicks`, evenly spaced, always including the first and last index
 * (the "always preserve the first/last visible date" requirement) even when
 * `n - 1` isn't a clean multiple of the step. `n <= maxTicks` shows every
 * index — this is what keeps a 주 (week, 7 points) view fully labeled while
 * thinning a 월 (month, up to 31 points) view down to ~6-8.
 */
export function computeVisibleTickIndices(n: number, maxTicks: number): Set<number> {
  const indices = new Set<number>();
  if (n <= 0) return indices;
  if (n <= maxTicks) {
    for (let i = 0; i < n; i++) indices.add(i);
    return indices;
  }
  const step = Math.ceil((n - 1) / (maxTicks - 1));
  for (let i = 0; i < n; i += step) indices.add(i);
  indices.add(n - 1);
  return indices;
}

export type { ChecklistItemDto };
