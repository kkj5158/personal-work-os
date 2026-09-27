import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Phase, PlanDay, Project, ResourceInput, WeekView, WorkTask } from "../../lib/api/workflow";

/** Batch 4 Projects S01/S02/S03 over a fake backend with the V1 service semantics. */
test("Projects: S01 filters/archive, S03 create variants, weights/override, Phase delete, week projection, resources, records, S10", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/projects", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { mondayOf } = await import("../../lib/workflow/store");
  const { toDateKey } = await import("../../lib/date");
  const { seoulToday } = await import("../../lib/seoulDate");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: Projects } = await import("./Projects");
  const original = { ...workflowApi };
  const W = mondayOf(toDateKey(seoulToday()));
  let n = 0;
  const base = { startDate: null, endDate: null, memo: null } as const;
  let projects: Project[] = [
    { id: "pa", title: "Active one", status: "ACTIVE", color: "#0969da", order: 0, revision: 0, goal: "Ship the flow", ...base },
    { id: "pp", title: "Paused one", status: "PAUSED", color: "#8250df", order: 1, revision: 0, ...base },
    { id: "px", title: "Archived one", status: "DONE", color: "#1a7f37", order: 2, revision: 0, archivedAt: "2026-09-01T00:00:00Z", ...base },
  ];
  let phases: Phase[] = [{ id: "fa", projectId: "pa", title: "Build", status: "TODO", order: 0, revision: 0, weight: 60, ...base }, { id: "fb", projectId: "pa", title: "Verify", status: "TODO", order: 1, revision: 0, weight: 40, ...base }];
  const mk = (id: string, title: string, extra: Partial<WorkTask>): WorkTask => ({ id, title, status: "TODO", projectId: "pa", phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0, revision: 1, deadlineDate: null, ...extra });
  let tasks: WorkTask[] = [mk("t1", "Build screen", { phaseId: "fa", status: "DONE" }), mk("t2", "Wire API", { phaseId: "fa", order: 1 }), mk("t3", "Test it", { phaseId: "fb" }), mk("t4", "Loose note", {})];
  const planDays: PlanDay[] = [];
  const week = { projects: [] as { projectId: string; order: number; scopeLine: string | null }[], tasks: [] as string[] };
  const calls: { kind: string; body: unknown }[] = [];
  const bump = <T extends { id: string; revision?: number }>(list: T[], id: string, patch: object) => list.map(item => item.id === id ? { ...item, ...patch, revision: (item.revision ?? 0) + 1 } : item);
  workflowApi.get = async () => structuredClone({ projects, phases, tasks, planDays });
  workflowApi.getPreferences = async () => ({});
  workflowApi.week = async start => structuredClone({ weekStart: start, revision: 0, focusSlots: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [], projects: week.projects,
    tasks: week.tasks.map((taskId, i) => ({ taskId, selected: true, selectionOrder: i, plannedDates: [] })), planDays: [] } satisfies WeekView);
  workflowApi.includeProject = async (start, projectId) => { calls.push({ kind: "include", body: [start, projectId] }); if (!week.projects.some(p => p.projectId === projectId)) week.projects.push({ projectId, order: week.projects.length, scopeLine: null }); return workflowApi.week(start); };
  workflowApi.excludeProject = async (start, projectId) => { week.projects = week.projects.filter(p => p.projectId !== projectId); return workflowApi.week(start); };
  workflowApi.selectTask = async (start, taskId) => { calls.push({ kind: "select", body: [start, taskId] }); if (!week.tasks.includes(taskId)) week.tasks.push(taskId); return workflowApi.week(start); };
  workflowApi.saveProject = async input => { calls.push({ kind: "createProject", body: input }); const saved = { ...input, id: `np${++n}`, revision: 0, projectType: input.projectType ?? "GENERAL", status: input.status ?? "READY" } as Project; projects = [...projects, saved]; return structuredClone(saved); };
  workflowApi.savePhase = async input => { calls.push({ kind: "createPhase", body: input }); const saved = { ...input, id: `nf${++n}`, revision: 0 } as Phase; phases = [...phases, saved]; return structuredClone(saved); };
  workflowApi.patchProject = async (id, _r, patch) => { calls.push({ kind: "patchProject", body: patch }); projects = bump(projects, id, patch); return structuredClone(projects.find(p => p.id === id)!); };
  workflowApi.patchPhase = async (id, _r, patch) => { calls.push({ kind: "patchPhase", body: { id, ...patch } }); phases = bump(phases, id, patch); return structuredClone(phases.find(p => p.id === id)!); };
  workflowApi.patchTask = async (id, _r, patch) => { tasks = bump(tasks, id, patch); return structuredClone(tasks.find(t => t.id === id)!); };
  workflowApi.archiveProject = async (id, _r, archived) => { calls.push({ kind: "archive", body: [id, archived] }); projects = bump(projects, id, { archivedAt: archived ? "2026-09-27T00:00:00Z" : null }); return structuredClone(projects.find(p => p.id === id)!); };
  // Server semantics: deleting a Phase moves its Tasks to 미분류 (same ids), then removes the Phase.
  workflowApi.deletePhase = async id => { calls.push({ kind: "deletePhase", body: id }); tasks = tasks.map(t => t.phaseId === id ? { ...t, phaseId: null, revision: (t.revision ?? 0) + 1 } : t); phases = phases.filter(p => p.id !== id); };
  workflowApi.resources = async owner => { calls.push({ kind: "resources", body: owner }); return []; };
  workflowApi.createResource = async (input: ResourceInput) => { calls.push({ kind: "createResource", body: input }); return { id: "r1", projectId: input.projectId ?? null, taskId: null, noteId: null, url: input.url ?? null, title: input.title ?? "link", type: "WEB", memo: null, order: 0, pinned: false }; };
  workflowApi.projectRecords = async () => [{ date: "2026-09-26", blockId: "b1", taskId: "t1", taskTitle: "Build screen", excerpt: "Wired the list", hasImage: true, hasNote: false, href: "/workflow/today?date=2026-09-26&block=b1" }];
  workflowApi.taskRecords = async () => [];
  const root = createRoot(document.getElementById("root")!);
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
  const byLabel = <T extends Element>(label: string) => $<T>(`[aria-label="${label}"]`)!;
  const settle = (ms = 20) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const click = async (node: Element | null | undefined) => { assert.ok(node, "node exists"); await act(async () => { node!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(); };
  const text = (label: string) => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
  const type = async (node: HTMLInputElement | HTMLTextAreaElement, value: string, blur = false) => { await act(async () => { const proto = node instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value); node.dispatchEvent(new dom.window.Event("input", { bubbles: true })); if (blur) node.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true })); }); await settle(); };
  const rows = () => [...document.querySelectorAll(".wf-project-row .wf-project-name")].map(node => node.textContent?.trim());
  try {
    await act(async () => root.render(<WorkflowProvider><Projects/></WorkflowProvider>));
    await settle(60);
    // S01: one row per Project; default filters 준비 + 진행; archived excluded until 보관됨.
    assert.deepEqual(rows(), ["Active one"]);
    assert.match($(".wf-project-row")!.textContent!, /Ship the flow/); assert.match($(".wf-project-row")!.textContent!, /가중치 미확정/, "미분류 Tasks without an unassigned weight keep weighting unconfirmed");
    await click([...document.querySelectorAll(".wf-projects-filters button")].find(b => b.textContent!.startsWith("보류")));
    assert.deepEqual(rows(), ["Active one", "Paused one"]);
    await click([...document.querySelectorAll(".wf-projects-filters button")].find(b => b.textContent!.includes("보관됨")));
    assert.deepEqual(rows(), ["Archived one"], "archived only in 보관됨");
    await click($(".wf-project-row .wf-project-meta button"));
    assert.deepEqual(calls.find(c => c.kind === "archive")!.body, ["px", false]); assert.equal(projects.find(p => p.id === "px")!.archivedAt, null, "restored");
    // S03: name-only creation → READY, GENERAL, no Phases.
    await click(text("새 프로젝트"));
    assert.ok($(".wf-split.has-detail [aria-label='새 프로젝트 만들기']"), "non-modal split create panel");
    await type(byLabel<HTMLInputElement>("프로젝트 이름"), "Name only");
    await act(async () => { byLabel("새 프로젝트 만들기").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); await settle(60);
    const nameOnly = projects.find(p => p.title === "Name only")!;
    assert.equal(nameOnly.status, "READY"); assert.equal(nameOnly.projectType, "GENERAL"); assert.equal(phases.filter(p => p.projectId === nameOnly.id).length, 0);
    assert.match(window.location.search, new RegExp(`project=${nameOnly.id}`), "the new Project opens");
    await click([...document.querySelectorAll(".wf-project-crumbs button")][0]);
    // S03 with type + basic groups (25/25/25/25 suggestion; creation not blocked by weights).
    await click(text("새 프로젝트"));
    await type(byLabel<HTMLInputElement>("프로젝트 이름"), "With groups");
    await click([...byLabel("프로젝트 종류").querySelectorAll("button")].find(b => b.textContent === "개발"));
    await click(text("기본 작업 묶음 적용"));
    await type(byLabel<HTMLInputElement>("묶음 4 가중치"), "");
    await act(async () => { byLabel("새 프로젝트 만들기").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); await settle(60);
    const grouped = projects.find(p => p.title === "With groups")!;
    assert.equal(grouped.projectType, "DEVELOPMENT");
    assert.deepEqual(phases.filter(p => p.projectId === grouped.id).map(p => [p.title, p.weight ?? null]), [["기획", 25], ["디자인", 25], ["구현", 25], ["검증", null]], "groups created, unconfirmed weight allowed");
    assert.match($(".wf-project-summary-strip")!.textContent!, /작업 수 기준|가중치 미확정/);

    // S02 detail for the seeded Project.
    await click([...document.querySelectorAll(".wf-project-crumbs button")][0]);
    await click([...document.querySelectorAll(".wf-project-row")].find(row => row.textContent!.includes("Active one")));
    assert.match($(".wf-project-summary-strip")!.textContent!, /가중치 미확정/, "미분류 has Tasks but no unassigned weight");
    assert.equal([...document.querySelectorAll(".wf-phase-section")][0].getAttribute("aria-label"), "미분류 작업");
    assert.match(byLabel("다음에 이어갈 작업").textContent!, /Loose note/, "resume candidate: first open Task in manual order (미분류 first)");
    // Weights: unassigned weight completes the weighting; override replaces auto progress.
    await click(text("가중치 설정"));
    await type(byLabel<HTMLInputElement>("Build 가중치"), "50", true);
    await type(byLabel<HTMLInputElement>("Verify 가중치"), "30", true);
    await type(byLabel<HTMLInputElement>("미분류 작업 가중치"), "20", true);
    assert.equal(projects.find(p => p.id === "pa")!.unassignedWeight, 20);
    assert.match($(".wf-project-summary-strip")!.textContent!, /가중치 기준/);
    await type(byLabel<HTMLInputElement>("Verify 수동 진행률"), "50", true);
    assert.ok(calls.some(c => c.kind === "patchPhase" && (c.body as { progressOverride?: number }).progressOverride === 50));
    assert.match($(".wf-project-summary-strip")!.textContent!, /(\d+)%/);
    // 50%*50 (Build 1/2) + 50%*30 (Verify override) + 0%*20 = 40%
    assert.match($(".wf-project-summary-strip")!.textContent!, /40%/);
    // This Week projection writes the same weekly model S04 uses.
    await click([...byLabel("이번 주 계획").querySelectorAll("button")].find(b => b.textContent === "이번 주에 포함"));
    assert.deepEqual(calls.find(c => c.kind === "include")!.body, [W, "pa"]);
    await click([...byLabel("이번 주 계획").querySelectorAll("button")].find(b => b.textContent!.includes("이번 주에 작업 추가")));
    await click(byLabel("Wire API 이번 주 선택"));
    assert.deepEqual(calls.find(c => c.kind === "select")!.body, [W, "t2"]);
    assert.match(byLabel("이번 주 계획").textContent!, /Wire API/);
    // Linked resources + recent Workpad projection.
    assert.ok(calls.some(c => c.kind === "resources" && (c.body as { projectId?: string }).projectId === "pa"), "resources loaded by projectId");
    await click([...byLabel("프로젝트 맥락").querySelectorAll("button")].find(b => b.textContent === "+ 링크 연결"));
    await type(byLabel<HTMLInputElement>("자료 URL"), "https://example.com/spec");
    await act(async () => { byLabel("자료 URL").closest("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); await settle();
    assert.equal((calls.find(c => c.kind === "createResource")!.body as ResourceInput).projectId, "pa");
    const record = byLabel("최근 기록").querySelector("a")!;
    assert.equal(record.getAttribute("href"), "/workflow/today?date=2026-09-26&block=b1"); assert.match(record.textContent!, /Wired the list/); assert.match(record.textContent!, /이미지/);
    // S10 from a row keeps the Project page (non-modal).
    await click(document.querySelector('.wf-task-row[data-task-id="t3"]'));
    assert.ok($(".wf-split.has-detail .wf-td") && $(".wf-project-detail"), "S10 opens beside the still-visible Project");
    await click(byLabel("상세 닫기"));
    // Settings: Phase reorder and delete → Tasks become 미분류 (same ids).
    await click(text("설정"));
    await click(byLabel("Verify 위로"));
    assert.deepEqual(phases.filter(p => p.projectId === "pa").sort((a, b) => a.order - b.order).map(p => p.id), ["fb", "fa"]);
    await click(byLabel("Build 삭제")); await click(text("삭제"));
    await settle(60);
    assert.equal(calls.filter(c => c.kind === "deletePhase").length, 1);
    assert.deepEqual(tasks.filter(t => ["t1", "t2"].includes(t.id)).map(t => t.phaseId), [null, null]);
    assert.ok(byLabel("미분류 작업").querySelector('[data-task-id="t2"]'), "moved Tasks render under 미분류");
    // Archive from detail, then it disappears from the active list.
    await click(text("보관"));
    assert.ok(projects.find(p => p.id === "pa")!.archivedAt);
  } finally { Object.assign(workflowApi, original); await act(async () => root.unmount()); dom.window.close(); }
});
