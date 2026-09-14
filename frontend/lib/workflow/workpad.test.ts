import assert from "node:assert/strict";
import { blockText, cloneBlocks, COMMANDS, copyBlocks, depth, enterBlock, imageWidth, indentBlocks, insertAfter, moveBlocks, newBlock, normalize, ordered, selectBlocks, shortcut, slashQuery, subtreeIds, textBlocks } from "./workpad.ts";

let checks = 0;
function test(name: string, action: () => void) { action(); checks++; console.log(`PASS ${name}`); }
const mod = { ctrlKey: true, metaKey: false, shiftKey: false };

test("Enter creates a same-level sibling after a full subtree", () => {
  const root = newBlock("BULLET", "Parent"), child = newBlock("TEXT", "Child", root.id);
  const result = enterBlock(normalize([root, child]), root.id, 3);
  assert.equal(result.blocks[2].parentId, null);
  assert.equal(result.blocks[2].type, "BULLET");
  assert.equal(result.blocks[2].content, "ent");
  assert.equal(result.blocks[0].content, "Par");
  assert.equal(result.blocks[1].parentId, root.id);
});
test("Enter on linked checklist never duplicates WorkTask identity", () => {
  const block = { ...newBlock("CHECKLIST", "Linked"), workTaskId: "task-1" };
  const result = enterBlock([block], block.id, 3);
  assert.equal(result.blocks[0].content, "Linked");
  assert.equal(result.blocks[1].workTaskId, null);
  assert.equal(result.blocks[1].type, "CHECKLIST");
});
test("Tab indents and Shift Tab outdents while keeping children", () => {
  const a = newBlock("TEXT", "A"), b = newBlock("BULLET", "B"), child = newBlock("TEXT", "Child", b.id);
  const indented = indentBlocks(normalize([a, b, child]), [b.id]);
  assert.equal(indented[1].parentId, a.id);
  assert.equal(depth(indented, child.id), 2);
  const outdented = indentBlocks(indented, [b.id], true);
  assert.equal(outdented[1].parentId, null);
  assert.equal(outdented[2].parentId, b.id);
  assert.deepEqual(ordered(outdented).map(b => b.id), outdented.map(b => b.id));
});
test("Bulk indent/outdent retains sibling order", () => {
  const blocks = normalize([newBlock("TEXT", "A"), newBlock("TEXT", "B"), newBlock("TEXT", "C")]);
  const selected = blocks.slice(1).map(b => b.id);
  const nested = indentBlocks(blocks, selected);
  assert.equal(nested[1].parentId, blocks[0].id); assert.equal(nested[2].parentId, blocks[0].id);
  const result = indentBlocks(nested, selected, true);
  assert.deepEqual(result.map(b => b.content), ["A", "B", "C"]);
  assert.ok(result.every(b => b.parentId === null));
});
test("Mandatory keyboard commands including Mac and composition", () => {
  assert.equal(shortcut({ key: "Enter", ...mod }), "toggle");
  assert.equal(shortcut({ key: "Enter", ...mod, shiftKey: true }), "promote");
  assert.equal(shortcut({ key: "Enter", ...mod, ctrlKey: false, metaKey: true, shiftKey: true }), "promote");
  assert.equal(shortcut({ key: "Enter", ...mod, ctrlKey: false, shiftKey: true }), null);
  assert.equal(shortcut({ key: "Enter", ...mod, ctrlKey: false }), "enter");
  assert.equal(shortcut({ key: "Tab", ...mod, ctrlKey: false }), "indent");
  assert.equal(shortcut({ key: "Tab", ...mod, shiftKey: true }), "outdent");
  assert.equal(shortcut({ key: "z", ...mod }), "undo");
  assert.equal(shortcut({ key: "z", ...mod, shiftKey: true }), "redo");
  assert.equal(shortcut({ key: "Enter", ...mod, isComposing: true }), null);
});
test("Shift range and additive block selection", () => {
  const blocks = normalize([newBlock(), newBlock(), newBlock(), newBlock()]);
  const range = selectBlocks(blocks, [], blocks[0].id, blocks[2].id, true, false);
  assert.deepEqual(range, blocks.slice(0, 3).map(b => b.id));
  assert.deepEqual(selectBlocks(blocks, range, blocks[0].id, blocks[1].id, false, true), [blocks[0].id, blocks[2].id]);
  assert.equal(selectBlocks(blocks, range, blocks[0].id, blocks[3].id, false, true).length, 4);
});
test("Copy and paste preserve hierarchy, task reference, completed state and image groups", () => {
  const a = { ...newBlock("CHECKLIST", "Linked"), checked: true, workTaskId: "task-1" };
  const b = newBlock("TEXT", "Notes", a.id), image = newBlock("IMAGE_GROUP", "", b.id);
  image.metadata = { images: [{ id: "image-1", width: 60, caption: "before" }, { id: "image-2", width: 85, caption: "after" }], layout: "row" };
  const copied = copyBlocks(normalize([a, b, image]), [a.id]);
  const pasted = cloneBlocks(copied);
  assert.equal(pasted.length, 3); assert.notEqual(pasted[0].id, a.id);
  assert.equal(pasted[0].workTaskId, "task-1"); assert.equal(pasted[0].checked, true);
  assert.equal(pasted[1].parentId, pasted[0].id); assert.equal(pasted[2].parentId, pasted[1].id);
  assert.deepEqual(pasted[2].metadata, image.metadata);
  pasted[2].metadata.images![0].caption = "changed";
  assert.equal(image.metadata.images![0].caption, "before");
});
test("Copy descendant alone promotes clipboard root without broken parent", () => {
  const a = newBlock(), b = newBlock("TEXT", "child", a.id);
  const copy = copyBlocks([a, b], [b.id]);
  assert.equal(copy.length, 1); assert.equal(copy[0].parentId, null);
});
test("Plain text paste creates one block per line and parses indentation", () => {
  const blocks = textBlocks("Plan\n  - [ ] First\n    evidence\n  - [x] Done\nNext");
  assert.equal(blocks.length, 5); assert.equal(blocks[1].type, "CHECKLIST");
  assert.equal(blocks[1].parentId, blocks[0].id); assert.equal(blocks[2].parentId, blocks[1].id);
  assert.equal(blocks[3].checked, true); assert.equal(blocks[4].parentId, null);
  assert.match(blockText(blocks), /  \[ \] First\n    evidence/);
});
test("Quick command detection and required command coverage", () => {
  assert.equal(slashQuery("", 0), null); assert.equal(slashQuery("/", 1), "");
  assert.equal(slashQuery("notes /ch", 9), "ch"); assert.equal(slashQuery("https://", 8), null);
  assert.deepEqual(COMMANDS.map(c => c[0]), ["text", "bullet", "check", "h1", "h2", "h3", "callout", "image", "divider", "task"]);
});
test("Move selection moves full subtree and refuses circular move", () => {
  const a = newBlock("TEXT", "A"), child = newBlock("TEXT", "child", a.id), b = newBlock("TEXT", "B");
  const blocks = normalize([a, child, b]);
  const moved = moveBlocks(blocks, [a.id], b.id, false);
  assert.deepEqual(moved.map(b => b.content), ["B", "A", "child"]);
  assert.equal(moved[2].parentId, a.id);
  assert.deepEqual(moveBlocks(blocks, [a.id], child.id), blocks);
  assert.equal(subtreeIds(blocks, [a.id]).size, 2);
});
test("Paste at nested block stays at the same hierarchy level", () => {
  const root = newBlock(), child = newBlock("TEXT", "Child", root.id), incoming = newBlock("TEXT", "Paste");
  const result = insertAfter([root, child], child.id, [incoming]);
  assert.equal(result[2].parentId, root.id);
});
test("Image resize maintains supported width boundaries", () => {
  assert.equal(imageWidth(5), 20); assert.equal(imageWidth(250), 100); assert.equal(imageWidth(63.8), 64);
});
test("Source date/block survive clipboard round trip", () => {
  const block = { ...newBlock("TEXT", "Completed yesterday: shipping"), sourceDate: "2026-09-14", sourceBlockId: "source-block" };
  const [pasted] = cloneBlocks(copyBlocks([block], [block.id]));
  assert.equal(pasted.sourceDate, "2026-09-14"); assert.equal(pasted.sourceBlockId, "source-block");
  assert.equal(pasted.type, "TEXT"); assert.equal(pasted.workTaskId, null);
});
console.log(`${checks} targeted Workpad checks passed.`);
