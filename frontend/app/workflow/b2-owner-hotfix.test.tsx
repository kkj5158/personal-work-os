import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { PlanDay, Phase, Project, WeekView, WorkTask } from "../../lib/api/workflow";

test("B2 owner hotfix: shared row-body click, control exceptions, 미분류-first hierarchy, DnD, inline edits, S10 sections", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/projects?project=p1" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: Projects } = await import("./Projects");
  const { default: Todo } = await import("./Todo");
  const original = { ...workflowApi };
  const project: Project = { id: "p1", title: "Alpha Project", status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: 0, revision: 0 };
  let phases: Phase[] = [
    { id: "f1", projectId: "p1", title: "Build", status: "TODO", startDate: null, endDate: null, memo: null, order: 0, revision: 0 },
    { id: "f2", projectId: "p1", title: "Ship", status: "TODO", startDate: null, endDate: null, memo: null, order: 1, revision: 0 },
  ];
  const make = (id: string, title: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, ...extra });
  let tasks: WorkTask[] = [make("t1", "Alpha", { phaseId: "f1" }), make("t2", "Beta"), make("t3", "Gamma", { projectId: null })];
  let planDays: PlanDay[] = [{ taskId: "t1", date: "2026-09-29", order: 0 }];
  const calls: { kind: string; id: string; revision?: number; body?: unknown }[] = [];
  const week: WeekView = { weekStart: "2026-09-28", revision: 0, focusSlots: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [], projects: [], tasks: [], planDays: [] };
  const bump = (id: string, patch: object) => { tasks = tasks.map(task => task.id === id ? { ...task, ...patch, revision: (task.revision ?? 0) + 1 } : task); return structuredClone(tasks.find(task => task.id === id)!); };
  workflowApi.get = async () => structuredClone({ projects: [project], phases, tasks, planDays });
  workflowApi.getPreferences = async () => ({});
  workflowApi.savePreferences = async input => input;
  workflowApi.week = async weekStart => structuredClone({ ...week, weekStart });
  workflowApi.resources = async () => [];
  workflowApi.taskRecords = async () => [];
  workflowApi.patchTask = async (id, revision, patch) => { calls.push({ kind: "patch", id, revision, body: patch }); return bump(id, patch); };
  workflowApi.changeStatus = async (id, revision, change) => { calls.push({ kind: "status", id, revision, body: change }); const prior = tasks.find(task => task.id === id)!.status; return bump(id, { ...change, previousStatus: prior }); };
  workflowApi.patchPhase = async (id, _revision, patch) => { calls.push({ kind: "phase", id, body: patch }); phases = phases.map(phase => phase.id === id ? { ...phase, ...patch, revision: (phase.revision ?? 0) + 1 } : phase); return structuredClone(phases.find(phase => phase.id === id)!); };
  workflowApi.addPlanDay = async (id, date) => { calls.push({ kind: "planDay", id, body: date }); planDays = [...planDays, { taskId: id, date, order: 0 }]; return planDays.filter(day => day.taskId === id); };
  workflowApi.addToToday = async (id, date) => { calls.push({ kind: "today", id }); return { day: { date, revision: 1, blocks: [] }, blockId: "b1", created: true, planDayCreated: false }; };
  const root = createRoot(document.getElementById("root")!);
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const byLabel = <T extends Element>(label: string) => $<T>(`[aria-label="${label}"]`)!;
  const row = (id: string) => $<HTMLElement>(`.wf-task-row[data-task-id="${id}"]`)!;
  const detailTitle = () => $<HTMLInputElement>('.wf-td [aria-label="작업 제목"]')?.value ?? null;
  const click = async (node: Element) => { assert.ok(node); await act(async () => { node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }); };
  const change = async (node: HTMLInputElement | HTMLSelectElement, value: string) => { await click(node); await act(async () => { const proto = node instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event(node instanceof dom.window.HTMLSelectElement ? "change" : "input", { bubbles: true })); }); };
  const drop = async (node: Element, kind: string, id: string) => { await act(async () => { const event = new dom.window.Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: { types: [kind], getData: (type: string) => type === kind ? id : "" } }); node.dispatchEvent(event); }); };
  try {
    // ---- Project Detail --------------------------------------------------------------------------------
    await act(async () => root.render(<WorkflowProvider><Projects/></WorkflowProvider>));
    // C. 미분류 작업 renders first and neutral, then real Phases in order; Tasks sit inside their group's content.
    assert.deepEqual([...document.querySelectorAll(".wf-phase-section")].map(node => node.getAttribute("aria-label")), ["미분류 작업", "Build", "Ship"]);
    assert.ok(byLabel("미분류 작업").classList.contains("is-unassigned"));
    assert.ok(byLabel("미분류 작업").querySelector('.wf-phase-content [data-task-id="t2"]'));
    assert.ok(byLabel("Build").querySelector('.wf-phase-content [data-task-id="t1"]'));
    await click(byLabel("Build 접기/펼치기"));
    assert.equal(row("t1"), null, "collapsed Phase hides its rows");
    await click(byLabel("Build 접기/펼치기"));
    assert.ok(row("t1"));

    // A. Row body opens S10; title too; controls never do.
    await click(row("t1"));
    assert.equal(detailTitle(), "Alpha", "blank row body opens S10");
    assert.ok($(".wf-split.has-detail .wf-split-detail .wf-td"), "Project Detail hosts S10 in the non-modal split");
    await click(row("t2").querySelector(".wf-title-button")!);
    assert.equal(detailTitle(), "Beta", "title click swaps S10 content");
    await click(byLabel("상세 닫기"));
    assert.equal(detailTitle(), null);
    await click(byLabel("Alpha 완료"));
    assert.equal(detailTitle(), null, "checkbox does not open S10");
    assert.equal(tasks.find(task => task.id === "t1")!.status, "DONE");
    // A quick toggle back while the first save is still in flight must not be dropped.
    const changeStatus = workflowApi.changeStatus;
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    workflowApi.changeStatus = async (id, revision, change) => { await gate; return changeStatus(id, revision, change); };
    await click(byLabel("Alpha 완료")); await click(byLabel("Alpha 완료"));
    await act(async () => { release(); await gate; });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    workflowApi.changeStatus = changeStatus;
    assert.equal(tasks.find(task => task.id === "t1")!.status, "DONE", "DONE → TODO → DONE lands on the last intent");
    assert.equal(byLabel<HTMLInputElement>("Alpha 완료").checked, true);
    await change(byLabel<HTMLSelectElement>("Alpha 상태"), "DOING");
    await change(byLabel<HTMLSelectElement>("Alpha 우선순위"), "HIGH");
    await click(byLabel("Alpha 계획 날짜"));
    await change(byLabel<HTMLInputElement>("Alpha 마감일"), "2026-10-10");
    await click([...row("t1").querySelectorAll("button")].find(button => button.textContent === "오늘에 추가")!);
    await click(row("t1").querySelector(".wf-drag")!);
    assert.equal(detailTitle(), null, "status/priority/plan/deadline/Add to Today/DnD handle do not bubble into S10");
    const alpha = tasks.find(task => task.id === "t1")!;
    assert.equal(alpha.status, "DOING"); assert.equal(alpha.priority, "HIGH"); assert.equal(alpha.deadlineDate, "2026-10-10"); assert.equal(alpha.dueDate, null);
    assert.ok(calls.some(call => call.kind === "today" && call.id === "t1"));

    // D. DnD: 미분류 → Phase assigns it, Phase → 미분류 clears it; same identity, no duplication. Phases never go above 미분류.
    await drop(byLabel("Ship"), "application/workflow-task", "t2");
    assert.equal(tasks.find(task => task.id === "t2")!.phaseId, "f2");
    await drop(byLabel("미분류 작업"), "application/workflow-task", "t1");
    assert.equal(tasks.find(task => task.id === "t1")!.phaseId, null);
    assert.deepEqual(tasks.map(task => task.id).sort(), ["t1", "t2", "t3"]);
    await drop(byLabel("미분류 작업"), "application/workflow-phase", "f2");
    assert.deepEqual(phases.map(phase => phase.order), [0, 1], "a Phase cannot be dropped onto the unassigned bucket");
    assert.equal([...document.querySelectorAll(".wf-phase-section")][0].getAttribute("aria-label"), "미분류 작업");

    // ---- All To-dos --------------------------------------------------------------------------------------
    window.history.replaceState(null, "", "/workflow/todo");
    await act(async () => root.render(<WorkflowProvider key="todo"><Todo/></WorkflowProvider>));
    assert.ok(byLabel("프로젝트 없음 그룹").classList.contains("is-unassigned"), "프로젝트 없음 is a neutral unassigned group");
    assert.ok(!byLabel("Alpha Project 그룹").classList.contains("is-unassigned"));
    // B. Row body opens S10 and switching keeps filter / collapse state.
    await click([...document.querySelectorAll(".wf-status-tabs button")].find(button => button.textContent?.startsWith("할 일"))!);
    await click(byLabel("Alpha Project 접기/펼치기"));
    await click(row("t3"));
    assert.equal(detailTitle(), "Gamma");
    assert.match(window.location.search, /task=t3/);
    await click(byLabel("Alpha Project 접기/펼치기"));
    await click(row("t2"));
    assert.equal(detailTitle(), "Beta", "another row swaps S10");
    assert.equal([...document.querySelectorAll(".wf-status-tabs button")].find(button => button.textContent?.startsWith("할 일"))!.getAttribute("aria-pressed"), "true", "filter kept");
    await click(byLabel("Alpha Project 접기/펼치기"));
    await click(row("t3"));
    assert.equal(byLabel("Alpha Project 접기/펼치기").textContent, "▸", "group collapse kept while switching");
    await click(byLabel("Alpha Project 접기/펼치기"));
    await click([...document.querySelectorAll(".wf-status-tabs button")].find(button => button.textContent?.startsWith("전체"))!);

    // E. Inline edits go through the revisioned store and never open/switch S10.
    const before = calls.length;
    await change(byLabel<HTMLSelectElement>("Gamma 프로젝트"), "p1");
    const moved = calls.slice(before).find(call => call.kind === "patch" && call.id === "t3")!;
    assert.deepEqual(moved.body, { projectId: "p1", phaseId: null }); assert.equal(typeof moved.revision, "number");
    await change(byLabel<HTMLSelectElement>("Beta 작업 묶음"), "f1");
    assert.equal(tasks.find(task => task.id === "t2")!.phaseId, "f1");
    await change(byLabel<HTMLSelectElement>("Beta 상태"), "WAITING");
    assert.ok(calls.some(call => call.kind === "status" && call.id === "t2" && (call.body as { status: string }).status === "WAITING"), "status uses the status command");
    await change(byLabel<HTMLSelectElement>("Beta 우선순위"), "LOW");
    assert.equal(tasks.find(task => task.id === "t2")!.priority, "LOW");
    await click(byLabel("Beta 계획 날짜"));
    await change(byLabel<HTMLInputElement>("Beta 계획 날짜 추가"), "2026-10-02");
    await click(byLabel("Beta 계획 날짜 추가하기"));
    assert.ok(calls.some(call => call.kind === "planDay" && call.id === "t2" && call.body === "2026-10-02"));
    await change(byLabel<HTMLInputElement>("Beta 마감일"), "2026-10-20");
    assert.equal(tasks.find(task => task.id === "t2")!.deadlineDate, "2026-10-20");
    await click([...row("t2").querySelectorAll("button")].find(button => button.textContent === "오늘에 추가")!);
    assert.ok(calls.some(call => call.kind === "today" && call.id === "t2"));
    assert.equal(detailTitle(), "Gamma", "inline edits never switch the open S10");
    assert.match(window.location.search, /task=t3/);

    // F. S10 sections in the locked order; the WAITING section only for WAITING Tasks.
    const headings = () => [...document.querySelectorAll(".wf-td .wf-td-block-head h3")].map(node => node.firstChild?.textContent);
    assert.deepEqual(headings(), ["기본 정보", "일정 정보", "이번 주", "설명 / 메모", "연결 자료", "최근 기록"]);
    assert.equal($('.wf-td [aria-label="대기 정보"]'), null);
    await click(row("t2"));
    assert.deepEqual(headings(), ["기본 정보", "대기", "일정 정보", "이번 주", "설명 / 메모", "연결 자료", "최근 기록"]);
    assert.ok($('.wf-td [aria-label="대기 정보"] [aria-label="대기 이유"]'));

    // Batch 3: unchecking restores previousStatus, even when clicked before the completion has saved.
    await change(byLabel<HTMLSelectElement>("Gamma 상태"), "DOING");
    const statusCommand = workflowApi.changeStatus;
    let open!: () => void; const pending = new Promise<void>(resolve => { open = resolve; });
    workflowApi.changeStatus = async (id, revision, change) => { await pending; return statusCommand(id, revision, change); };
    await click(byLabel("Gamma 완료")); await click(byLabel("Gamma 완료"));
    await act(async () => { open(); await pending; });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    workflowApi.changeStatus = statusCommand;
    assert.equal(tasks.find(task => task.id === "t3")!.status, "DOING", "DOING → DONE → unchecked returns to DOING, not TODO");
  } finally { Object.assign(workflowApi, original); await act(async () => root.unmount()); dom.window.close(); }
});
