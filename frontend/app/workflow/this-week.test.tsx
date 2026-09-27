import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { FocusSlot, PlanDay, Project, WeekGoal, WeekView, WorkTask } from "../../lib/api/workflow";

/**
 * S04/S05 over a fake backend that follows WorkflowPlanningService semantics: selection ∪ plan days, merge on move,
 * full-membership reorder scopes, week-scoped order, revision-checked focus/goals.
 */
test("This Week plan + Weekday board: inclusion, selection, week-only order, focus/goals, board DnD, undo, cross-window", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/week", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { ApiError } = await import("../../lib/api/client");
  const { ENTITY_CHANGE_STORAGE_KEY } = await import("../../lib/windowSync");
  const { mondayOf, addDaysKey } = await import("../../lib/workflow/store");
  const { toDateKey } = await import("../../lib/date");
  const { seoulToday } = await import("../../lib/seoulDate");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: ThisWeek } = await import("./ThisWeek");
  const original = { ...workflowApi };
  const W = mondayOf(toDateKey(seoulToday())), D = (i: number) => addDaysKey(W, i);
  const projects: Project[] = [
    { id: "p1", title: "Alpha", status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: 0, revision: 0 },
    { id: "p2", title: "Beta", status: "ACTIVE", startDate: null, endDate: null, color: "#8250df", memo: null, order: 1, revision: 0 },
  ];
  const make = (id: string, title: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, ...extra });
  let tasks: WorkTask[] = [make("a1", "A1", { order: 0 }), make("a2", "A2", { order: 1 }), make("a3", "A3", { order: 2, deadlineDate: D(6) }), make("b1", "B1", { projectId: "p2" }), make("n1", "N1", { projectId: null })];
  let planDays: PlanDay[] = [{ taskId: "a1", date: D(1), order: 0 }, { taskId: "a3", date: D(0), order: 0 }, { taskId: "a3", date: D(3), order: 0 }];
  type Stored = { projects: { projectId: string; order: number; scopeLine: string | null }[]; tasks: { taskId: string; order: number }[]; revision: number; focus: FocusSlot[]; goals: WeekGoal[] };
  const weeks: Record<string, Stored> = {};
  const stored = (start: string) => weeks[start] ??= { projects: [], tasks: [], revision: 0, focus: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [] };
  const view = (start: string): WeekView => {
    const w = stored(start), end = addDaysKey(start, 6);
    const inWeek = planDays.filter(p => p.date >= start && p.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const items = new Map<string, WeekView["tasks"][number]>();
    for (const t of [...w.tasks].sort((a, b) => a.order - b.order)) items.set(t.taskId, { taskId: t.taskId, selected: true, selectionOrder: t.order, plannedDates: [] });
    for (const p of inWeek) { if (!items.has(p.taskId)) items.set(p.taskId, { taskId: p.taskId, selected: false, selectionOrder: null, plannedDates: [] }); items.get(p.taskId)!.plannedDates.push(p.date); }
    return structuredClone({ weekStart: start, revision: w.revision, focusSlots: w.focus, goals: w.goals, projects: [...w.projects].sort((a, b) => a.order - b.order), tasks: [...items.values()], planDays: inWeek });
  };
  const calls: { kind: string; args: unknown[] }[] = [];
  let gets = 0, failMove = false;
  const upsert = (taskId: string, date: string) => { if (planDays.some(p => p.taskId === taskId && p.date === date)) return false; planDays.push({ taskId, date, order: Math.max(-1, ...planDays.filter(p => p.date === date).map(p => p.order)) + 1 }); return true; };
  const of = (taskId: string) => structuredClone(planDays.filter(p => p.taskId === taskId).sort((a, b) => a.date.localeCompare(b.date)));
  workflowApi.get = async () => { gets++; return structuredClone({ projects, phases: [], tasks, planDays }); };
  workflowApi.getPreferences = async () => ({});
  workflowApi.resources = async () => [];
  workflowApi.taskRecords = async () => [];
  workflowApi.week = async start => view(start);
  workflowApi.includeProject = async (start, projectId, scopeLine) => { calls.push({ kind: "include", args: [start, projectId, scopeLine] }); const w = stored(start); const hit = w.projects.find(p => p.projectId === projectId); if (hit) { if (scopeLine !== undefined) hit.scopeLine = scopeLine; } else w.projects.push({ projectId, order: w.projects.length, scopeLine: scopeLine ?? null }); return view(start); };
  workflowApi.excludeProject = async (start, projectId) => { calls.push({ kind: "exclude", args: [start, projectId] }); const w = stored(start); w.projects = w.projects.filter(p => p.projectId !== projectId); return view(start); };
  workflowApi.selectTask = async (start, taskId) => { calls.push({ kind: "select", args: [start, taskId] }); const w = stored(start); if (!w.tasks.some(t => t.taskId === taskId)) w.tasks.push({ taskId, order: Math.max(-1, ...w.tasks.map(t => t.order)) + 1 }); return view(start); };
  workflowApi.unselectTask = async (start, taskId) => { calls.push({ kind: "unselect", args: [start, taskId] }); const w = stored(start); w.tasks = w.tasks.filter(t => t.taskId !== taskId); return view(start); };
  workflowApi.saveWeekContent = async (start, revision, focusSlots, goals) => {
    calls.push({ kind: "content", args: [start, revision, structuredClone(focusSlots), structuredClone(goals)] });
    const w = stored(start); if (revision !== w.revision) throw new ApiError(409, "Week changed");
    assert.equal(focusSlots.length, 3, "exactly three focus slots are always sent");
    w.revision++; w.focus = focusSlots.map((slot, i) => ({ ...slot, slot: i })); w.goals = goals.map((g, i) => ({ ...g, id: `g${i}`, order: i })); return view(start);
  };
  workflowApi.reorder = async (scope, ids) => {
    calls.push({ kind: "reorder", args: [scope, [...ids]] });
    const [kind, key] = [scope.slice(0, scope.indexOf(":")), scope.slice(scope.indexOf(":") + 1)];
    if (kind === "week-projects") { const w = stored(key); assert.deepEqual([...ids].sort(), w.projects.map(p => p.projectId).sort(), "full membership"); w.projects.forEach(p => { p.order = ids.indexOf(p.projectId); }); }
    else if (kind === "week-tasks") { const w = stored(key); assert.deepEqual([...ids].sort(), w.tasks.map(t => t.taskId).sort(), "full membership"); w.tasks.forEach(t => { t.order = ids.indexOf(t.taskId); }); }
    else if (kind === "day") { assert.deepEqual([...ids].sort(), planDays.filter(p => p.date === key).map(p => p.taskId).sort(), "full day membership"); planDays = planDays.map(p => p.date === key ? { ...p, order: ids.indexOf(p.taskId) } : p); }
    else throw new Error(`unexpected scope ${scope}`);
    return ids;
  };
  workflowApi.addPlanDay = async (id, date) => { calls.push({ kind: "addPlan", args: [id, date] }); upsert(id, date); return of(id); };
  workflowApi.removePlanDay = async (id, date) => { calls.push({ kind: "removePlan", args: [id, date] }); planDays = planDays.filter(p => !(p.taskId === id && p.date === date)); return of(id); };
  workflowApi.movePlanDay = async (taskId, from, to) => {
    calls.push({ kind: "move", args: [taskId, from, to] });
    if (failMove) { failMove = false; throw new ApiError(500, "Network down"); }
    planDays = planDays.filter(p => !(p.taskId === taskId && p.date === from)); const merged = !upsert(taskId, to); return { merged, planDays: of(taskId) };
  };
  workflowApi.changeStatus = async (id, _revision, change) => { tasks = tasks.map(t => t.id === id ? { ...t, status: change.status, previousStatus: change.status === "DONE" ? t.status : t.status, revision: (t.revision ?? 0) + 1 } : t); return structuredClone(tasks.find(t => t.id === id)!); };
  workflowApi.saveTask = async input => { const saved = { ...input, id: `new${tasks.length}`, revision: 0 } as WorkTask; tasks.push(saved); return structuredClone(saved); };
  const root = createRoot(document.getElementById("root")!);
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const byLabel = <T extends Element>(label: string) => $<T>(`[aria-label="${label}"]`)!;
  const settle = (ms = 20) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const click = async (node: Element | null | undefined) => { assert.ok(node, "clickable node exists"); await act(async () => { node!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
  const type = async (node: HTMLInputElement | HTMLTextAreaElement, value: string) => { await act(async () => { const proto = node instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); };
  const submit = async (form: Element) => { await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); await settle(); };
  const drop = async (target: Element, payload: object) => { await act(async () => { const event = new dom.window.Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: { types: ["application/x-wf-board-card"], getData: (t: string) => t === "application/x-wf-board-card" ? JSON.stringify(payload) : "" } }); target.dispatchEvent(event); }); await settle(40); };
  const row = (id: string) => $<HTMLElement>(`.wf-week-row[data-task-id="${id}"]`);
  const lastContent = () => calls.filter(c => c.kind === "content").at(-1)!.args as [string, number, FocusSlot[], WeekGoal[]];
  const buttonText = (text: string, scope: ParentNode = document) => [...scope.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
  try {
    await act(async () => root.render(<WorkflowProvider><ThisWeek/></WorkflowProvider>));
    await settle(60);
    // Week range + planned-only rows exist before any inclusion (union query).
    assert.ok(document.body.textContent!.includes(`${Number(W.slice(5, 7))}월 ${Number(W.slice(8))}일 (월)`), "Monday-based week label");
    assert.equal(row("a3")!.classList.contains("is-planned"), true, "plan-day-only Task shows as 날짜만");
    assert.equal(document.querySelectorAll('.wf-week-row[data-task-id="a3"]').length, 1, "one row for a Task planned on two days");
    assert.match(row("a3")!.querySelector('[aria-label="A3 계획 날짜"]')!.textContent!, /\+1/);
    // Project inclusion never selects Tasks.
    await click(byLabel("Alpha 이번 주 포함"));
    assert.equal(byLabel("Alpha 이번 주 포함").getAttribute("aria-pressed"), "true");
    assert.equal(stored(W).tasks.length, 0, "including a Project selects no Task");
    await click(buttonText("전체 선택")); assert.deepEqual(stored(W).projects.map(p => p.projectId).sort(), ["p1", "p2"]);
    await click(buttonText("전체 해제")); assert.equal(stored(W).projects.length, 0);
    await click(buttonText("전체 선택"));
    // Week-only Project order; canonical Project order untouched.
    await click(byLabel("Beta 위로"));
    assert.deepEqual(calls.filter(c => c.kind === "reorder").at(-1)!.args, [`week-projects:${W}`, ["p2", "p1"]]);
    assert.deepEqual(projects.map(p => [p.id, p.order]), [["p1", 0], ["p2", 1]], "projects.sort_order unchanged");
    assert.deepEqual([...document.querySelectorAll(".wf-week-section h2")].slice(0, 2).map(h => h.textContent), ["Beta", "Alpha"]);
    // Explicit selection; kinds; week-only Task order.
    await click([...byLabel("Alpha 이번 주").querySelectorAll(".wf-week-pick .wf-link")].find(link => link.textContent!.includes("다른 작업")));
    await click(byLabel("A2 이번 주 선택")); await click(byLabel("A1 이번 주 선택"));
    assert.equal(row("a2")!.classList.contains("is-selected") || row("a2")!.querySelector(".wf-week-kind")!.textContent === "집중", true);
    assert.equal(row("a1")!.querySelector(".wf-week-kind")!.textContent, "집중 · 날짜", "selected + planned = both");
    await click(byLabel("A1 위로"));
    assert.deepEqual(calls.filter(c => c.kind === "reorder").at(-1)!.args, [`week-tasks:${W}`, ["a1", "a2"]]);
    assert.deepEqual(tasks.filter(t => t.projectId === "p1").map(t => t.order), [0, 1, 2], "work_tasks.sort_order unchanged");
    // Unselect keeps plan days, with the quiet message.
    await click(byLabel("A1 이번 주 선택 해제"));
    assert.match(document.querySelector(".wf-week-notice")!.textContent!, /집중 선택은 해제됨, 날짜 배치는 유지/);
    assert.ok(planDays.some(p => p.taskId === "a1" && p.date === D(1)), "plan day preserved");
    assert.equal(row("a1")!.querySelector(".wf-week-kind")!.textContent, "날짜만");
    await click(buttonText("되돌리기")); assert.ok(stored(W).tasks.some(t => t.taskId === "a1"), "undo re-selects");
    // Project-less work lives in 기타 without a fake Project.
    assert.ok(byLabel("기타 · 프로젝트 없음 이번 주"));
    // Exactly three Focus slots: empty allowed, typed, reordered.
    assert.equal(document.querySelectorAll(".wf-focus-slot").length, 3);
    await type(byLabel<HTMLInputElement>("집중 2 제목"), "Ship the week view");
    await settle(900);
    assert.deepEqual(lastContent()[2].map(s => s.title), ["", "Ship the week view", ""], "empty titles allowed, three slots");
    await click(byLabel("집중 2 위로"));
    assert.deepEqual(lastContent()[2].map(s => s.title), ["Ship the week view", "", ""], "focus slots reorder");
    // Weekly Goals: add, inline edit, reorder, check — never completing a Task.
    await type(byLabel<HTMLInputElement>("새 목표"), "Goal one"); await submit(byLabel("새 목표").closest("form")!);
    await type(byLabel<HTMLInputElement>("새 목표"), "Goal two"); await submit(byLabel("새 목표").closest("form")!);
    await type(byLabel<HTMLInputElement>("목표 1"), "Goal one edited"); await settle(900);
    await click(byLabel("목표 2 위로"));
    assert.deepEqual(lastContent()[3].map(g => g.text), ["Goal two", "Goal one edited"]);
    const statuses = tasks.map(t => t.status).join();
    await click(byLabel("목표 1 달성"));
    assert.equal(lastContent()[3][0].checked, true); assert.equal(tasks.map(t => t.status).join(), statuses, "goal check completes no Task");
    // Cross-window: another window changes the week; this clean window converges.
    stored(W).focus[2] = { slot: 2, title: "From window B", memo: "" }; stored(W).revision++;
    await act(async () => { dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: ENTITY_CHANGE_STORAGE_KEY, newValue: JSON.stringify({ entityType: "workflow", entityId: "data", revision: 9, windowInstanceId: "other", eventId: "e1" }) })); });
    await settle(300);
    assert.equal(byLabel<HTMLInputElement>("집중 3 제목").value, "From window B", "clean window converges");
    // Week navigation: next week is its own record; current week unchanged.
    await click(byLabel("다음 주"));
    await settle(40);
    assert.match(window.location.search, new RegExp(`week=${addDaysKey(W, 7)}`));
    assert.equal(byLabel("Alpha 이번 주 포함").getAttribute("aria-pressed"), "false", "next week starts empty, nothing copied");
    await click(byLabel("이전 주")); await settle(40);
    assert.equal(byLabel("Alpha 이번 주 포함").getAttribute("aria-pressed"), "true");

    // ---------- S05 board ----------
    await click(buttonText("보드 보기")); await settle(40);
    const col = (i: number) => document.querySelectorAll(".wf-board-col")[i]!;
    assert.equal(document.querySelectorAll(".wf-board-col").length, 7, "Monday–Sunday");
    assert.ok(col(0).querySelector('[data-task-id="a3"]') && col(3).querySelector('[data-task-id="a3"]'), "same Task on two days");
    assert.ok(byLabel("이번 주 날짜 미정").querySelector('[data-task-id="a2"]'), "selected without a date is unscheduled");
    // Mon → Wed moves only that placement; deadline and the other placement stay.
    await drop(col(2), { taskId: "a3", from: D(0) });
    assert.deepEqual(calls.filter(c => c.kind === "move").at(-1)!.args, ["a3", D(0), D(2)]);
    assert.deepEqual(of("a3").map(p => p.date), [D(2), D(3)]); assert.equal(tasks.find(t => t.id === "a3")!.deadlineDate, D(6), "deadline unchanged");
    assert.ok(stored(W).tasks.every(t => t.taskId !== "a3"), "weekly selection unchanged");
    // Collision merges instead of duplicating.
    await drop(col(3), { taskId: "a3", from: D(2) });
    assert.deepEqual(of("a3").map(p => p.date), [D(3)]); assert.match(document.querySelector(".wf-week-notice")!.textContent!, /합쳤습니다/);
    await click(buttonText("되돌리기")); assert.deepEqual(of("a3").map(p => p.date), [D(2), D(3)], "undo restores the merged source");
    // Unscheduled → day creates; day → unscheduled removes only that date.
    await drop(col(1), { taskId: "a2", from: null });
    assert.ok(planDays.some(p => p.taskId === "a2" && p.date === D(1)));
    await drop(byLabel("이번 주 날짜 미정"), { taskId: "a3", from: D(3) });
    assert.deepEqual(of("a3").map(p => p.date), [D(2)], "only that placement removed");
    // Within-day reorder uses plan-day order.
    const orderBefore = tasks.map(t => `${t.id}:${t.order}`).join();
    assert.deepEqual([...col(1).querySelectorAll(".wf-board-card")].map(card => card.getAttribute("data-task-id")), ["a1", "a2"]);
    await drop(col(1).querySelector('[data-task-id="a1"]')!, { taskId: "a2", from: D(1) });
    const dayCall = calls.filter(c => c.kind === "reorder").at(-1)!.args as [string, string[]];
    assert.equal(dayCall[0], `day:${D(1)}`); assert.deepEqual(dayCall[1], ["a2", "a1"]);
    assert.deepEqual([...col(1).querySelectorAll(".wf-board-card")].map(card => card.getAttribute("data-task-id")), ["a2", "a1"], "within-day order persisted");
    assert.equal(tasks.map(t => `${t.id}:${t.order}`).join(), orderBefore, "canonical Task order unchanged by day order");
    // Failure: state unchanged, error shown.
    failMove = true; const before = JSON.stringify(planDays);
    await drop(col(4), { taskId: "a3", from: D(2) });
    assert.equal(JSON.stringify(planDays), before); assert.match(document.querySelector(".wf-week-notice.is-error")!.textContent!, /Network down/);
    // Keyboard/menu alternative.
    await click(byLabel("이번 주 날짜 미정").querySelector('[aria-label="A2 날짜"]') ?? col(1).querySelector('[aria-label="A2 날짜"]'));
    await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.startsWith("+")));
    assert.equal(planDays.filter(p => p.taskId === "a2").length, 2, "menu adds another day without cloning the Task");
    // Completed Task stays the same card with done styling.
    await click(col(1).querySelector('[aria-label="A1 완료"]'));
    await settle(40);
    assert.ok(col(1).querySelector('.wf-board-card.is-done[data-task-id="a1"]'));
    assert.ok(gets > 0);
  } finally { Object.assign(workflowApi, original); await act(async () => root.unmount()); dom.window.close(); }
});
