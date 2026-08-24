// Mock ActivityCategory catalog for Work Log work-time entries (v9 unit).
//
// ActivityCategory is the canonical user-owned category shared across
// Planning, Work Log work-time entries, the future time calendar, and future
// plan-versus-actual analytics (see frontend/lib/api/types.ts) — this file
// does NOT define a Work Log-specific category type, table, or management
// UI. It only holds a small mock catalog standing in for
// `GET /api/activity-categories` until Work Log gets a real backend
// connection; page.tsx sources its `categories` state from here exactly the
// way it sources `startTimeCriteria` from START_TIME_CRITERIA, so swapping
// this constant for a real fetch later is a page.tsx-only change — nothing
// downstream (WorkTimeEntryEditor, the daily view, the record-detail modal)
// needs to know the difference, since they already consume the shared
// `ActivityCategory` type.
//
// These names are illustrative mock content only, not production seed data.

import type { ActivityCategory } from "@/lib/api/types";

export const CATEGORY_WORK_ROOT_ID = "8f14e1a3-0000-4000-8000-000000000001";
export const CATEGORY_GENERAL_WORK_ID = "8f14e1a3-0000-4000-8000-000000000002";
export const CATEGORY_MEETING_ID = "8f14e1a3-0000-4000-8000-000000000003";
export const CATEGORY_DOCUMENTATION_ID = "8f14e1a3-0000-4000-8000-000000000004";
// Deliberately inactive — exercises the "historical entry keeps referencing
// an inactive category" requirement. One mock entry (mockData.ts) is wired
// to this id on purpose so that display path is actually exercised, not
// just theoretically supported.
export const CATEGORY_LEGACY_INACTIVE_ID = "8f14e1a3-0000-4000-8000-000000000005";

export const MOCK_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  { id: CATEGORY_WORK_ROOT_ID, name: "업무", parentId: null, sortOrder: 0, isActive: true },
  { id: CATEGORY_GENERAL_WORK_ID, name: "일반 업무", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 0, isActive: true },
  { id: CATEGORY_MEETING_ID, name: "회의", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 1, isActive: true },
  { id: CATEGORY_DOCUMENTATION_ID, name: "기록", parentId: null, sortOrder: 1, isActive: true },
  { id: CATEGORY_LEGACY_INACTIVE_ID, name: "레거시 업무", parentId: null, sortOrder: 2, isActive: false },
];

export interface CategoryOption {
  id: string;
  label: string;
}

// Active, newly-selectable options only — both root and child categories,
// ordered by sortOrder then name, with each root's active children grouped
// immediately after it so the hierarchy stays scannable in a flat <select>.
// A child's label is always "Parent > Child" so it's never ambiguous on its
// own; a root's label is just its own name. Inactive categories never
// appear here — see `resolveCategoryLabel` for how an entry that already
// references one is still displayed.
export function buildSelectableCategoryOptions(categories: ActivityCategory[]): CategoryOption[] {
  const active = categories.filter((c) => c.isActive);
  const sortByOrder = (a: ActivityCategory, b: ActivityCategory) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");
  const roots = active.filter((c) => c.parentId === null).sort(sortByOrder);

  const options: CategoryOption[] = [];
  for (const root of roots) {
    options.push({ id: root.id, label: root.name });
    const children = active.filter((c) => c.parentId === root.id).sort(sortByOrder);
    for (const child of children) {
      options.push({ id: child.id, label: `${root.name} > ${child.name}` });
    }
  }
  return options;
}

// Resolves the display label for a categoryId already stored on an entry —
// never used to build the list of newly-selectable options above. Must
// never throw on an id that isn't in the current catalog (unknown/deleted)
// or that is inactive; per spec, an inactive category shows as its own bare
// name plus "(비활성)", not the "Parent > Child" hierarchical form used for
// active selection.
export function resolveCategoryLabel(categoryId: string, categories: ActivityCategory[]): string {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return "알 수 없는 카테고리";
  if (!category.isActive) return `${category.name} (비활성)`;
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : null;
  return parent ? `${parent.name} > ${category.name}` : category.name;
}
