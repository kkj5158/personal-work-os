import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkTask } from "../../lib/api/workflow";
import { defaultTodoPreferences, reorderIds, moveTask, orderedGroupIds, progress } from "./projects-todo-utils";

const task = (id: string, patch: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, ...patch });

test("default To-do view is project grouped, remembers collapse and sorts by recent update (explorer rules: lib/workflow/explorer.test.ts)", () => {
  assert.equal(defaultTodoPreferences.groupMode, "PROJECT");
  assert.equal(defaultTodoPreferences.rememberCollapse, true);
  assert.equal(defaultTodoPreferences.sort, "UPDATED");
});

test("presentation group reordering includes new projects, drops stale IDs and preserves domain order", () => {
  const domain = ["p1", "p2", "p3"];
  const groups = orderedGroupIds(domain, ["deleted", "p2", "p2"]);
  assert.deepEqual(groups, ["p2", "p1", "p3", "unassigned"]);
  assert.deepEqual(reorderIds(groups, "p3", "p2"), ["p3", "p2", "p1", "unassigned"]);
  assert.deepEqual(domain, ["p1", "p2", "p3"]);
  assert.deepEqual(reorderIds(["first", "second"], "first", "second"), ["second", "first"]);
});

test("task drag moves same identity across phases and Uncategorized without modifying dates or unrelated tasks", () => {
  const moved = task("moved", { phaseId: "phase1", order: 7, startDate: "2026-08-01", dueDate: "2027-01-01" });
  const rows = [moved, task("direct", { order: 0 }), task("other", { phaseId: "phase1", order: 9 })];
  const patches = moveTask(rows, "moved", "p1", null, "direct");
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[0], { ...moved, phaseId: null, order: 0 });
  assert.equal(patches[1].id, "direct");
  assert.equal(patches[1].order, 1);
  assert.equal(rows[0].phaseId, "phase1");
  assert.equal(patches.some(row => row.id === "other"), false);
  assert.deepEqual(moveTask(rows, "moved", "p1", "phase1", "moved"), []);
  assert.deepEqual(moveTask(rows, "missing", "p1", null), []);
  assert.deepEqual(moveTask([task("first", { order: 0 }), task("second", { order: 1 })], "first", "p1", null, "second").map(row => row.id), ["second", "first"]);
});

test("progress is derived exclusively from completed tasks", () => {
  assert.deepEqual(progress([]), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(progress([task("a"), task("b", { status: "DOING" }), task("c", { status: "DONE" })]), { done: 1, total: 3, percent: 33 });
});
