// Mock ActivityCategory catalog for Work Log work-time entries (v9 unit,
// two-level correction in v10).
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
// The hierarchy is exactly two levels (parent/child) — see the confirmed
// policy in docs/frontend/work-log/work-log-ui-spec.md §18.7. Only child
// category ids are ever valid as a WorkTimeEntry.categoryId; parent rows are
// grouping-only and are never persisted as a leaf selection.
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
export const CATEGORY_STUDY_ROOT_ID = "8f14e1a3-0000-4000-8000-000000000006";
export const CATEGORY_GENERAL_STUDY_ID = "8f14e1a3-0000-4000-8000-000000000007";
export const CATEGORY_DEV_STUDY_ID = "8f14e1a3-0000-4000-8000-000000000008";

export const MOCK_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  { id: CATEGORY_WORK_ROOT_ID, name: "업무", parentId: null, sortOrder: 0, isActive: true },
  { id: CATEGORY_GENERAL_WORK_ID, name: "일반 업무", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 0, isActive: true },
  { id: CATEGORY_MEETING_ID, name: "회의", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 1, isActive: true },
  { id: CATEGORY_DOCUMENTATION_ID, name: "기록", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 2, isActive: true },
  { id: CATEGORY_LEGACY_INACTIVE_ID, name: "레거시 업무", parentId: CATEGORY_WORK_ROOT_ID, sortOrder: 3, isActive: false },
  { id: CATEGORY_STUDY_ROOT_ID, name: "학습", parentId: null, sortOrder: 1, isActive: true },
  { id: CATEGORY_GENERAL_STUDY_ID, name: "일반 학습", parentId: CATEGORY_STUDY_ROOT_ID, sortOrder: 0, isActive: true },
  { id: CATEGORY_DEV_STUDY_ID, name: "개발 학습", parentId: CATEGORY_STUDY_ROOT_ID, sortOrder: 1, isActive: true },
];

// Mock-local stand-in for the future `activity_categories.is_default`
// backend column (not yet added to the shared ActivityCategory type, since
// the current backend genuinely doesn't return it — adding it there now
// would misrepresent the real API contract). A parent-to-default-child id
// map is the smallest shape that can express "each parent has at most one
// default child" without inventing a parallel category type; a real
// backend-backed implementation would instead read `isDefault` directly off
// each ActivityCategory row returned by the API.
const DEFAULT_CHILD_CATEGORY_ID_BY_PARENT_ID: Record<string, string> = {
  [CATEGORY_WORK_ROOT_ID]: CATEGORY_GENERAL_WORK_ID,
  [CATEGORY_STUDY_ROOT_ID]: CATEGORY_GENERAL_STUDY_ID,
};

export interface CategoryOption {
  id: string;
  label: string;
}

const sortByOrder = (a: ActivityCategory, b: ActivityCategory) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko");

// Active root categories only — the parent selector's option list. Never
// includes a child, even an active one.
export function buildRootOptions(categories: ActivityCategory[]): CategoryOption[] {
  return categories
    .filter((c) => c.isActive && c.parentId === null)
    .sort(sortByOrder)
    .map((c) => ({ id: c.id, label: c.name }));
}

// Active direct children of `parentId` only — the child selector's option
// list. Never includes root categories or grandchildren (the catalog itself
// only has two levels, but this also never walks beyond one parentId hop
// regardless).
export function buildChildOptions(categories: ActivityCategory[], parentId: string): CategoryOption[] {
  return categories
    .filter((c) => c.isActive && c.parentId === parentId)
    .sort(sortByOrder)
    .map((c) => ({ id: c.id, label: c.name }));
}

// Resolves `parentId`'s active default child id, or null when there isn't
// one (no mapping entry, the mapped child no longer exists, it's been
// deactivated, or it no longer actually belongs to this parent). Never
// returns an inactive category — inactive categories must never be
// automatically selected.
export function getDefaultChildCategoryId(parentId: string, categories: ActivityCategory[]): string | null {
  const defaultId = DEFAULT_CHILD_CATEGORY_ID_BY_PARENT_ID[parentId];
  if (!defaultId) return null;
  const child = categories.find((c) => c.id === defaultId);
  if (!child || !child.isActive || child.parentId !== parentId) return null;
  return defaultId;
}

// Resolves the display label for a categoryId already stored on an entry
// (a saved child, or — for the parent selector — a saved parent) — never
// used to build a newly-selectable option list. Must never throw on an id
// that isn't in the current catalog (unknown/deleted). An inactive category
// shows as its own bare name plus "(비활성)"; an active child shows as
// "Parent > Child"; an active root (no parent) shows as its own bare name.
export function resolveCategoryLabel(categoryId: string, categories: ActivityCategory[]): string {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return "알 수 없는 카테고리";
  if (!category.isActive) return `${category.name} (비활성)`;
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : null;
  return parent ? `${parent.name} > ${category.name}` : category.name;
}
