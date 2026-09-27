import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { PlanDay, Phase, Project, WorkpadDay, WorkTask } from "../../lib/api/workflow";

/**
 * Batch 3 Workpad integration: Today Planned projection, idempotent Add to Today, TaskReference meta line,
 * linked vs ordinary check, previousStatus restore, Continue, and cross-window status convergence.
 */
async function main() {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const { toDateKey } = await import("../../lib/date");
  const { seoulToday } = await import("../../lib/seoulDate");
  const TODAY = toDateKey(seoulToday());
  const dom = new JSDOM("<div id='root'></div>", { url: `https://orbit.local/workflow/today?date=${TODAY}`, pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { React, window: win, document: win.document, localStorage: win.localStorage, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Element: win.Element, Node: win.Node, sessionStorage: win.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  globalThis.requestAnimationFrame = callback => { callback(0); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import("react-dom/client");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { newBlock } = await import("../../lib/workflow/workpad");
  const { addDaysKey } = await import("../../lib/workflow/store");
  const { ENTITY_CHANGE_STORAGE_KEY } = await import("../../lib/windowSync");
  const { default: Today } = await import("./Today");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { GlobalTabsProvider } = await import("../../components/GlobalTabs");
  const TOMORROW = addDaysKey(TODAY, 1);
  const projects: Project[] = [{ id: "p1", title: "WORK FLOW", status: "ACTIVE", startDate: null, endDate: null, color: "#0969da", memo: null, order: 0, revision: 0 }];
  const phases: Phase[] = [{ id: "f1", projectId: "p1", title: "Implementation", status: "TODO", startDate: null, endDate: null, memo: null, order: 0, revision: 0 }];
  const make = (id: string, title: string, extra: Partial<WorkTask> = {}): WorkTask => ({ id, title, status: "TODO", projectId: "p1", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, ...extra });
  let tasks: WorkTask[] = [
    make("t1", "Wire the week board", { status: "DOING", phaseId: "f1", priority: "HIGH", deadlineDate: "2026-09-30" }),
    make("t2", "Legacy range only", { dueDate: "2026-10-09", startDate: "2026-10-01" }),
  ];
  const planDays: PlanDay[] = [{ taskId: "t1", date: TODAY, order: 0 }, { taskId: "t2", date: TODAY, order: 1 }];
  const note = newBlock("TEXT", "Morning notes"), plain = newBlock("CHECKLIST", "Local check"); plain.order = 1;
  const days: Record<string, WorkpadDay> = { [TODAY]: { date: TODAY, revision: 0, blocks: [note, plain] } };
  const statusCalls: { id: string; status: string }[] = [];
  workflowApi.get = async () => structuredClone({ projects, phases, tasks, planDays });
  workflowApi.getDay = async date => structuredClone(days[date] ?? { date, revision: 0, blocks: [] });
  workflowApi.saveDay = async (date, day) => { assert.equal(day.revision, days[date]?.revision ?? 0); days[date] = { date, revision: day.revision + 1, blocks: structuredClone(day.blocks) }; return structuredClone(days[date]); };
  workflowApi.week = async start => ({ weekStart: start, revision: 0, focusSlots: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [], projects: [], tasks: [], planDays: [] });
  // Server semantics of ensureReference: upsert the plan day, then reuse or create exactly one primary reference.
  const ensure = async (id: string, date: string) => {

    const task = tasks.find(t => t.id === id)!;
    const planned = !planDays.some(p => p.taskId === id && p.date === date); if (planned) planDays.push({ taskId: id, date, order: 9 });
    const day = days[date] ??= { date, revision: 0, blocks: [] };
    const existing = day.blocks.find(b => b.workTaskId === id);
    if (existing) return { day: structuredClone(day), blockId: existing.id, created: false, planDayCreated: planned };
    const block = { ...newBlock("CHECKLIST", task.title), workTaskId: id, order: day.blocks.length, metadata: { taskRef: "primary" } };
    day.blocks = [...day.blocks, block]; day.revision++;
    return { day: structuredClone(day), blockId: block.id, created: true, planDayCreated: planned };
  };
  workflowApi.addToToday = ensure;
  workflowApi.continueTask = ensure;
  workflowApi.changeStatus = async (id, revision, change) => {
    const current = tasks.find(t => t.id === id)!;
    assert.equal(revision, current.revision, "status command is revision-checked");
    statusCalls.push({ id, status: change.status });
    tasks = tasks.map(t => t.id === id ? { ...t, status: change.status, previousStatus: t.status, revision: (t.revision ?? 0) + 1 } : t);
    return structuredClone(tasks.find(t => t.id === id)!);
  };
  const root = createRoot(document.getElementById("root")!);
  const params = new URLSearchParams(`date=${TODAY}`);
  const router = { push: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/workflow/today"><SearchParamsContext.Provider value={params}><GlobalTabsProvider><WorkflowProvider><Today/></WorkflowProvider></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const settle = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  await settle(80);
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const click = async (node: Element | null | undefined) => { assert.ok(node, "node exists"); await act(async () => { (node as HTMLElement).click(); }); await settle(); };
  const strip = () => $<HTMLElement>('[aria-label="오늘 예정"]');
  const linkedBlocks = (date = TODAY) => (days[date]?.blocks ?? []).filter(b => b.workTaskId);
  const pass = (label: string) => console.log(`PASS B3 ${label}`);

  // Today Planned: projection only.
  assert.ok(strip(), "Today Planned renders for plan days on this date");
  assert.match(strip()!.textContent!, /Wire the week board/); assert.match(strip()!.textContent!, /Legacy range only/);
  assert.equal(days[TODAY].blocks.length, 2, "projection does not create body blocks"); assert.equal(days[TODAY].revision, 0);
  await click(strip()!.querySelector(".wp-planned-toggle")); assert.equal(strip()!.querySelector("ul"), null, "collapsible");
  await click(strip()!.querySelector(".wp-planned-toggle")); assert.ok(strip()!.querySelector("ul"));
  pass("projection renders, collapses, writes nothing");

  // Add to Today: one primary reference, repeat is idempotent.
  await click([...strip()!.querySelectorAll("li")].find(li => li.textContent!.includes("Wire the week board"))!.querySelector(".wp-planned-add"));
  await settle(60);
  assert.equal(linkedBlocks().length, 1, "one TaskReference created");
  const stripRow = [...strip()!.querySelectorAll("li")].find(li => li.textContent!.includes("Wire the week board"))!;
  assert.ok(stripRow.querySelector(".wp-planned-open"), "strip now offers to jump to the existing reference");
  await ensure("t1", TODAY); await ensure("t1", TODAY);
  assert.equal(linkedBlocks().length, 1, "repeated Add to Today reuses the primary reference");
  assert.equal(planDays.filter(p => p.taskId === "t1" && p.date === TODAY).length, 1, "same plan day");
  pass("Add to Today idempotent");

  // Meta line: Project · Phase · Priority · real deadline only.
  const meta = () => [...document.querySelectorAll(".wp-task-link")].map(node => node.textContent!.trim());
  assert.ok(meta().includes("WORK FLOW · Implementation · 높음 · 마감 9.30"), `meta line: ${meta().join(" | ")}`);
  await click([...strip()!.querySelectorAll("li")].find(li => li.textContent!.includes("Legacy range only"))!.querySelector(".wp-planned-add"));
  await settle(60);
  assert.ok(meta().includes("WORK FLOW · 보통"), `legacy due is not a deadline, no phase: ${meta().join(" | ")}`);
  pass("TaskReference meta line");

  // Ordinary checklist stays local; linked check completes the canonical Task and uncheck restores previousStatus.
  await click(document.querySelector('[aria-label="Complete Local check"]'));
  await settle(700);
  assert.equal(statusCalls.length, 0, "ordinary checklist never mutates a Task");
  assert.equal(days[TODAY].blocks.find(b => b.id === plain.id)!.checked, true);
  await click(document.querySelector('[aria-label="Complete Wire the week board"]'));
  await settle(60);
  assert.equal(tasks.find(t => t.id === "t1")!.status, "DONE");
  await click(document.querySelector('[aria-label="Complete Wire the week board"]'));
  await settle(60);
  assert.equal(tasks.find(t => t.id === "t1")!.status, "DOING", "uncheck restores previousStatus DOING, not TODO");
  pass("linked vs ordinary check, previousStatus restore");
  // Strikethrough is formatting only, even on a linked TaskReference.
  const callsBefore = statusCalls.length, linkedRef = linkedBlocks().find(b => b.workTaskId === "t1")!;
  const text = document.querySelector<HTMLElement>(`#wp-${linkedRef.id} .wp-text-input`)!;
  await act(async () => { text.dispatchEvent(new win.KeyboardEvent("keydown", { key: "X", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); });
  await settle(700);
  assert.equal(days[TODAY].blocks.find(b => b.id === linkedRef.id)!.metadata.strike, true, "struck through");
  assert.equal(statusCalls.length, callsBefore, "strikethrough never changes the Task");
  assert.equal(tasks.find(t => t.id === "t1")!.status, "DOING");
  pass("strikethrough is formatting only");

  // Continue: same Task on tomorrow; today's record untouched and nothing copied.
  const todayBefore = JSON.stringify(days[TODAY].blocks);
  const linked = linkedBlocks().find(b => b.workTaskId === "t1")!;
  const grip = document.querySelector(`#wp-${linked.id} .wp-grip`)!;
  await act(async () => { grip.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); }); await settle();
  const menu = $<HTMLElement>('[aria-label="같은 작업 이어하기"]')!;
  assert.ok(menu, "Continue is in the block menu");
  await click([...menu.querySelectorAll("button")].find(b => b.textContent === "이어하기"));
  await settle(60);
  assert.equal(JSON.stringify(days[TODAY].blocks), todayBefore, "old Workpad record preserved");
  assert.equal(days[TOMORROW].blocks.length, 1, "only the reference is created on the target date (no memo/image copy)");
  assert.equal(days[TOMORROW].blocks[0].workTaskId, "t1");
  const again = await ensure("t1", TOMORROW); assert.equal(again.created, false, "Continue reuses the target reference");
  pass("Continue preserves history and reuses the target reference");

  // A completed Task is not silently reopened by Continue.
  await click(document.querySelector('[aria-label="Complete Wire the week board"]')); await settle(60);
  assert.equal(tasks.find(t => t.id === "t1")!.status, "DONE");
  await act(async () => { grip.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); }); await settle();
  await click([...$<HTMLElement>('[aria-label="같은 작업 이어하기"]')!.querySelectorAll("button")].find(b => b.textContent === "이어하기"));
  await settle(60);
  assert.equal(tasks.find(t => t.id === "t1")!.status, "DONE", "Continue does not reopen");
  assert.match(document.body.textContent!, /자동으로 다시 열리지 않습니다/);
  pass("completed Task stays completed on Continue");

  // Cross-window: another window reopens the Task; this window converges.
  tasks = tasks.map(t => t.id === "t1" ? { ...t, status: "TODO", title: "Wire the week board v2", revision: (t.revision ?? 0) + 1 } : t);
  await act(async () => { win.dispatchEvent(new win.StorageEvent("storage", { key: ENTITY_CHANGE_STORAGE_KEY, newValue: JSON.stringify({ entityType: "workflow", entityId: "data", revision: 5, windowInstanceId: "other", eventId: "x1" }) })); });
  await settle(300);
  assert.equal(document.querySelector<HTMLInputElement>(`#wp-${linked.id} .wp-checkbox`)!.checked, false, "status converges");
  assert.equal(document.querySelector(`#wp-${linked.id} .wp-text-input`)!.textContent, "Wire the week board v2", "title converges");
  pass("multi-window status/title convergence");
  await act(async () => root.unmount()); dom.window.close();
}
void main().then(() => { console.log("workpad-b3 ok"); process.exit(0); }, error => { console.error(error); process.exit(1); });
