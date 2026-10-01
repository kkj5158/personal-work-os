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
  const NO_WAITING = { waitingReason: null, waitingNextAction: null, waitingCheckDate: null, waitingFlagged: false, waitingAgent: null, waitingSince: null, waitingCompletedAt: null };
  workflowApi.changeStatus = async (id, _revision, change: StatusChange) => {
    const current = tasks.find(task => task.id === id)!, from = current.status, to = change.status;
    calls.push(`status:${id}:${to}${change.completeWaiting ? ":complete" : ""}`);
    if (to === "WAITING") return bump(id, { status: to, previousStatus: from === "WAITING" ? current.previousStatus : from, completedAt: null, waitingCompletedAt: null,
      waitingReason: change.waitingReason ?? current.waitingReason ?? null, waitingNextAction: change.waitingNextAction ?? current.waitingNextAction ?? null, waitingCheckDate: change.waitingCheckDate ?? current.waitingCheckDate ?? null,
      waitingFlagged: !!change.waitingFlagged, waitingAgent: change.waitingAgent ?? current.waitingAgent ?? null, waitingSince: from === "WAITING" && current.waitingSince ? current.waitingSince : change.waitingSince ?? "2026-09-29T00:00:00.000Z" });
    // Completion from the Waiting queue keeps the context as history; any other exit from WAITING clears it.
    if (to === "DONE" && from === "WAITING" && change.completeWaiting) return bump(id, { status: to, previousStatus: from, completedAt: "2026-09-30T00:00:00.000Z", waitingCompletedAt: "2026-09-30T00:00:00.000Z" });
    const cleared = from === "WAITING" || (from === "DONE" && current.waitingCompletedAt) ? NO_WAITING : {};
    return bump(id, { status: to, previousStatus: from, ...cleared });
  };
  workflowApi.deleteTask = async id => { calls.push(`delete:${id}`); tasks = tasks.filter(task => task.id !== id); };
  workflowApi.archiveTask = async (id, _revision, archived) => { calls.push(`archive:${id}:${archived}`); return bump(id, { archivedAt: archived ? "2026-09-27T00:00:00Z" : null }); };
  const todayBlocks: { id: string }[] = [];
  workflowApi.addToToday = async (id, date) => { calls.push(`today:${id}`); todayBlocks.push({ id: `block-${id}` }); return { day: { date, revision: 1, blocks: structuredClone(todayBlocks) as never }, blockId: `block-${id}`, created: true, planDayCreated: true }; };
  workflowApi.getDay = async date => ({ date, revision: 1, blocks: structuredClone(todayBlocks) as never });
  workflowApi.saveDay = async (date, day) => { calls.push(`saveDay:${day.blocks.map(block => block.id).join(",") || "empty"}`); todayBlocks.splice(0, todayBlocks.length, ...day.blocks.map(block => ({ id: block.id }))); return { date, revision: day.revision + 1, blocks: day.blocks }; };
  workflowApi.removePlanDay = async (id, date) => { calls.push(`unplan:${id}:${date}`); return []; };
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

    // ================= S08 Waiting / Check (revision 2026-10-01) =================
    window.history.replaceState(null, "", "/workflow/waiting");
    await act(async () => root.render(<WorkflowProvider key="waiting"><Waiting/></WorkflowProvider>));
    const section = (label: string) => byLabel<HTMLElement>(label)!;
    const rowsIn = (label: string) => [...section(label).querySelectorAll(".wf-wait-row[data-task-id]")].map(node => node.getAttribute("data-task-id"));
    const titlesIn = (label: string) => [...section(label).querySelectorAll(".wf-wait-row[data-task-id] .wf-wait-title-text")].map(node => node.textContent).sort();
    const find = (title: string) => tasks.find(task => task.title === title)!;
    const submit = async (label: string) => { await act(async () => { byLabel<HTMLFormElement>(label)!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); };
    const undo = async () => { await click(buttonIn($(".wf-wait-notice")!, "실행 취소")); };
    assert.deepEqual(rowsIn("대기 중"), ["C-high-waiting"], "future check date waits");
    assert.deepEqual(rowsIn("확인할 때가 된 일"), []);
    // No upper-right create button and no detail panel: a row is operated in place.
    assert.equal(buttonIn(document, "새 대기/확인"), null);
    await click($(`.wf-wait-row[data-task-id="C-high-waiting"] .wf-wait-title-text`));
    assert.doesNotMatch(window.location.search, /task=/); assert.equal($(".wf-split-detail .wf-td"), null);
    assert.equal($(".wf-wait-rail")!.textContent!.includes("사용 팁"), false); assert.equal($(".wf-wait-rail")!.textContent!.includes("빠른 액션"), false);

    // Grouped Project filter: one row per Projects-page group, saved order, live search that keeps every group row.
    const panel = () => byLabel<HTMLElement>("프로젝트 필터")!;
    const groupRows = () => [...panel().querySelectorAll(".wf-wait-pgroup")].map(node => `${node.getAttribute("aria-label")}:${[...node.querySelectorAll(".wf-pchip-name")].map(name => name.textContent).join(",")}`);
    assert.deepEqual(groupRows(), ["Work 그룹:Gamma", "Life 그룹:Alpha", "그룹 없음 그룹:Beta"]);
    await type(byLabel<HTMLInputElement>("프로젝트 검색"), "ALP");
    assert.deepEqual(groupRows(), ["Work 그룹:", "Life 그룹:Alpha", "그룹 없음 그룹:"], "case-insensitive; groups stay");
    assert.match(byLabel<HTMLElement>("Work 그룹", panel())!.textContent!, /일치하는 프로젝트 없음/);
    await click(buttonIn(panel(), "선택 초기화"));
    assert.equal(byLabel<HTMLInputElement>("프로젝트 검색")!.value, "");

    // Inline create in BOTH tables: 그룹 → 프로젝트 cascade, Agent default 미지정, title only required.
    assert.ok(byLabel("새 확인할 일 추가")); assert.ok(byLabel("새 대기 작업 추가"));
    const groupSelect = () => byLabel<HTMLSelectElement>("새 대기 작업 그룹")!, projectSelect = () => byLabel<HTMLSelectElement>("새 대기 작업 프로젝트")!;
    assert.equal(groupSelect().value, ""); assert.equal(projectSelect().disabled, true, "no group = 프로젝트 없음");
    assert.deepEqual([...groupSelect().options].map(option => option.textContent), ["프로젝트 없음", "Work", "Life"], "active Projects only, Projects order");
    assert.equal(byLabel<HTMLSelectElement>("새 대기 작업 담당 Agent")!.value, "UNASSIGNED");
    await type(groupSelect(), "g-life");
    assert.deepEqual([...projectSelect().options].map(option => option.value), ["", "p1"], "Project choices limited to the group");
    assert.equal(projectSelect().value, "p1");
    await type(groupSelect(), "g-work");
    assert.equal(projectSelect().value, "p3", "changing the group resets an incompatible Project");
    await type(groupSelect(), "g-life");
    await type(byLabel<HTMLSelectElement>("새 대기 작업 담당 Agent"), "CLAUDE_CODE");
    await type(byLabel<HTMLInputElement>("새 대기 작업 제목"), "Vendor reply");
    await submit("새 대기 작업 추가");
    const created = find("Vendor reply");
    assert.deepEqual(calls.filter(call => call.includes("Vendor reply") || call.includes(created.id)), [`create:Vendor reply:TODO`, `status:${created.id}:WAITING`], "an ordinary Task, then WAITING via the status command");
    assert.equal(created.projectId, "p1"); assert.equal(created.waitingAgent, "CLAUDE_CODE"); assert.equal(created.waitingCheckDate, null);
    assert.equal(document.activeElement, byLabel("새 대기 작업 제목")); assert.equal(byLabel<HTMLInputElement>("새 대기 작업 제목")!.value, "");
    assert.equal(groupSelect().value, "g-life"); assert.equal(projectSelect().value, "p1"); assert.equal(byLabel<HTMLSelectElement>("새 대기 작업 담당 Agent")!.value, "CLAUDE_CODE");
    await type(byLabel<HTMLInputElement>("새 대기 작업 제목"), "Vendor 2");
    await submit("새 대기 작업 추가");
    assert.equal(find("Vendor 2").projectId, "p1", "consecutive entry keeps the place");
    // The 확인할 때가 된 일 table defaults the check date to today; no group = 프로젝트 없음, Agent 미지정.
    assert.equal(byLabel<HTMLInputElement>("새 확인할 일 확인 날짜")!.value, today);
    await type(byLabel<HTMLInputElement>("새 확인할 일 제목"), "Due now");
    await submit("새 확인할 일 추가");
    assert.equal(find("Due now").projectId, null); assert.equal(find("Due now").waitingAgent ?? null, null); assert.equal(find("Due now").waitingCheckDate, today);
    assert.deepEqual(titlesIn("확인할 때가 된 일"), ["Due now"]); assert.deepEqual(titlesIn("대기 중"), ["C-high-waiting", "Vendor 2", "Vendor reply"]);

    // A single filtered Project prefills group + Project; a whole group prefills the group only.
    await click(buttonIn(panel(), "Gamma"));
    assert.equal(byLabel<HTMLSelectElement>("새 확인할 일 그룹")!.value, "g-work"); assert.equal(byLabel<HTMLSelectElement>("새 확인할 일 프로젝트")!.value, "p3");
    assert.deepEqual(titlesIn("대기 중"), []);
    await click(byLabel("Life 그룹 전체"));
    assert.deepEqual(titlesIn("대기 중"), ["Vendor 2", "Vendor reply"], "multi-select across groups");
    assert.equal(byLabel<HTMLSelectElement>("새 확인할 일 그룹")!.value, "", "several groups → no prefill");
    await click(buttonIn(panel(), "전체"));
    assert.equal(buttonIn(panel(), "Gamma")!.getAttribute("aria-pressed"), "false", "전체 and individual selections are mutually exclusive");

    // Project AND 확인 시점 AND 담당 Agent.
    const filterGroup = (label: string) => byLabel<HTMLElement>(`${label} 필터`)!;
    await click(buttonIn(filterGroup("담당 Agent"), "Claude Code"));
    assert.deepEqual(titlesIn("대기 중"), ["Vendor 2", "Vendor reply"]); assert.deepEqual(titlesIn("확인할 때가 된 일"), []);
    await click(buttonIn(panel(), "Alpha"));
    assert.deepEqual(titlesIn("대기 중"), ["Vendor 2", "Vendor reply"]);
    await click(buttonIn(filterGroup("확인 시점"), "오늘"));
    assert.deepEqual(titlesIn("대기 중"), [], "all three must match");
    await click(buttonIn(filterGroup("담당 Agent"), "필터 초기화"));
    assert.equal(rowsIn("대기 중").length, 3);
    // 직접 지정: one exact date key.
    const target = addDaysKey(today, 5);
    await click(buttonIn(filterGroup("확인 시점"), "직접 지정"));
    await type(byLabel<HTMLInputElement>("직접 지정 날짜"), target, "change");
    await click(buttonIn(byLabel<HTMLElement>("직접 지정 확인 날짜")!, "적용"));
    assert.deepEqual(titlesIn("대기 중"), ["C-high-waiting"]);
    await click(buttonIn(filterGroup("담당 Agent"), "필터 초기화"));
    // Right side: Agent status (active only) + statistics; an Agent row applies that Agent filter.
    const rail = $(".wf-wait-rail")!;
    assert.match(byLabel<HTMLElement>("활성 대기 통계", rail)!.textContent!, /1확인할 때가 된 일3대기 중2날짜 없음/);
    await click(byLabel("미지정 2건 필터"));
    assert.deepEqual([...titlesIn("확인할 때가 된 일"), ...titlesIn("대기 중")], ["Due now", "C-high-waiting"]);
    assert.equal(buttonIn(filterGroup("담당 Agent"), "미지정")!.getAttribute("aria-pressed"), "true");
    await click(byLabel("미지정 2건 필터"));
    assert.equal(rowsIn("대기 중").length, 3);

    // Check date in place: 오늘 → the date projection moves the row up (no flag involved).
    assert.equal(buttonIn($(`.wf-wait-row[data-task-id="${created.id}"]`)!, "지금 확인"), null);
    await click(byLabel(`Vendor 2 확인 날짜 날짜 없음`));
    await click(buttonIn(byLabel(`Vendor 2 확인 날짜 변경`)!, "오늘"));
    assert.equal(find("Vendor 2").waitingCheckDate, today); assert.ok(titlesIn("확인할 때가 된 일").includes("Vendor 2"));
    // Revision conflict on an inline field: the draft stays and the message is shown.
    conflictOnce = true;
    const reason = byLabel<HTMLInputElement>("Vendor reply 대기 이유")!;
    await act(async () => { reason.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: true })); });
    await type(reason, "내 이유");
    await act(async () => { reason.dispatchEvent(new dom.window.FocusEvent("blur", { bubbles: true })); reason.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); });
    assert.equal(byLabel<HTMLInputElement>("Vendor reply 대기 이유")!.value, "내 이유", "draft kept after conflict");
    assert.match(section("대기 중").textContent!, /다른 창에서 먼저 변경/);
    await act(async () => { const input = byLabel<HTMLInputElement>("Vendor reply 대기 이유")!; input.dispatchEvent(new dom.window.FocusEvent("focus", { bubbles: true })); });
    await type(byLabel<HTMLInputElement>("Vendor reply 대기 이유"), "코드 리뷰 대기");
    await act(async () => { const input = byLabel<HTMLInputElement>("Vendor reply 대기 이유")!; input.dispatchEvent(new dom.window.FocusEvent("blur", { bubbles: true })); input.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); });
    assert.equal(find("Vendor reply").waitingReason, "코드 리뷰 대기");

    // 완료 ≠ 삭제: immediate, same Task, kept in collapsed history; Undo restores the same Waiting state.
    const count = tasks.length, v2 = find("Vendor 2").id;
    await click(byLabel("Vendor 2 완료"));
    assert.ok(calls.includes(`status:${v2}:DONE:complete`)); assert.equal(tasks.length, count, "not deleted");
    assert.equal(find("Vendor 2").status, "DONE"); assert.ok(find("Vendor 2").waitingCompletedAt); assert.equal(find("Vendor 2").waitingAgent, "CLAUDE_CODE");
    assert.equal(titlesIn("확인할 때가 된 일").includes("Vendor 2"), false);
    const historyToggle = () => $<HTMLButtonElement>(".wf-wait-history-toggle")!;
    assert.match(historyToggle().textContent!, /완료 이력 1건/); assert.equal(historyToggle().getAttribute("aria-expanded"), "false", "collapsed by default");
    assert.equal($(".wf-wait-table.is-history"), null);
    await undo();
    assert.equal(find("Vendor 2").status, "WAITING"); assert.equal(find("Vendor 2").waitingCheckDate, today); assert.equal(find("Vendor 2").waitingCompletedAt ?? null, null);
    assert.match(historyToggle().textContent!, /완료 이력 0건/); assert.match($(".wf-wait-notice")!.textContent!, /되돌렸습니다/);
    // 다시 대기하기: the same Task comes back; a new date or 날짜 없음 is asked, the expired date is not reused.
    await click(byLabel("Vendor 2 완료"));
    await click(historyToggle());
    assert.deepEqual(titlesIn("완료 이력"), ["Vendor 2"]);
    await click(byLabel("Vendor 2 다시 대기하기"));
    await click(buttonIn($(".wf-wait-reactivate .wf-wait-pop", section("완료 이력"))!, "날짜 없음으로 다시 대기"));
    assert.equal(find("Vendor 2").id, v2); assert.equal(find("Vendor 2").status, "WAITING"); assert.equal(find("Vendor 2").waitingCheckDate, null); assert.equal(find("Vendor 2").waitingAgent, "CLAUDE_CODE");
    assert.ok(titlesIn("대기 중").includes("Vendor 2")); assert.equal(tasks.length, count, "reactivated, not duplicated");

    // 재개: back to active work, NOT added to Today; Undo returns it to Waiting with its context.
    await click(byLabel("Vendor reply 재개"));
    assert.equal(find("Vendor reply").status, "TODO"); assert.equal(calls.filter(call => call === `today:${created.id}`).length, 0);
    assert.equal($(`.wf-wait-row[data-task-id="${created.id}"]`), null);
    await undo();
    assert.equal(find("Vendor reply").status, "WAITING"); assert.equal(find("Vendor reply").waitingReason, "코드 리뷰 대기"); assert.equal(find("Vendor reply").waitingAgent, "CLAUDE_CODE");
    // 오늘에 추가: resume + the canonical Add to Today; Undo removes only what it added and restores Waiting.
    await click(byLabel("Vendor reply 오늘에 추가"));
    assert.equal(find("Vendor reply").status, "TODO"); assert.deepEqual(calls.filter(call => call.startsWith("today:")), [`today:${created.id}`]);
    await undo();
    assert.ok(calls.includes("saveDay:empty")); assert.ok(calls.some(call => call.startsWith(`unplan:${created.id}:`)));
    assert.equal(find("Vendor reply").status, "WAITING"); assert.equal(tasks.length, count, "no duplicate Task");

    // ⋯ = 편집 / 삭제 only. 편집 changes group/project, title, Agent, reason, result and check date in place.
    await click(byLabel("Vendor reply 더보기"));
    assert.deepEqual([...$(`.wf-wait-row[data-task-id="${created.id}"] .wf-wait-pop`)!.querySelectorAll("button")].map(node => node.textContent), ["편집", "삭제"]);
    await click(buttonIn($(`.wf-wait-row[data-task-id="${created.id}"] .wf-wait-pop`)!, "편집"));
    await type(byLabel<HTMLSelectElement>("Vendor reply 편집 그룹"), "g-work");
    await type(byLabel<HTMLInputElement>("Vendor reply 편집 제목"), "Vendor reply v2");
    await type(byLabel<HTMLSelectElement>("Vendor reply 편집 담당 Agent"), "CODEX");
    await type(byLabel<HTMLInputElement>("Vendor reply 편집 결과가 오면"), "머지");
    await type(byLabel<HTMLInputElement>("Vendor reply 편집 확인 날짜"), target, "change");
    await submit("Vendor reply 편집");
    const edited = tasks.find(task => task.id === created.id)!;
    assert.deepEqual([edited.title, edited.projectId, edited.waitingAgent, edited.waitingNextAction, edited.waitingCheckDate, edited.waitingReason], ["Vendor reply v2", "p3", "CODEX", "머지", target, "코드 리뷰 대기"]);
    assert.equal(byLabel("Vendor reply 편집"), null, "edit closes after saving");
    // 삭제 is the only action that asks first.
    const due = find("Due now").id;
    await click(byLabel("Due now 더보기"));
    await click(buttonIn($(`.wf-wait-row[data-task-id="${due}"] .wf-wait-pop`)!, "삭제"));
    assert.ok(tasks.some(task => task.id === due), "nothing deleted before confirming");
    assert.match($(`.wf-wait-row[data-task-id="${due}"] .wf-wait-pop`)!.textContent!, /삭제할까요/);
    await click(buttonIn($(`.wf-wait-row[data-task-id="${due}"] .wf-wait-pop`)!, "삭제"));
    assert.equal(tasks.some(task => task.id === due), false); assert.ok(calls.includes(`delete:${due}`));

    // Multi-select + contextual bulk bar (only while rows are selected); one Undo for the whole batch.
    assert.equal(byLabel("선택한 대기 항목 일괄 작업"), null);
    await click(byLabel("C-high-waiting 선택")); await click(byLabel("Vendor 2 선택"));
    const bulk = () => byLabel<HTMLElement>("선택한 대기 항목 일괄 작업")!;
    assert.match(bulk().textContent!, /2개 선택/);
    assert.deepEqual([...bulk().querySelectorAll("button")].map(node => node.textContent!.trim()).filter(Boolean), ["오늘에 추가", "재개", "완료", "확인일 변경", "선택 해제"]);
    await type(byLabel<HTMLSelectElement>("선택 항목 Agent 변경"), "DIRECT");
    assert.deepEqual([find("C-high-waiting").waitingAgent, find("Vendor 2").waitingAgent], ["DIRECT", "DIRECT"]);
    assert.equal(byLabel("선택한 대기 항목 일괄 작업"), null, "selection cleared after the action");
    await undo();
    assert.deepEqual([find("C-high-waiting").waitingAgent ?? null, find("Vendor 2").waitingAgent], [null, "CLAUDE_CODE"]);
    await click(byLabel("대기 중 전체 선택"));
    assert.match(bulk().textContent!, /3개 선택/);
    await click(buttonIn(bulk(), "확인일 변경"));
    await click(buttonIn($(".wf-wait-pop", bulk())!, "내일"));
    assert.ok(["C-high-waiting", "Vendor 2", "Vendor reply v2"].every(title => find(title).waitingCheckDate === addDaysKey(today, 1)));
    await click(byLabel("대기 중 전체 선택"));
    await click(buttonIn(bulk(), "완료"));
    assert.deepEqual(rowsIn("대기 중"), []); assert.match(historyToggle().textContent!, /완료 이력 3건/);
    await undo();
    assert.equal(rowsIn("대기 중").length, 3); assert.match(historyToggle().textContent!, /완료 이력 0건/);
    assert.equal(tasks.filter(task => ["Vendor reply v2", "Vendor 2", "C-high-waiting"].includes(task.title)).length, 3, "no duplicates");
  } finally { Object.assign(workflowApi, original); await act(async () => root.unmount()); dom.window.close(); }
});
