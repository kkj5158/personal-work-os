import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { TopicNote, WorkpadDay } from "../../lib/api/workflow";

test("Workpad wiki click saves source identity before opening and retains drafts on failure", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/workflow/today?date=2026-09-21", pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { React, window: win, document: win.document, localStorage: win.localStorage, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Element: win.Element, Node: win.Node, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  globalThis.requestAnimationFrame = callback => { callback(0); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  // The shared NoteEditor adapter is tested separately. Observe only whether
  // Workpad hands it the canonical ID after its source relationship is saved.
  const panelPath = require.resolve("./TopicNotePanel");
  const cachedPanel = require.cache[panelPath];
  require.cache[panelPath] = { id: panelPath, filename: panelPath, loaded: true, exports: {
    __esModule: true,
    default: ({ id, onClose }: { id: string; onClose: () => void }) => <div data-topic-id={id}><button onClick={onClose}>Close test note</button></div>,
  } } as NodeModule;
  const { createRoot } = await import("react-dom/client");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { GlobalTabsProvider } = await import("../../components/GlobalTabs");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { default: Today } = await import("./Today");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { ApiError } = await import("../../lib/api/client");
  const { newBlock } = await import("../../lib/workflow/workpad");
  const source = newBlock("TEXT", "Discuss [[Outlier]]");
  let day: WorkpadDay = { date: "2026-09-21", revision: 0, blocks: [source] };
  const original: TopicNote = { id: crypto.randomUUID(), workspaceId: null, title: "Outlier", scope: "WORK FLOW", content: "", version: 0 };
  const replacement: TopicNote = { ...original, id: crypto.randomUUID(), workspaceId: crypto.randomUUID(), scope: "Existing Workspace" };
  let failSave = true, deleted = false, resolves = 0;
  const operations: string[] = [], routes: string[] = [];
  workflowApi.get = async () => ({ projects: [], phases: [], tasks: [] });
  workflowApi.getDay = async () => structuredClone(day);
  workflowApi.saveDay = async (_date, input) => {
    if (failSave) throw new Error("Source save failed; draft retained");
    operations.push("save");
    day = { ...day, revision: input.revision + 1, blocks: structuredClone(input.blocks) };
    return structuredClone(day);
  };
  workflowApi.resolveNote = async title => { assert.equal(title, "Outlier"); resolves++; return [deleted ? replacement : original]; };
  workflowApi.getNote = async id => {
    assert.equal(id, original.id);
    if (deleted) throw new ApiError(404, "Note not found");
    return { ...original, title: "Renamed canonical note" };
  };
  const router = { push: (route: string) => { operations.push("navigate"); routes.push(route); } } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  const click = async (label: string) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(item => item.textContent === label);
    assert.ok(button, `${label} exists`);
    await act(async () => button.click());
  };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/workflow/today"><SearchParamsContext.Provider value={new URLSearchParams("date=2026-09-21")}><GlobalTabsProvider><WorkflowProvider><Today/></WorkflowProvider></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
    await click("↗ Outlier");
    assert.equal(resolves, 1);
    assert.equal(document.querySelector("[data-topic-id]"), null);
    assert.match(document.body.textContent!, /Source save failed/);
    assert.equal(document.querySelector<HTMLTextAreaElement>(".wp-block-body textarea")!.value, source.content);
    assert.deepEqual(day.blocks[0].metadata, {});
    failSave = false;
    await click("↗ Outlier");
    assert.equal(document.querySelector("[data-topic-id]")?.getAttribute("data-topic-id"), original.id);
    assert.equal(resolves, 1, "retry and rename use the bound stable ID, not another title lookup");
    assert.deepEqual(day.blocks[0].metadata.wikiLinks, [{ name: "Outlier", ordinal: 0, noteId: original.id }]);
    await click("Close test note");
    deleted = true;
    await click("↗ Outlier");
    assert.equal(resolves, 2);
    assert.deepEqual(day.blocks[0].metadata.wikiLinks, [{ name: "Outlier", ordinal: 0, noteId: replacement.id }]);
    assert.equal(day.blocks[0].id, source.id);
    assert.deepEqual(operations, ["save", "save", "navigate"]);
    assert.deepEqual(routes, [`/notes?note=${replacement.id}&workspace=${replacement.workspaceId}`]);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    if (cachedPanel) require.cache[panelPath] = cachedPanel; else delete require.cache[panelPath];
  }
});
