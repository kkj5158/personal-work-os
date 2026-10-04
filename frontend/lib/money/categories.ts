import type { Category } from "./model";

export type CategoryIcon = { type: "EMOJI" | "ICON" | "ASSET"; value: string };
export type CategoryGroup = { id: string; name: string; kind: "EXPENSE" | "INCOME"; sortOrder: number; version: number; archived?: boolean; iconType?: CategoryIcon["type"] | null; iconValue?: string | null };
export type TreeCategory = Category & { structuralGroupId?: string | null; iconType?: CategoryIcon["type"] | null; iconValue?: string | null };
export const UNGROUPED = "structural:ungrouped";
export type CategoryFilterSelection = { groups: string[]; roots: string[]; finals: string[]; uncategorized: boolean };
export const emptyCategoryFilter = (): CategoryFilterSelection => ({ groups: [], roots: [], finals: [], uncategorized: false });

/** Presentation-only L1; persisted root/child IDs and effective activity remain authoritative. */
export function categoryTree(categories: TreeCategory[], groups: CategoryGroup[] = []) {
  const index = categoryIndex(categories);
  const visibleGroups = groups.filter(g => categories.some(c => c.kind === g.kind)).sort((a,b) => a.sortOrder-b.sortOrder);
  const groupIds = new Set(visibleGroups.map(g => g.id));
  const groupOf = (c?: TreeCategory) => c?.structuralGroupId && groupIds.has(c.structuralGroupId) ? c.structuralGroupId : UNGROUPED;
  const structural = [...visibleGroups, { id: UNGROUPED, name: "미분류 그룹", kind: "EXPENSE" as const, sortOrder: Number.MAX_SAFE_INTEGER, version: 0 }];
  const rootsFor = (ids: string[]) => index.roots.filter(c => !ids.length || ids.includes(groupOf(c)));
  const finalsFor = (roots: TreeCategory[]) => roots.flatMap(root => [{ id: `direct:${root.id}`, categoryId: root.id, rootId: root.id, name: `${root.name} · 직접 지정` }, ...(index.children.get(root.id) ?? []).map(c => ({ id: c.id, categoryId: c.id, rootId: root.id, name: c.name }))]);
  const path = (id?: string | null) => {
    const c = id ? index.byId.get(id) : undefined;
    if (!c) return "미분류";
    const root = c.parentId ? index.byId.get(c.parentId) : c;
    const group = structural.find(g => g.id === groupOf(root as TreeCategory));
    return `${group?.name ?? "미분류 그룹"} / ${index.path(id).replaceAll(" > ", " / ")}`;
  };
  return { ...index, structural, groupOf, rootsFor, finalsFor, path };
}

export function normalizeCategoryFilter(categories: TreeCategory[], groups: CategoryGroup[], value: CategoryFilterSelection): CategoryFilterSelection {
  const tree = categoryTree(categories, groups);
  const groupIds = value.groups.filter(id => tree.structural.some(g => g.id === id));
  const roots = tree.rootsFor(groupIds);
  const rootIds = value.roots.filter(id => roots.some(c => c.id === id));
  const finals = tree.finalsFor(rootIds.length ? roots.filter(c => rootIds.includes(c.id)) : roots);
  return { groups: groupIds, roots: rootIds, finals: value.finals.filter(id => finals.some(c => c.id === id)), uncategorized: value.uncategorized };
}

/** Same-stage OR, active-stage AND; null category is an independent OR branch. */
export function categoryFilterMatches(categories: TreeCategory[], groups: CategoryGroup[], value: CategoryFilterSelection, categoryId: string | null): boolean {
  const tree = categoryTree(categories, groups), selected = normalizeCategoryFilter(categories, groups, value);
  const restricted = !!(selected.groups.length || selected.roots.length || selected.finals.length || selected.uncategorized);
  if (!restricted) return true;
  if (!categoryId) return selected.uncategorized;
  const c = tree.byId.get(categoryId);
  if (!c) return false;
  const root = c.parentId ? tree.byId.get(c.parentId) : c;
  if (!root) return false;
  if (selected.groups.length && !selected.groups.includes(tree.groupOf(root))) return false;
  if (selected.roots.length && !selected.roots.includes(root.id)) return false;
  if (selected.finals.length && !selected.finals.includes(c.parentId ? c.id : `direct:${c.id}`)) return false;
  return !!(selected.groups.length || selected.roots.length || selected.finals.length);
}

