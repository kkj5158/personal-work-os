import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { Project, ProjectGroup, WorkTask } from "../../lib/api/workflow";

/** Projects catalog: groups, 그룹 없음 projection, numbering, handle vs row, group CRUD, optimistic move + rollback. */
test("Project Groups: catalog render, handle vs row, create/rename/delete, move persistence and rollback", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/projects", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true, localStorage: dom.window.localStorage });
  const { createRoot } = await import("react-dom/client");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { ApiError } = await import("../../lib/api/client");
  const { WorkflowProvider, useWorkflow } = await import("./WorkflowContext");
  const { default: Projects } = await import("./Projects");
  const { moveInCatalog } = await import("../../lib/workflow/catalog");
  const base = { startDate: null, endDate: null, memo: null, status: "ACTIVE" as const, color: "#0969da" };
  let groups: ProjectGroup[] = [{ id: "g-life", name: "Life", order: 1, revision: 0 }, { id: "g-work", name: "Work", order: 0, revision: 0 }];
  let projects: Project[] = [
    { id: "p1", title: "Alpha", order: 1, groupId: "g-work", revision: 0, ...base }, { id: "p2", title: "Beta", order: 0, groupId: "g-work", revision: 0, ...base },
    { id: "p3", title: "Gamma", order: 0, groupId: "g-life", revision: 0, ...base }, { id: "p4", title: "Loose", order: 0, groupId: null, revision: 0, ...base },
  ];
  const tasks: WorkTask[] = [];
  let failMove: Error | null = null;
  const calls: string[] = [];
  workflowApi.get = async () => structuredClone({ projects, phases: [], tasks, planDays: [], groups });
  workflowApi.getPreferences = async () => ({});
  workflowApi.week = async start => ({ weekStart: start, revision: 0, focusSlots: [0, 1, 2].map(slot => ({ slot, title: "", memo: "" })), goals: [], projects: [], tasks: [], planDays: [] });
  workflowApi.createGroup = async name => { calls.push(`create:${name}`); const group = { id: `g-${name}`, name, order: groups.length, revision: 0 }; groups = [...groups, group]; return structuredClone(group); };
  workflowApi.renameGroup = async (id, revision, name) => { calls.push(`rename:${id}:${revision}:${name}`); groups = groups.map(group => group.id === id ? { ...group, name, revision: group.revision + 1 } : group); return structuredClone(groups.find(group => group.id === id)!); };
  workflowApi.deleteGroup = async id => { calls.push(`delete:${id}`); const max = Math.max(-1, ...projects.filter(p => !p.groupId).map(p => p.order)); let next = max + 1; projects = projects.map(p => p.groupId === id ? { ...p, groupId: null, order: next++ } : p); groups = groups.filter(group => group.id !== id); return structuredClone(projects); };
  workflowApi.moveProject = async (id, groupId, before, revision) => {
    calls.push(`move:${id}:${groupId}:${before}:${revision}`);
    if (failMove) throw failMove;
    projects = moveInCatalog(projects, groups, id, groupId, before).map(p => p.id === id ? { ...p, revision: (p.revision ?? 0) + 1 } : p); return structuredClone(projects);
  };
  let flow: ReturnType<typeof useWorkflow> | null = null;
  function Probe() { flow = useWorkflow(); return null; }
  const root = createRoot(document.getElementById("root")!);
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  await act(async () => root.render(<WorkflowProvider><Probe/><Projects/></WorkflowProvider>)); await settle();
  const sections = () => [...document.querySelectorAll<HTMLElement>(".wf-catalog-group")].map(section => `${section.getAttribute("aria-label")}:${[...section.querySelectorAll(".wf-project-name")].map(name => name.textContent).join(",")}`);
  const numbers = () => [...document.querySelectorAll(".wf-project-index")].map(node => node.textContent).join(",");

  assert.deepEqual(sections(), ["Work 그룹:Beta,Alpha", "Life 그룹:Gamma", "그룹 없음 그룹:Loose"], "group order, manual order inside, 그룹 없음 last");
  assert.equal(numbers(), "01,02,03,04", "01/02… follow the catalog display order");

  // Handle is a row control (drag only); the row body opens the Project.
  const alpha = document.querySelector<HTMLElement>('[data-project-id="p1"]')!;
  await act(async () => alpha.querySelector<HTMLButtonElement>(".wf-drag-handle")!.click()); await settle();
  assert.ok(!dom.window.location.search.includes("project="), "handle click does not open the Project");
  assert.ok(document.querySelector(".wf-project-detail") === null, "still on the list");
  assert.ok(alpha.querySelector('[aria-label="Alpha 순서 변경"]'), "handle has an accessible name");

  // Optimistic move → persisted catalog; the revision guards against a stale drag.
  await act(async () => { await flow!.moveProject("p1", "g-life", "p3"); }); await settle();
  assert.deepEqual(sections(), ["Work 그룹:Beta", "Life 그룹:Alpha,Gamma", "그룹 없음 그룹:Loose"]);
  assert.equal(calls.at(-1), "move:p1:g-life:p3:0");
  // Failure: exact previous catalog restored + clear conflict message.
  failMove = new ApiError(409, "conflict");
  await act(async () => { await flow!.moveProject("p4", "g-work", null).catch(error => assert.match(String(error), /최신 순서로 되돌렸습니다/)); }); await settle();
  assert.deepEqual(sections(), ["Work 그룹:Beta", "Life 그룹:Alpha,Gamma", "그룹 없음 그룹:Loose"], "rollback after a refused move");
  failMove = null;

  // Group create / rename / delete (Projects are never deleted).
  const addButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("그룹") && button.classList.contains("wf-group-add"))!;
  await act(async () => addButton.click());
  const nameInput = document.querySelector<HTMLInputElement>('input[aria-label="그룹 이름"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(nameInput, "Study"); nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  await act(async () => nameInput.form!.requestSubmit()); await settle();
  assert.ok(calls.includes("create:Study")); assert.ok(sections().some(section => section.startsWith("Study 그룹:")), "new empty group rendered as a drop target");
  const deleteLife = document.querySelector<HTMLButtonElement>('[aria-label="Life 그룹 삭제"]')!;
  await act(async () => deleteLife.click());
  assert.match(document.body.textContent!, /프로젝트 2개는 그룹 없음으로 이동합니다/);
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".wf-danger-text")].find(button => button.textContent === "삭제")!.click()); await settle();
  assert.deepEqual(sections(), ["Work 그룹:Beta", "Study 그룹:", "그룹 없음 그룹:Loose,Alpha,Gamma"], "deleted group's Projects follow 그룹 없음 in order");
  assert.equal(projects.length, 4);

  // Collapse is a per-viewer convenience that survives re-render and never touches data.
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Work 접기/펼치기"]')!.click());
  assert.ok(!sections()[0].includes("Beta")); assert.equal(localStorage.getItem("wf.projects.collapsedGroups"), JSON.stringify(["g-work"]));
  await act(async () => root.unmount());
});
