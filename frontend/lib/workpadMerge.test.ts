import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeWorkpadBlocks, resolveWorkpadConflicts } from "./workpadMerge";
import { ordered } from "./workflow/workpad";
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
  assert.deepEqual(mergeWorkpadBlocks(base, base, remote).blocks, ordered(remote));
  assert.equal(mergeWorkpadBlocks(base, local, local).conflicts.length, 0);
});
test("conflict resolution keeps local conflicts and independent remote edits, additions and deletions", () => {
  const base = [block("a", 0), block("b", 1), block("remove", 2)];
  const local = [{ ...base[0], content: "mine" }, base[1], base[2]];
  const remote = [{ ...base[0], content: "theirs" }, { ...base[1], content: "remote-only" }, block("remote-new", 2)];
  const result = resolveWorkpadConflicts(base, local, remote)!;
  assert.deepEqual(result.map(b => [b.id, b.content]), [["a", "mine"], ["b", "remote-only"], ["remote-new", "remote-new"]]);
  assert.equal(remote[0].content, "theirs", "resolution does not mutate either draft");
  assert.equal(local.length, 3);
});
test("structural conflict resolution requires an explicit document choice", () => {
  const base = [block("a", 0), block("b", 1)];
  assert.equal(resolveWorkpadConflicts(base, [base[1]], [{ ...base[0], content: "remote edit" }, base[1]]), null);
  assert.equal(resolveWorkpadConflicts(base, [...base, block("c", 2)], [...base, block("d", 2)]), null);
});
test("merged and resolved blocks retain depth-first parent order even with sibling-local order values", () => {
  const base = [block("a", 0), block("a-child", 0, "a"), block("a-grandchild", 0, "a-child"), block("b", 1), block("b-child", 0, "b")];
  const local = base.map(b => b.id === "a-child" ? {...b, content: "local"} : b);
  const remote = base.map(b => b.id === "b-child" ? {...b, content: "remote"} : b);
  assert.deepEqual(mergeWorkpadBlocks(base, local, remote).blocks.map(b => b.id), base.map(b => b.id));
  assert.deepEqual(resolveWorkpadConflicts(base, local, remote)?.map(b => b.id), base.map(b => b.id));
  const competing = remote.map(b => b.id === "a-child" ? {...b, content: "competing"} : b);
  const resolved = resolveWorkpadConflicts(base, local, competing)!;
  assert.deepEqual(resolved.map(b => b.id), base.map(b => b.id));
  assert.equal(resolved.find(b => b.id === "a-child")?.content, "local");
  assert.equal(resolved.find(b => b.id === "b-child")?.content, "remote");
});
test("delete/edit, concurrent sibling insertion, orphaning and cycles require explicit resolution", () => {
  const base = [block("a", 0), block("b", 1)];
  assert.ok(mergeWorkpadBlocks(base, [base[1]], [{ ...base[0], content: "edit" }, base[1]]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [...base, block("c", 2)], [...base, block("d", 2)]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [base[1]], [...base, block("child", 0, "a")]).conflicts.length);
  assert.ok(mergeWorkpadBlocks(base, [{...base[0], parentId:"b"},base[1]], [base[0],{...base[1],parentId:"a"}]).conflicts.length);
});
