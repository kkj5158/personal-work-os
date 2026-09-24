import type { WorkpadBlock } from "./api/workflow";

export type BlockConflict = {
  blockId: string;
  reason: "content" | "structure";
  base?: WorkpadBlock;
  local?: WorkpadBlock;
  remote?: WorkpadBlock;
};
// Object key insertion order is not part of the block data contract.
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
const equal = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Three-way merge with stable IDs. A conflict never replaces the local draft.
 * Concurrent incompatible moves/additions in one sibling list require a choice;
 * independent block content changes and disjoint tree changes merge normally. */
export function mergeWorkpadBlocks(base: WorkpadBlock[], local: WorkpadBlock[], remote: WorkpadBlock[]): { blocks: WorkpadBlock[]; conflicts: BlockConflict[] } {
  const maps = [base, local, remote].map(blocks => new Map(blocks.map(block => [block.id, block])));
  const [before, mine, theirs] = maps;
  const conflicts = new Map<string, BlockConflict>();
  const conflict = (id: string, reason: BlockConflict["reason"]) => conflicts.set(id, { blockId: id, reason, base: before.get(id), local: mine.get(id), remote: theirs.get(id) });
  for (let index = 0; index < maps.length; index++) {
    if (maps[index].size !== [base, local, remote][index].length) for (const block of [base, local, remote][index]) conflict(block.id, "structure");
  }
  const merged = new Map<string, WorkpadBlock>();
  for (const id of new Set([...before.keys(), ...mine.keys(), ...theirs.keys()])) {
    const b = before.get(id), l = mine.get(id), r = theirs.get(id);
    let result: WorkpadBlock | undefined;
    if (equal(l, r)) result = l;
    else if (equal(l, b)) result = r;
    else if (equal(r, b)) result = l;
    else { conflict(id, !l || !r || l.parentId !== r.parentId || l.order !== r.order ? "structure" : "content"); result = l; }
    if (result) merged.set(id, result);
  }
  // Structural intent is compared per parent, excluding content changes.
  const parents = new Set([null, ...base.map(b => b.parentId), ...local.map(b => b.parentId), ...remote.map(b => b.parentId)]);
  const siblings = (blocks: WorkpadBlock[], parent: string | null) => blocks.filter(b => b.parentId === parent).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(b => b.id);
  for (const parent of parents) {
    const b = siblings(base, parent), l = siblings(local, parent), r = siblings(remote, parent);
    if (!equal(b, l) && !equal(b, r) && !equal(l, r)) for (const id of new Set([...l, ...r])) conflict(id, "structure");
  }
  // Deleting a parent while the other side adds a child must not orphan content.
  for (const block of merged.values()) {
    const visited = new Set([block.id]);
    let parent = block.parentId;
    while (parent) {
      if (visited.has(parent) || !merged.has(parent)) { conflict(block.id, "structure"); break; }
      visited.add(parent); parent = merged.get(parent)!.parentId;
    }
  }
  return { blocks: conflicts.size ? local : [...merged.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)), conflicts: [...conflicts.values()] };
}
