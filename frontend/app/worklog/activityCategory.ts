// ActivityCategory helpers for Work Log work-time entries.
//
// ActivityCategory is the canonical user-owned category shared across
// Planning, Work Log work-time entries, the future time calendar, and future
// plan-versus-actual analytics (see frontend/lib/api/types.ts) — this file
// does NOT define a Work Log-specific category type, table, or management
// UI. `categories` throughout Work Log is real data from
// `GET /api/activity-categories` (lib/api/categories.ts), fetched once in
// page.tsx.
//
// The hierarchy is exactly two levels (parent/child) — see the confirmed
// policy in docs/product/work-log-policy.md. Only child category ids are
// ever valid as a WorkTimeEntry.categoryId; parent rows are grouping-only
// and are never persisted as a leaf selection.

import type { ActivityCategory } from "@/lib/api/types";

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
// one. Reads the backend's own `isDefault` field directly (ActivityCategory
// default-child contract — docs/backend/activity-categories.md) rather than
// a frontend-local mapping. Never returns an inactive category — the
// backend's own constraints already guarantee a default is always active,
// but this stays defensive rather than trusting that blindly.
export function getDefaultChildCategoryId(parentId: string, categories: ActivityCategory[]): string | null {
  const child = categories.find((c) => c.parentId === parentId && c.isDefault);
  if (!child || !child.isActive) return null;
  return child.id;
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
