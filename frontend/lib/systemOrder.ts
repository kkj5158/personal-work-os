export const SYSTEM_IDS = ["work", "notes", "diet", "life", "calendar", "workflow", "authoring", "money"] as const;
export type SystemId = typeof SYSTEM_IDS[number];
/** Unknown/retired IDs disappear; newly introduced systems append after the saved order. */
export function normalizeSystemOrder(saved: readonly string[] = [], available: readonly string[] = SYSTEM_IDS): string[] {
  return [...new Set([...saved.filter(id => available.includes(id)), ...available])];
}
export function moveSystem(order: readonly string[], from: string, to: string): string[] {
  const next = [...order], source = next.indexOf(from), destination = next.indexOf(to);
  if (source < 0 || destination < 0) return next;
  next.splice(destination, 0, ...next.splice(source, 1));
  return next;
}
