import type { Category } from "./model";

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
