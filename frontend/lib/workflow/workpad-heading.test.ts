import { test } from "node:test";
import assert from "node:assert/strict";
import { blockText, headingNumbers, headingStart, moveStructural, newBlock, normalize, textBlocks, type Block } from "./workpad";
import { edgeStep, resolveDropTarget } from "./dnd";

const heading = (type: "H1" | "H2" | "H3", content: string, numbered = false, parentId: string | null = null): Block => {
  const block = newBlock(type, content, parentId); if (numbered) block.metadata = { numbered: true }; return block;
};

test("headingStart: numbered-list + heading marker, and a number typed at the start of a heading", () => {
  assert.deepEqual(headingStart({ type: "NUMBERED" }, "## Scope"), { type: "H2", content: "Scope", numbered: true });
  assert.deepEqual(headingStart({ type: "H3" }, "2. Detail"), { type: "H3", content: "Detail", numbered: true });
  assert.equal(headingStart({ type: "NUMBERED" }, "- item"), null, "non-heading markers keep the list semantics");
  assert.equal(headingStart({ type: "TEXT" }, "## x"), null, "plain Markdown is handled by markdownStart");
});

test("headingNumbers: per level, body text keeps the run, un-numbered same level restarts, higher level resets deeper", () => {
  const a = heading("H2", "A", true), body = newBlock("TEXT", "body"), b = heading("H2", "B", true);
  const sub1 = heading("H3", "a", true), sub2 = heading("H3", "b", true), c = heading("H2", "C", true), sub3 = heading("H3", "c", true);
  const plain = heading("H2", "Plain"), d = heading("H2", "D", true);
  const blocks = normalize([a, body, b, sub1, sub2, c, sub3, plain, d]);
  const numbers = headingNumbers(blocks);
  assert.deepEqual([a, b, sub1, sub2, c, sub3, d].map(block => numbers.get(block.id)), [1, 2, 1, 2, 3, 1, 1]);
  assert.equal(numbers.has(plain.id), false);
});

test("reordering numbered headings renumbers; text round-trip keeps numbered headings as headings", () => {
  const a = heading("H2", "First", true), b = heading("H2", "Second", true);
  const moved = moveStructural(normalize([a, b]), [b.id], -1);
  assert.deepEqual(moved.map(block => [block.content, headingNumbers(moved).get(block.id)]), [["Second", 1], ["First", 2]]);
  const text = blockText(normalize([a, b]));
  assert.equal(text, "1. ## First\n2. ## Second");
  const parsed = textBlocks(text);
  assert.deepEqual(parsed.map(block => [block.type, block.content, block.metadata.numbered]), [["H2", "First", true], ["H2", "Second", true]]);
});

test("DnD polish: nearest accepting target wins; a non-accepting target is shown as rejected; edge scroll speed", () => {
  const doc = { attrs: new Map<object, Record<string, string>>() };
  const el = (attrs: Record<string, string>) => { const node = { hasAttribute: (name: string) => name in attrs, getAttribute: (name: string) => attrs[name] ?? null }; doc.attrs.set(node, attrs); return node as unknown as Element; };
  const row = el({ "data-dnd-target": "before", "data-dnd-accept": "application/workflow-task" });
  const section = el({ "data-dnd-target": "inside", "data-dnd-accept": "application/workflow-task application/workflow-phase" });
  const plain = el({});
  assert.deepEqual(resolveDropTarget([plain, row, section], ["application/workflow-task"]), { element: row, state: "valid" });
  assert.deepEqual(resolveDropTarget([plain, row, section], ["application/workflow-phase"]), { element: section, state: "valid" }, "a Phase skips Task rows and targets the section");
  assert.deepEqual(resolveDropTarget([row], ["Files"]), { element: row, state: "reject" });
  assert.equal(resolveDropTarget([plain], ["application/workflow-task"]), null);
  assert.ok(edgeStep(5, 0, 800) < 0 && edgeStep(795, 0, 800) > 0 && edgeStep(400, 0, 800) === 0);
  assert.ok(Math.abs(edgeStep(1, 0, 800)) > Math.abs(edgeStep(50, 0, 800)), "faster closer to the edge");
});
