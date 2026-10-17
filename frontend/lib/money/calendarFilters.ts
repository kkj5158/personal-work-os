import type { Category } from "./model";
import { categoryIndex } from "./categories";

/** Calendar filters use the existing subtree / direct-category wire IDs. */
export function toggleCalendarCategory(categories: Category[], value: string[] | null, id: string): string[] {
  const tree = categoryIndex(categories), direct = id.startsWith("direct:"), category = tree.byId.get(direct ? id.slice(7) : id);
  if (!category) {
    const next = new Set(value ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return [...next];
  }
  const rootId = category.parentId || category.id;
  const buckets = [`direct:${rootId}`, ...(tree.children.get(rootId) ?? []).map(child => child.id)];
  const next = new Set(value ?? []);
  if (!direct && !category.parentId) {
    const complete = next.has(rootId) || buckets.every(bucket => next.has(bucket));
    next.delete(rootId); buckets.forEach(bucket => next.delete(bucket));
    if (!complete) next.add(rootId);
  } else {
    if (next.delete(rootId)) buckets.forEach(bucket => next.add(bucket));
    if (next.has(id)) next.delete(id); else next.add(id);
  }
  return [...next];
}

export function calendarCategorySelected(categories: Category[], value: string[] | null, id: string): boolean {
  if (value === null) return false;
  const tree = categoryIndex(categories), direct = id.startsWith("direct:"), category = tree.byId.get(direct ? id.slice(7) : id);
  if (!category) return value.includes(id);
  if (direct || category.parentId) return value.includes(id) || value.includes(category.parentId || category.id);
  return value.includes(id) || [`direct:${id}`, ...(tree.children.get(id) ?? []).map(child => child.id)].every(bucket => value.includes(bucket));
}
