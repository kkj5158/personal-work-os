import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkTask } from "../../lib/api/workflow";
import { defaultTodoPreferences, reorderIds, moveTask, orderedGroupIds, progress, visibleTasks } from "./projects-todo-utils";

const task = (id: string, patch: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, ...patch });

test("default To-do view is project grouped and ranks in-progress, due dates and priority without mutating tasks", () => {
  const rows = [task("undated"), task("done", { status: "DONE", dueDate: "2026-09-01" }), task("later", { dueDate: "2026-09-18" }), task("early", { dueDate: "2026-09-16" }), task("urgent", { dueDate: "2026-09-16", priority: "HIGH" }), task("doing", { status: "DOING" })];
  assert.equal(defaultTodoPreferences.groupMode, "PROJECT");
  assert.equal(defaultTodoPreferences.rememberCollapse, true);
  assert.deepEqual(visibleTasks(rows, defaultTodoPreferences).map(row => row.id), ["doing", "urgent", "early", "later", "undated", "done"]);
  assert.deepEqual(rows.map(row => row.id), ["undated", "done", "later", "early", "urgent", "doing"]);
});

test("display and sort preferences filter completion and fully undated tasks", () => {
  const rows = [task("undated"), task("startOnly", { startDate: "2026-09-14" }), task("dueOnly", { dueDate: "2026-09-15" }), task("done", { status: "DONE", startDate: "2026-09-13" })];
  assert.deepEqual(visibleTasks(rows, { ...defaultTodoPreferences, showCompleted: false, showUndated: false, sort: "START_DATE" }).map(row => row.id), ["startOnly", "dueOnly"]);
  assert.deepEqual(visibleTasks(rows, { ...defaultTodoPreferences, sort: "DUE_DATE" }).map(row => row.id), ["dueOnly", "done", "startOnly", "undated"]);
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