/** Convert shared tree predicates to the existing complete-query category filter wire format. */
export function categoryFilterIds(categories: TreeCategory[], groups: CategoryGroup[], value: CategoryFilterSelection): string[] | null {
  const selected = normalizeCategoryFilter(categories, groups, value);
  if (!selected.groups.length && !selected.roots.length && !selected.finals.length && !selected.uncategorized) return null;
  const tree = categoryTree(categories, groups);
  const result = selected.finals.length ? selected.finals : tree.rootsFor(selected.groups).filter(c => !selected.roots.length || selected.roots.includes(c.id)).map(c => c.id);
  // Only uncategorized means only null, not all categorized rows.
  return [...(selected.groups.length || selected.roots.length || selected.finals.length ? result : []), ...(selected.uncategorized ? ["uncategorized"] : [])];
}

export function categoryFilterFromIds(categories: TreeCategory[], ids: string[] | null): CategoryFilterSelection {
  if (!ids?.length) return emptyCategoryFilter();
  const index = categoryIndex(categories), roots = ids.filter(id => index.roots.some(c => c.id === id));
  const finals = ids.filter(id => id.startsWith("direct:") || !!index.byId.get(id)?.parentId);
  // Expand subtree roots when mixed with final buckets so the predicate stays exact.
  if (finals.length) for (const id of roots) finals.push(`direct:${id}`, ...(index.children.get(id) ?? []).map(c => c.id));
  return { groups: [], roots: finals.length ? [] : roots, finals, uncategorized: ids.includes("uncategorized") };
}

export function assertFinalCategory(categories: TreeCategory[], id: string): string {
  if (!id) return "";
  const index = categoryIndex(categories), c = index.byId.get(id);
  if (!c || !index.active(c) || id.startsWith("direct:") || id.startsWith("structural:")) throw new Error("활성 실제 분류만 지정할 수 있습니다.");
  return c.id;
}

export function categoryMergeTargets(categories: Category[], sourceId: string): Category[] {
  const tree=categoryIndex(categories),source=tree.byId.get(sourceId);
  if(!source||!tree.active(source)||(tree.children.get(source.id)?.length))return [];
  return categories.filter(c=>c.id!==source.id&&c.kind===source.kind&&(c.parentId??null)===(source.parentId??null)&&tree.active(c)&&!tree.children.get(c.id)?.length);
}

export function categoryIndex(categories: Category[]) {
  const byId = new Map(categories.map(c => [c.id, c]));
  const children = new Map<string, Category[]>();
  for (const c of categories) if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const path = (id?: string | null) => {
    const c = id ? byId.get(id) : undefined;
    return c ? (c.parentId ? `${byId.get(c.parentId)?.name ?? "보관 분류"} > ` : "") + c.name : "미분류";
  };
  const active = (c: Category) => !c.archived && !c.effectiveArchived && !(c.parentId && byId.get(c.parentId)?.archived);
  return { byId, children, roots: categories.filter(c => !c.parentId), path, active };
}

/** A subtree OR its direct/child buckets, never parent minus selected children. */
export function toggleCategoryFilter(categories: Category[], current: string[] | null, id: string): string[] {
  const { byId, children, roots } = categoryIndex(categories);
  const direct = id.startsWith("direct:");
  const c = byId.get(direct ? id.slice(7) : id);
  const parentId = direct ? c?.id : c?.parentId;
  let next = current ? [...current] : [...roots.map(c => c.id), "uncategorized"];
  if (c && !parentId && !direct) next = next.filter(x => x !== `direct:${c.id}` && !(children.get(c.id) ?? []).some(child => child.id === x));
  if (parentId) next = next.filter(x => x !== parentId);
  return next.includes(id) ? next.filter(x => x !== id) : [...next, id];
}

export function categoryTotals(categories: Category[], rows: { categoryId: string | null; amount: number }[]) {
  const { byId } = categoryIndex(categories);
  const groups = new Map<string, { id: string; label: string; amount: number; children: Map<string, { id: string; label: string; amount: number }> }>();
  for (const row of rows) {
    const c = row.categoryId ? byId.get(row.categoryId) : undefined;
    const root = c?.parentId ? byId.get(c.parentId) : c;
    const id = root?.id ?? "uncategorized";
    if (!groups.has(id)) groups.set(id, { id, label: root?.name ?? "미분류", amount: 0, children: new Map() });
    const group = groups.get(id)!;
    const childId = c?.parentId ? c.id : root ? `direct:${root.id}` : "uncategorized";
    const child = group.children.get(childId) ?? { id: childId, label: c?.parentId ? c.name : root ? "세부분류 없음" : "미분류", amount: 0 };
    child.amount += row.amount; group.amount += row.amount; group.children.set(childId, child);
  }
  return [...groups.values()].sort((a,b) => b.amount-a.amount).map(g => ({ ...g, children: [...g.children.values()].sort((a,b) => b.amount-a.amount) }));
}
