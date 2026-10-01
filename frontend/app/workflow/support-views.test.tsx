import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { PlanDay, Project, StatusChange, TodoPreferences, WeekView, WorkTask } from "../../lib/api/workflow";

/**
 * S07 All To-dos + S08 Waiting over a fake backend that follows WorkflowService semantics:
 * status via the lifecycle command (resume clears live waiting fields, keeps identity), revisioned PATCH with 409.
 */
test("S07 filters / sort / archive and S08 waiting create, flag, extend, resume, Add to Today, conflict", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/todo", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { ApiError } = await import("../../lib/api/client");
  const { toDateKey } = await import("../../lib/date");
  const { seoulToday } = await import("../../lib/seoulDate");
  const { mondayOf, addDaysKey } = await import("../../lib/workflow/store");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: Todo } = await import("./Todo");
  const { default: Waiting } = await import("./Waiting");
  const original = { ...workflowApi };
  const today = toDateKey(seoulToday()), W = mondayOf(today);
  const projects: Project[] = [
    { id: "p1", title: "Alpha", status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: 0, revision: 0, groupId: "g-life" },
    { id: "p2", title: "Beta", status: "PAUSED", startDate: null, endDate: null, color: "#8250df", memo: null, order: 1, revision: 0 },
    { id: "p3", title: "Gamma", status: "READY", startDate: null, endDate: null, color: "#1a7f37", memo: null, order: 5, revision: 0, groupId: "g-work" },
  ];
  // Projects page order: Work (Gamma) → Life (Alpha) → 그룹 없음 (Beta). Project.order alone would say Alpha, Beta, Gamma.
  const groups = [{ id: "g-life", name: "Life", order: 1, revision: 0 }, { id: "g-work", name: "Work", order: 0, revision: 0 }];
  let seq = 0;
  const make = (id: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title: id, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, updatedAt: `2026-09-${String(10 + ++seq).padStart(2, "0")}T00:00:00Z`, ...extra });
  let tasks: WorkTask[] = [
    make("A-high-todo", { priority: "HIGH", deadlineDate: addDaysKey(today, 9), dueDate: addDaysKey(today, -30) }),
    make("B-low-doing", { status: "DOING", priority: "LOW", deadlineDate: addDaysKey(today, 2) }),
    make("C-high-waiting", { status: "WAITING", priority: "HIGH", projectId: null, waitingReason: "QA 결과", waitingCheckDate: addDaysKey(today, 5) }),
    make("D-done-beta", { status: "DONE", projectId: "p2" }),
    make("E-archived", { archivedAt: "2026-09-20T00:00:00Z" }),
    make("F-week", { dueDate: addDaysKey(today, -100) }),
  ];
  const planDays: PlanDay[] = [{ taskId: "F-week", date: addDaysKey(W, 2), order: 0 }];
  let preferences: TodoPreferences = { groupMode: "FLAT", projectOrder: [], sort: "DUE_DATE", showCompleted: true, showUndated: true, rememberCollapse: false, collapsedProjects: [] };
  const week: WeekView = { weekStart: W, revision: 0, focusSlots: [], goals: [], projects: [], tasks: [{ taskId: "F-week", selected: false, selectionOrder: null, plannedDates: [addDaysKey(W, 2)] }], planDays: [] };
  const calls: string[] = [];
  let conflictOnce = false;
  const bump = (id: string, patch: Partial<WorkTask>) => { tasks = tasks.map(task => task.id === id ? { ...task, ...patch, revision: (task.revision ?? 0) + 1, updatedAt: new Date().toISOString() } : task); return structuredClone(tasks.find(task => task.id === id)!); };
  workflowApi.get = async () => structuredClone({ projects, groups, phases: [], tasks, planDays });
  workflowApi.getPreferences = async () => structuredClone(preferences);
  workflowApi.savePreferences = async input => { preferences = structuredClone(input); calls.push(`prefs:${input.sort}`); return input; };
  workflowApi.week = async () => structuredClone(week);
  workflowApi.resources = async () => []; workflowApi.taskRecords = async () => []; workflowApi.taskEvents = async () => [];
  workflowApi.saveTask = async input => { const created = make(`new-${++seq}`, { ...input, revision: 0 } as Partial<WorkTask>); tasks = [...tasks, created]; calls.push(`create:${created.title}:${created.status}`); return structuredClone(created); };
  workflowApi.patchTask = async (id, revision, patch) => {
    const current = tasks.find(task => task.id === id)!;
    if (conflictOnce) { conflictOnce = false; bump(id, { waitingReason: "다른 창의 이유" }); throw new ApiError(409, "Task changed in another window"); }
    if (revision !== current.revision) throw new ApiError(409, "stale");
    calls.push(`patch:${id}:${Object.keys(patch).sort().join(",")}`); return bump(id, patch);
  };
  workflowApi.changeStatus = async (id, _revision, change: StatusChange) => {
    const current = tasks.find(task => task.id === id)!;
    calls.push(`status:${id}:${change.status}`);
    // Leaving WAITING clears the live waiting fields (their context stays in the event history).
    const cleared = current.status === "WAITING" && change.status !== "WAITING" ? { waitingReason: null, waitingNextAction: null, waitingCheckDate: null, waitingFlagged: false } : {};
    const waiting = change.status === "WAITING" ? { waitingReason: change.waitingReason ?? null, waitingNextAction: change.waitingNextAction ?? null, waitingCheckDate: change.waitingCheckDate ?? null, waitingFlagged: !!change.waitingFlagged } : {};
    return bump(id, { status: change.status, previousStatus: current.status, ...cleared, ...waiting });
  };
  workflowApi.archiveTask = async (id, _revision, archived) => { calls.push(`archive:${id}:${archived}`); return bump(id, { archivedAt: archived ? "2026-09-27T00:00:00Z" : null }); };
  workflowApi.addToToday = async (id, date) => { calls.push(`today:${id}`); return { day: { date, revision: 1, blocks: [] }, blockId: "b", created: true, planDayCreated: true }; };
  const root = createRoot(document.getElementById("root")!);
  const $ = <T extends Element>(selector: string, scope: ParentNode = document) => scope.querySelector<T>(selector);
  const byLabel = <T extends Element>(label: string, scope: ParentNode = document) => $<T>(`[aria-label="${label}"]`, scope);
  const buttonIn = (scope: ParentNode, text: string) => [...scope.querySelectorAll("button")].find(item => item.textContent?.trim().startsWith(text)) ?? null;
  const click = async (node: Element | null) => { assert.ok(node, "element exists"); await act(async () => { node!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }); };
  const type = async (node: HTMLInputElement | HTMLSelectElement | null, value: string, event = "input") => { assert.ok(node); await act(async () => { const proto = node instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node!.dispatchEvent(new dom.window.Event(node instanceof dom.window.HTMLSelectElement ? "change" : event, { bubbles: true })); }); };
  const visible = () => [...document.querySelectorAll(".wf-todo-main .wf-task-row")].map(node => node.getAttribute("data-task-id"));
  const group = (label: string) => byLabel<HTMLElement>(`${label} 필터`)!;
  try {
    // ================= S07 All To-dos =================
    await act(async () => root.render(<WorkflowProvider key="todo"><Todo/></WorkflowProvider>));
    // Stored legacy DUE_DATE sort is read as the semantic deadline: legacy due_date never ranks a Task.
    assert.equal(byLabel<HTMLSelectElement>("정렬 기준")!.value, "DEADLINE");
    assert.deepEqual(visible(), ["B-low-doing", "A-high-todo", "C-high-waiting", "D-done-beta", "F-week"], "archived hidden; deadline order; no-deadline rows by canonical order");
    assert.equal(buttonIn(group("상태"), "보류"), null, "보류 is not a Task status");
    // Project filter is grouped like the Projects page; a group label toggles all of its Projects.
    const clusters = (scope: ParentNode) => [...scope.querySelectorAll(".wf-pgroup[role=group]")].map(node => `${node.getAttribute("aria-label")}:${[...node.querySelectorAll(".wf-pchip-name")].map(name => name.textContent).join(",")}`);
    assert.deepEqual(clusters(group("프로젝트")), ["Work 그룹:Gamma", "Life 그룹:Alpha", "그룹 없음 그룹:Beta"]);
    await click(byLabel("Life 그룹 전체"));
    assert.equal(buttonIn(group("프로젝트"), "Alpha")!.getAttribute("aria-pressed"), "true");
    assert.deepEqual(visible().sort(), ["A-high-todo", "B-low-doing", "F-week"], "group toggle filters by its Project ids");
    await click(byLabel("Life 그룹 전체"));
    assert.equal(buttonIn(group("프로젝트"), "전체")!.getAttribute("aria-pressed"), "true");
    // OR within Status, AND with Priority.
    await click(buttonIn(group("상태"), "할 일")); await click(buttonIn(group("상태"), "대기"));
    assert.deepEqual(visible().sort(), ["A-high-todo", "C-high-waiting", "F-week"]);
    await click(buttonIn(group("우선순위"), "높음"));
    assert.deepEqual(visible().sort(), ["A-high-todo", "C-high-waiting"]);
    await click(buttonIn(group("프로젝트"), "프로젝트 없음"));
    assert.deepEqual(visible(), ["C-high-waiting"]);
    // Group 전체 resets only that group.
    await click(buttonIn(group("상태"), "전체"));
    assert.equal(buttonIn(group("상태"), "전체")!.getAttribute("aria-pressed"), "true");
    assert.equal(buttonIn(group("우선순위"), "높음")!.getAttribute("aria-pressed"), "true", "Priority kept");
    assert.deepEqual(visible(), ["C-high-waiting"]);
    // No result is distinguished from no Tasks, with a reset.
    await click(buttonIn(group("이번 주"), "이번 주"));
    assert.deepEqual(visible(), []);
    assert.match($(".wf-filter-empty")!.textContent!, /필터와 일치하는 작업이 없습니다/);
    // Global reset clears every group.
    await click(buttonIn($(".wf-todo-toolbar")!, "필터 초기화"));
    assert.ok([...document.querySelectorAll(".wf-explorer-filters button[aria-pressed=true]")].every(node => node.textContent?.startsWith("전체")));
    await click(buttonIn(group("이번 주"), "이번 주"));
    assert.deepEqual(visible(), ["F-week"], "This Week = selection ∪ plan days in the week");
    await click(buttonIn(group("이번 주"), "미배치"));
    await click(buttonIn(group("이번 주"), "이번 주"));
    assert.ok(!visible().includes("F-week") && visible().includes("A-high-todo"), "미배치 = no plan day");
    await click(buttonIn($(".wf-todo-toolbar")!, "필터 초기화"));
    // Sort change persists and never touches Task order.
    const orderBefore = tasks.map(task => `${task.id}:${task.order}`);
    await type(byLabel<HTMLSelectElement>("정렬 기준"), "PRIORITY");
    assert.deepEqual(calls.filter(call => call.startsWith("prefs")), ["prefs:PRIORITY"]);
    assert.deepEqual(visible().slice(0, 2).sort(), ["A-high-todo", "C-high-waiting"]);
    assert.deepEqual(tasks.map(task => `${task.id}:${task.order}`), orderBefore);
    // Archive: separate view, search, restore keeps the same Task.
    await click(buttonIn($(".wf-todo-toolbar")!, "보관됨"));
    assert.deepEqual(visible(), ["E-archived"]);
    await click(byLabel("E-archived 복구"));
    assert.deepEqual(calls.filter(call => call.startsWith("archive")), ["archive:E-archived:false"]);
    assert.deepEqual(visible(), []);
    await click(buttonIn($(".wf-todo-toolbar")!, "보관됨"));
    assert.ok(visible().includes("E-archived"), "restored Task is active again, same id");
    // Row body opens S10; inline control does not.
    await click($(`.wf-task-row[data-task-id="A-high-todo"]`));
    assert.match(window.location.search, /task=A-high-todo/);
    assert.ok($(".wf-split-detail .wf-td"));

    // Project sections follow the Projects page (group order → Project order → 프로젝트 없음), even when an old
    // per-view order override is still stored; no drag handle is offered to reorder them here.
    preferences = { ...preferences, groupMode: "PROJECT", projectOrder: ["unassigned", "p1", "p2", "p3"] };
    await act(async () => root.render(<WorkflowProvider key="todo-grouped"><Todo/></WorkflowProvider>));
    assert.deepEqual([...document.querySelectorAll(".wf-todo-group")].map(node => node.getAttribute("aria-label")), ["Gamma 그룹", "Alpha 그룹", "Beta 그룹", "프로젝트 없음 그룹"]);
    assert.equal(document.querySelector(".wf-todo-group > header .wf-drag"), null);
    assert.deepEqual(calls.filter(call => call.startsWith("prefs")), ["prefs:PRIORITY"], "rendering writes no preference");

    // ================= S08 Waiting / Check =================
    window.history.replaceState(null, "", "/workflow/waiting");
    await act(async () => root.render(<WorkflowProvider key="waiting"><Waiting/></WorkflowProvider>));
    const section = (label: string) => byLabel<HTMLElement>(label)!;
    const rowsIn = (label: string) => [...section(label).querySelectorAll(".wf-wait-row[data-task-id]")].map(node => node.getAttribute("data-task-id"));
    assert.deepEqual(rowsIn("대기 중"), ["C-high-waiting"], "future check date waits");
    assert.deepEqual(rowsIn("확인할 때가 된 일"), []);
    // First visit = 전체: the aggregated management view has no add row and no Project picker to create with.
    const contexts = () => byLabel<HTMLElement>("대기 프로젝트 컨텍스트")!;
    assert.equal(buttonIn(contexts(), "전체")!.getAttribute("aria-pressed"), "true");
    assert.equal(byLabel("새 대기 작업 추가"), null);
    assert.equal(document.querySelector(".wf-wait-row.is-add select"), null);
    await click(buttonIn(contexts(), "Alpha"));
    assert.equal(byLabel("새 대기 작업 프로젝트"), null, "no Project selector in the create row");
    assert.deepEqual(rowsIn("대기 중"), [], "Alpha context shows only Alpha items");
    // Title-only inline create in 대기 중: canonical Task created, then WAITING via the status command.
    await type(byLabel<HTMLInputElement>("새 대기 작업 제목"), "Vendor reply");
    await act(async () => { byLabel<HTMLFormElement>("새 대기 작업 추가")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    const created = tasks.find(task => task.title === "Vendor reply")!;
    assert.ok(created, "created as an ordinary Task");
    assert.equal(created.projectId, "p1", "the Alpha context decides projectId");
    assert.deepEqual(calls.filter(call => call.includes("Vendor reply") || call.includes(created.id)), [`create:Vendor reply:TODO`, `status:${created.id}:WAITING`]);
    assert.equal(created.waitingCheckDate, null, "optional fields stay optional");
    assert.ok(rowsIn("대기 중").includes(created.id));
    // Ready table create defaults the check date to today.
    assert.equal(byLabel<HTMLInputElement>("새 확인할 일 확인 날짜")!.value, today);
    // Flag → ready projection (same Task, still WAITING).
    await click(byLabel(`Vendor reply 지금 확인`));
    assert.ok(rowsIn("확인할 때가 된 일").includes(created.id));
    assert.equal(tasks.find(task => task.id === created.id)!.status, "WAITING");
    // Inline extend: 내일 sets the date and clears the flag → back to 대기 중.
    await click(byLabel(`Vendor reply 확인 날짜 날짜 없음`));
    await click(buttonIn(byLabel(`Vendor reply 확인 날짜 변경`)!, "내일"));
    const extended = tasks.find(task => task.id === created.id)!;
    assert.equal(extended.waitingCheckDate, addDaysKey(today, 1)); assert.equal(extended.waitingFlagged, false);
    assert.ok(rowsIn("대기 중").includes(created.id));
    // Due check date → ready.
    await click(byLabel(`Vendor reply 확인 날짜 ${(await import("../../lib/workflow/labels")).shortDate(addDaysKey(today, 1))} 확인`));
    await click(buttonIn(byLabel(`Vendor reply 확인 날짜 변경`)!, "오늘"));
    assert.ok(rowsIn("확인할 때가 된 일").includes(created.id));
    // Revision conflict on an inline field: the draft stays and the message is shown.
    conflictOnce = true;
    const reason = byLabel<HTMLInputElement>("Vendor reply 대기 이유")!;
    await act(async () => { reason.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: true })); });
    await type(reason, "내 이유");
    await act(async () => { reason.dispatchEvent(new dom.window.FocusEvent("blur", { bubbles: true })); reason.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); });
    assert.equal(byLabel<HTMLInputElement>("Vendor reply 대기 이유")!.value, "내 이유", "draft kept after conflict");
    assert.match(section("확인할 때가 된 일").textContent!, /다른 창에서 먼저 변경/);
    // Add to Today from Waiting uses the canonical command.
    await click(byLabel("Vendor reply 오늘에 추가"));
    assert.ok(calls.includes(`today:${created.id}`));
    // Resume: same Task back to 진행 중 (+ optional Add to Today), no duplicate.
    const count = tasks.length;
    await click(buttonIn($(`.wf-wait-row[data-task-id="${created.id}"]`)!, "재개"));
    const pop = byLabel<HTMLElement>("Vendor reply 재개")!;
    await click(pop.querySelector("input[type=checkbox]"));
    await click(buttonIn(pop, "진행 중으로 재개"));
    const resumed = tasks.find(task => task.id === created.id)!;
    assert.equal(resumed.status, "DOING"); assert.equal(tasks.length, count, "no duplicate Task");
    assert.equal(calls.filter(call => call === `today:${created.id}`).length, 2, "resume + Add to Today");
    assert.equal($(`.wf-wait-row[data-task-id="${created.id}"]`), null, "left the WAITING screen");
    assert.match($(".wf-wait-notice")!.textContent!, /진행 중으로 재개/);

    // ---- Project contexts: consecutive creation, switching, 프로젝트 없음, 전체 reassignment, remembered context ----
    const createHere = async (title: string) => {
      await type(byLabel<HTMLInputElement>("새 대기 작업 제목"), title);
      await act(async () => { byLabel<HTMLFormElement>("새 대기 작업 추가")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
      return tasks.filter(task => task.title === title);
    };
    const [a1] = await createHere("A1"), [a2] = await createHere("A2");
    assert.equal(a1.projectId, "p1"); assert.equal(a2.projectId, "p1", "context kept across consecutive creates");
    assert.equal(byLabel<HTMLInputElement>("새 대기 작업 제목")!.value, "", "row reset for the next entry");
    assert.equal(document.activeElement, byLabel("새 대기 작업 제목"), "focus returns to the title");
    assert.equal(localStorage.getItem("wf.waiting.context"), "p1");
    // Beta is PAUSED → not a primary chip; reachable from 더보기 and then shown as the selected chip.
    assert.equal(buttonIn(contexts(), "Beta"), null);
    await click(buttonIn(contexts(), "더보기"));
    await click(buttonIn(byLabel<HTMLElement>("다른 프로젝트 컨텍스트")!, "Beta"));
    assert.equal(buttonIn(contexts(), "Beta")!.getAttribute("aria-pressed"), "true");
    const [b1] = await createHere("B1");
    assert.equal(b1.projectId, "p2", "no stale Project after switching context");
    assert.deepEqual(rowsIn("대기 중"), [b1.id]);
    await click(buttonIn(contexts(), "Alpha"));
    assert.deepEqual(rowsIn("대기 중").sort(), [a1.id, a2.id].sort(), "earlier Alpha items still there");
    await click(buttonIn(contexts(), "프로젝트 없음"));
    const [n1] = await createHere("N1");
    assert.equal(n1.projectId, null);
    assert.deepEqual(rowsIn("대기 중").sort(), ["C-high-waiting", n1.id].sort());
    assert.equal(tasks.filter(task => ["A1", "A2", "B1", "N1"].includes(task.title)).length, 4, "no duplicate creation");
    // 전체: everything together, the Project filter, and Project reassignment.
    await click(buttonIn(contexts(), "전체"));
    assert.deepEqual(rowsIn("대기 중").sort(), ["C-high-waiting", a1.id, a2.id, b1.id, n1.id].sort());
    await click(buttonIn(group("프로젝트"), "Beta"));
    assert.deepEqual(rowsIn("대기 중"), [b1.id], "project filter");
    await click(buttonIn(group("프로젝트"), "전체"));
    await type(byLabel<HTMLSelectElement>("A1 프로젝트"), "p2");
    await type(byLabel<HTMLSelectElement>("B1 프로젝트"), "");
    await type(byLabel<HTMLSelectElement>("N1 프로젝트"), "p1");
    assert.deepEqual(["A1", "B1", "N1"].map(title => tasks.find(task => task.title === title)!.projectId), ["p2", null, "p1"]);
    assert.ok(calls.includes(`patch:${a1.id}:phaseId,projectId`));
    // Search narrows 전체 too.
    await type(byLabel<HTMLInputElement>("대기 작업 검색"), "N1");
    assert.deepEqual(rowsIn("대기 중"), [n1.id]);
    // 필터 초기화 clears search and every filter.
    await click(buttonIn(group("확인 시점"), "필터 초기화"));
    assert.equal(byLabel<HTMLInputElement>("대기 작업 검색")!.value, "");
    assert.equal(rowsIn("대기 중").length, 5);
    // 직접 지정: one exact date key (no timezone conversion), shown on the chip, cleared by the reset.
    const target = addDaysKey(today, 5);
    await click(buttonIn(group("확인 시점"), "직접 지정"));
    await type(byLabel<HTMLInputElement>("직접 지정 날짜"), target, "change");
    await click(buttonIn(byLabel<HTMLElement>("직접 지정 확인 날짜")!, "적용"));
    assert.deepEqual(rowsIn("대기 중"), ["C-high-waiting"], "only the item checked on that date");
    const { shortDate } = await import("../../lib/workflow/labels");
    assert.equal(buttonIn(group("확인 시점"), "직접 지정")!.textContent!.trim(), `직접 지정 · ${shortDate(target)}`);
    assert.equal(buttonIn(group("확인 시점"), "직접 지정")!.getAttribute("aria-pressed"), "true");
    await click(buttonIn(group("확인 시점"), "날짜 없음"));
    assert.equal(rowsIn("대기 중").length, 5, "직접 지정 OR 날짜 없음");
    await click(buttonIn(group("확인 시점"), "필터 초기화"));
    assert.equal(buttonIn(group("확인 시점"), "직접 지정")!.textContent!.trim(), "직접 지정");
    assert.equal(buttonIn(group("확인 시점"), "전체")!.getAttribute("aria-pressed"), "true");
    // Context chips and the 전체 project filter share the Projects grouping; Beta (PAUSED) lives in 더보기.
    assert.deepEqual(clusters(contexts()), ["Work 그룹:Gamma", "Life 그룹:Alpha"]);
    assert.deepEqual(clusters(group("프로젝트")), ["Work 그룹:Gamma", "Life 그룹:Alpha", "그룹 없음 그룹:Beta"]);
    // 전체 → "+ 새 대기/확인" → choose a context → that context opens with the create row focused.
    assert.equal(byLabel("새 대기 작업 추가"), null, "전체 itself has no create row");
    await click(buttonIn(document, "새 대기/확인"));
    await click(buttonIn(byLabel<HTMLElement>("새 대기/확인 위치 선택")!, "Gamma"));
    assert.equal(buttonIn(contexts(), "Gamma")!.getAttribute("aria-pressed"), "true");
    assert.equal(document.activeElement, byLabel("새 대기 작업 제목"), "create row focused after choosing the context");
    const [g1] = await createHere("G1");
    assert.equal(g1.projectId, "p3");
    assert.deepEqual(rowsIn("대기 중"), [g1.id]);
    // The last chosen context is remembered across visits; an unknown one falls back to 전체.
    await click(buttonIn(contexts(), "Alpha"));
    await act(async () => root.render(<WorkflowProvider key="waiting-again"><Waiting/></WorkflowProvider>));
    assert.equal(buttonIn(contexts(), "Alpha")!.getAttribute("aria-pressed"), "true");
    assert.deepEqual(rowsIn("대기 중").sort(), [a2.id, n1.id].sort(), "Alpha: A2 plus the reassigned N1 (A1 moved out)");
    localStorage.setItem("wf.waiting.context", "deleted-project");
    await act(async () => root.render(<WorkflowProvider key="waiting-stale"><Waiting/></WorkflowProvider>));
    assert.equal(buttonIn(contexts(), "전체")!.getAttribute("aria-pressed"), "true");
  } finally { Object.assign(workflowApi, original); await act(async () => root.unmount()); dom.window.close(); }
});
