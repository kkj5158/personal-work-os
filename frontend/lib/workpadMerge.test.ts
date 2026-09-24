import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeWorkpadBlocks } from "./workpadMerge";
import type { WorkpadBlock } from "./api/workflow";
const block = (id: string, order: number, parentId: string | null = null): WorkpadBlock => ({ id, order, parentId, type: "TEXT", content: id, checked: false, workTaskId: null, sourceBlockId: null, sourceDate: null, metadata: {} });
test("separate blocks merge while competing text changes preserve the full local draft", () => {
  const base = [block("a", 0), block("b", 1)];
  const local = [{ ...base[0], content: "mine" }, base[1]];
  const remote = [base[0], { ...base[1], content: "theirs" }];
  const merged = mergeWorkpadBlocks(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.deepEqual(merged.blocks.map(b => b.content), ["mine", "theirs"]);
  const conflicting = mergeWorkpadBlocks(base, local, [{ ...base[0], content: "other" }, base[1]]);
  assert.equal(conflicting.blocks, local);
  assert.equal(conflicting.conflicts[0].blockId, "a");
  assert.equal(conflicting.conflicts[0].reason, "content");
  assert.deepEqual(base.map(b => b.content), ["a", "b"], "inputs are not mutated");
});
test("clean reload, identical changes and disjoint subtree additions merge", () => {
  const base = [block("a", 0), block("b", 1)];
  const local = [...base, block("child-a", 0, "a")];
  const remote = [...base, block("child-b", 0, "b")];
  assert.equal(mergeWorkpadBlocks(base, local, remote).conflicts.length, 0);
  assert.deepEqual(mergeWorkpadBlocks(base, base, remote).blocks, [...remote].sort((a,b)=>a.order-b.order || a.id.localeCompare(b.id)));
  assert.equal(mergeWorkpadBlocks(base, local, local).conflicts.length, 0);
});
test("delete/edit, concurrent sibling insertion, orphaning and cycles require explicit resolution", () => {
  const base = [block("a", 0), block("b", 1)];
  assert.ok(mergeWorkpadBlocks(base, [base[1]], [{ ...base[0], content: "edit" }, base[1]]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [...base, block("c", 2)], [...base, block("d", 2)]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [base[1]], [...base, block("child", 0, "a")]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [{...base[0], parentId:"b"},base[1]], [base[0],{...base[1],parentId:"a"}]).conflicts.length);
});
