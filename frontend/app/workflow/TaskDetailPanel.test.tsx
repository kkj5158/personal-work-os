import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Project, WorkTask, WeekView, PlanDay } from "../../lib/api/workflow";

test("S10 split detail: URL restore, non-modal swap, conditional WAITING fields, revision-safe autosave, cross-window refresh, IA", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/todo?task=t1" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { ApiError } = await import("../../lib/api/client");
  const { publishEntityChange, ENTITY_CHANGE_STORAGE_KEY } = await import("../../lib/windowSync");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: Todo } = await import("./Todo");
  const { WORKFLOW_NAV_CORE, WORKFLOW_NAV_SUPPORT } = await import("./WorkflowShell");
  const original = { ...workflowApi };
  const project: Project = { id: "p1", title: "WORK FLOW", status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: 0, revision: 0 };
  const make = (id: string, title: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, ...extra });
  let tasks: WorkTask[] = [make("t1", "Review split view"), make("t2", "Plan the week", { status: "DOING" })];
  let planDays: PlanDay[] = [{ taskId: "t1", date: "2026-09-29", order: 0 }, { taskId: "t1", date: "2026-10-01", order: 0 }];
  const patches: Record<string, unknown>[] = [];
  let gets = 0, conflictNext: null | ((task: WorkTask) => WorkTask) = null;
  const week: WeekView = { weekStart: "2026-09-28", revision: 0, focusSlots: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [], projects: [], tasks: [], planDays: [] };
  workflowApi.get = async () => { gets++; return structuredClone({ projects: [project], phases: [], tasks, planDays }); };
  workflowApi.getPreferences = async () => ({});
  workflowApi.savePreferences = async input => input;
  workflowApi.week = async weekStart => structuredClone({ ...week, weekStart });
  workflowApi.selectTask = async (_w, taskId) => { week.tasks = [{ taskId, selected: true, selectionOrder: 0, plannedDates: [] }]; return structuredClone(week); };
  workflowApi.resources = async () => [];
  workflowApi.taskRecords = async () => [];
  workflowApi.addPlanDay = async (id, date) => { planDays = [...planDays, { taskId: id, date, order: 0 }]; return planDays.filter(d => d.taskId === id); };
  workflowApi.patchTask = async (id, revision, patch) => {
    patches.push({ id, revision, ...patch });
    const current = tasks.find(t => t.id === id)!;
    if (conflictNext) { tasks = tasks.map(t => t.id === id ? conflictNext!(t) : t); conflictNext = null; throw new ApiError(409, "Task changed"); }
    if (revision !== current.revision) throw new ApiError(409, "Task changed");
    tasks = tasks.map(t => t.id === id ? { ...t, ...patch, revision: (t.revision ?? 0) + 1 } : t);
    return structuredClone(tasks.find(t => t.id === id)!);
  };
  workflowApi.changeStatus = async (id, _revision, change) => { tasks = tasks.map(t => t.id === id ? { ...t, ...change, revision: (t.revision ?? 0) + 1 } : t); return structuredClone(tasks.find(t => t.id === id)!); };
  const root = createRoot(document.getElementById("root")!);
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const byLabel = <T extends Element>(label: string) => $<T>(`[aria-label="${label}"]`)!;
  const setValue = async (node: HTMLInputElement | HTMLTextAreaElement, value: string, commit: "focusout" | "change" = "focusout") => {
    await act(async () => {
      const proto = node instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
      node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      if (commit === "change") node.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      else node.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
    });
  };
  const select = async (node: HTMLSelectElement, value: string) => { await act(async () => { node.value = value; node.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); };
  const click = async (node: Element | null) => { assert.ok(node); await act(async () => (node as HTMLElement).click()); };
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  try {
    await act(async () => root.render(<WorkflowProvider><Todo/></WorkflowProvider>));
    await settle();
    // URL-selected Task is restored into the split detail; no modal/overlay, no stale S10 elements.
    const detail = () => $<HTMLElement>(".wf-split-detail")!;
    assert.ok(detail(), "detail pane opens from ?task=");
    assert.equal(byLabel<HTMLInputElement>("작업 제목").value, "Review split view");
    assert.equal($('[role="dialog"], [aria-modal="true"], .wf-modal-backdrop'), null);
    const text = detail().textContent ?? "";
    for (const stale of ["담당", "하위 Task", "템플릿", "파일 추가", "저장"]) if (stale !== "저장") assert.ok(!text.includes(stale), `no ${stale}`);
    assert.ok(!Array.from(detail().querySelectorAll("button")).some(button => button.textContent?.trim() === "저장"), "no explicit Save button");
    assert.ok(text.includes("연결 자료") && text.includes("최근 기록"));
    // Multiple plan dates render as chips; adding one persists through the plan-day relation.
    assert.equal(detail().querySelectorAll(".wf-td-chip").length, 2);
    await setValue(byLabel<HTMLInputElement>("계획 날짜 추가"), "2026-10-02", "change");
    await click(byLabel("계획 날짜 추가하기"));
    assert.equal(detail().querySelectorAll(".wf-td-chip").length, 3);
    // WAITING fields appear only for WAITING.
    assert.equal($('[aria-label="대기 정보"]'), null);
    await select(byLabel<HTMLSelectElement>("작업 상태"), "WAITING");
    assert.ok($('[aria-label="대기 정보"]'));
    assert.equal(tasks[0].status, "WAITING");
    // Left list stays interactive: the search filter survives while another row swaps the detail.
    const search = byLabel<HTMLInputElement>("작업 검색");
    await setValue(search, "plan", "change");
    await click(Array.from(document.querySelectorAll<HTMLButtonElement>(".wf-title-button")).find(button => button.textContent === "Plan the week")!);
    assert.equal(byLabel<HTMLInputElement>("작업 제목").value, "Plan the week");
    assert.equal(search.value, "plan");
    assert.ok(dom.window.location.search.includes("task=t2"), "selection written to URL");
    await setValue(search, "", "change");
    // Autosave sends only the changed field with the confirmed revision.
    await setValue(byLabel<HTMLTextAreaElement>("설명 / 메모"), "context for the week");
    assert.deepEqual(patches.at(-1), { id: "t2", revision: 1, memo: "context for the week" });
    assert.equal(tasks[1].memo, "context for the week");
    // Conflict on a field another window changed: no overwrite, draft kept, conflict surfaced.
    conflictNext = t => ({ ...t, memo: "written in another window", revision: (t.revision ?? 0) + 1 });
    await setValue(byLabel<HTMLTextAreaElement>("설명 / 메모"), "my local draft");
    await settle();
    assert.equal(tasks[1].memo, "written in another window");
    assert.equal(byLabel<HTMLTextAreaElement>("설명 / 메모").value, "my local draft");
    assert.ok($(".wf-td-alert")?.textContent?.includes("다른 창"));
    await click(Array.from(document.querySelectorAll("button")).find(button => button.textContent === "최신 값 사용")!);
    assert.equal(byLabel<HTMLTextAreaElement>("설명 / 메모").value, "written in another window");
    // A 409 caused by an unrelated field is rebased and retried automatically.
    conflictNext = t => ({ ...t, title: "Renamed in another window", revision: (t.revision ?? 0) + 1 });
    await select(byLabel<HTMLSelectElement>("작업 우선순위"), "HIGH");
    await settle();
    assert.equal(tasks[1].priority, "HIGH"); assert.equal(tasks[1].title, "Renamed in another window");
    // This Week selection is its own relation.
    await click(byLabel("이번 주 포함"));
    assert.equal(byLabel("이번 주 포함").getAttribute("aria-checked"), "true");
    // Another window's committed change triggers a refresh (own-window events are ignored).
    const before = gets;
    publishEntityChange({ entityType: "workflow", entityId: "data", revision: 1 });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
    assert.equal(gets, before, "own window events do not refetch");
    // A second window's announcement arrives through the storage fallback channel.
    const remote = { entityType: "workflow", entityId: "data", revision: 2, windowInstanceId: "other-window", eventId: "remote-1" };
    await act(async () => { dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key: ENTITY_CHANGE_STORAGE_KEY, newValue: JSON.stringify(remote) })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    assert.ok(gets > before, "other window event refreshes the store");
    // Closing keeps the list and clears the URL selection.
    await click(byLabel("상세 닫기"));
    assert.equal($(".wf-split-detail"), null);
    assert.ok(!dom.window.location.search.includes("task="));
    assert.ok($(".wf-todo-main"));
    // Locked navigation IA with legacy-compatible paths and no Archive.
    assert.deepEqual(WORKFLOW_NAV_CORE.map(item => [item.label, item.path]), [["Projects", "projects"], ["This Week", "week"], ["Workpad", "today"]]);
    assert.deepEqual(WORKFLOW_NAV_SUPPORT.map(item => [item.label, item.path]), [["All To-dos", "todo"], ["Waiting", "waiting"], ["Timeline", "timeline"]]);
    assert.ok(![...WORKFLOW_NAV_CORE, ...WORKFLOW_NAV_SUPPORT].some(item => /archive/i.test(item.label)));
  } finally {
    await act(async () => root.unmount());
    Object.assign(workflowApi, original);
    dom.window.close();
  }
});
