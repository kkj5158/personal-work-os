import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { WorkpadDay, WorkTask } from "../../lib/api/workflow";
import type { TextElement } from "./EditableText";

/** Workpad real-use fixes: caret after Enter/delete, IME-safe Markdown, empty-leaf delete, numbered headings, calm chrome. */
test("Workpad: Markdown after delete, focus race, IME heal, empty leaf delete, numbered heading, toolbar/helper UI", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/workflow/today?date=2026-09-14", pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { React, window: win, document: win.document, DOMParser: win.DOMParser, localStorage: win.localStorage, sessionStorage: win.sessionStorage, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Element: win.Element, Node: win.Node, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  win.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import("react-dom/client");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { newBlock } = await import("../../lib/workflow/workpad");
  const { default: Today } = await import("./Today");
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { GlobalTabsProvider } = await import("../../components/GlobalTabs");
  const parent = newBlock("TEXT", "Parent"), child = newBlock("BULLET", "", null); child.parentId = parent.id;
  const days: Record<string, WorkpadDay> = { "2026-09-14": { date: "2026-09-14", revision: 0, blocks: [parent, child] } };
  const tasks: WorkTask[] = [];
  workflowApi.get = async () => ({ projects: [], phases: [], tasks: structuredClone(tasks) });
  workflowApi.getDay = async date => structuredClone(days[date] ?? { date, revision: 0, blocks: [] });
  workflowApi.saveDay = async (date, day) => { days[date] = { date, revision: day.revision + 1, blocks: structuredClone(day.blocks) }; return structuredClone(days[date]); };
  workflowApi.plan = async () => [];
  const router = { push: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/workflow/today"><SearchParamsContext.Provider value={new URLSearchParams("date=2026-09-14")}><GlobalTabsProvider><WorkflowProvider><Today/></WorkflowProvider></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  await settle();
  const editors = () => Array.from(document.querySelectorAll<TextElement>(".wp-block-body > .wp-text-input"));
  const blockOf = (editor: Element) => editor.closest(".wp-block")!;
  const type = async (element: TextElement, value: string, isComposing = false) => act(async () => {
    element.textContent = value; element.setSelectionRange(value.length, value.length);
    element.closest(".wp-editor")!.dispatchEvent(new win.InputEvent("input", { bubbles: true, inputType: "insertText", isComposing }));
  });
  /** Dispatches a key inside act() but deliberately WITHOUT waiting a frame, like a fast typist. */
  const keyNow = async (element: HTMLElement, key: string, options: KeyboardEventInit = {}) => act(async () => { element.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); });
  const caretTo = async (element: TextElement, at: number) => act(async () => { element.focus(); element.setSelectionRange(at, at); });

  // Calm chrome: Commands & formatting is open by default; the Block details / keyboard helper is gone (Dock keeps shortcuts).
  assert.ok([...document.querySelectorAll("[role=toolbar]")].some(element => element.getAttribute("aria-label") === "Commands & formatting"), "toolbar visible without a toggle");
  assert.equal(document.querySelector("details.wp-tools"), null);
  assert.ok(!document.body.textContent!.includes("Block details & keyboard help"), "helper summary removed");
  assert.equal(document.querySelector(".wp-cheatsheet"), null, "inline shortcut cheatsheet removed");

  // Empty leaf Backspace deletes immediately (even nested / non-TEXT), caret to the previous block end; Undo restores type + parent.
  await caretTo(editors()[1], 0); await keyNow(editors()[1], "Backspace"); await settle();
  assert.equal(editors().length, 1, "empty nested bullet removed, not outdented");
  assert.equal(document.activeElement, editors()[0]); assert.equal(editors()[0].selectionStart, "Parent".length);
  await keyNow(editors()[0], "z", { ctrlKey: true }); await settle();
  assert.equal(editors().length, 2); assert.ok(blockOf(editors()[1]).classList.contains("wp-bullet"), "Undo restores the bullet type");
  assert.ok(parseInt((blockOf(editors()[1]) as HTMLElement).style.marginLeft) > 0, "Undo restores the indent (parent)");

  await caretTo(editors()[1], 0); await keyNow(editors()[1], "Backspace"); await settle();
  assert.equal(editors().length, 1);
  // Focus race: the caret is in the new block as soon as Enter's render commits, before any frame (no stray first character).
  await caretTo(editors()[0], "Parent".length); await keyNow(editors()[0], "Enter");
  const created = editors()[1];
  assert.equal(document.activeElement, created, "focus moved synchronously with the Enter commit");
  await type(created, "## Heading"); await settle();
  assert.ok(blockOf(editors()[1]).classList.contains("wp-h2"), "## transforms to H2 right after Enter");
  assert.equal(editors()[0].textContent, "Parent", "previous block untouched (no '#' leaked)");

  // Owner case: delete a block, then Markdown still transforms (the same path, repeated).
  await caretTo(editors()[1], 0); await keyNow(editors()[1], "Backspace"); await settle(); // H2 → TEXT (content kept)
  assert.ok(blockOf(editors()[1]).classList.contains("wp-text"));
  await type(editors()[1], ""); await settle();
  await caretTo(editors()[1], 0); await keyNow(editors()[1], "Backspace"); await settle();   // empty leaf deleted
  assert.equal(editors().length, 1);
  await caretTo(editors()[0], "Parent".length); await keyNow(editors()[0], "Enter");
  await type(editors()[1], "### After delete"); await settle();
  assert.ok(blockOf(editors()[1]).classList.contains("wp-h3"), "### after a delete transforms");

  // IME: a composition whose block disappeared must not freeze transforms; composing input itself never transforms.
  const composingEditor = editors()[1];
  await act(async () => { composingEditor.dispatchEvent(new win.CompositionEvent("compositionstart", { bubbles: true })); });
  await type(composingEditor, "> 가", true); await settle();
  assert.ok(!blockOf(editors()[1]).classList.contains("wp-callout"), "no transform while composing");
  await caretTo(editors()[0], "Parent".length); await keyNow(editors()[0], "Enter");
  await type(editors()[1], "- item"); await settle();
  assert.ok(blockOf(editors()[1]).classList.contains("wp-bullet"), "stale composition flag healed by a real input");

  // Numbered heading: "1. " then "## " → one H2 block with its number; the next numbered H2 is 2.
  await caretTo(editors()[1], "item".length); await keyNow(editors()[1], "Enter"); await keyNow(editors()[2], "Enter"); await settle();
  const numberedEditor = editors()[2];
  assert.ok(blockOf(numberedEditor).classList.contains("wp-text"), "empty bullet + Enter returns to Text");
  await type(numberedEditor, "1. "); await settle();
  assert.ok(blockOf(editors()[2]).classList.contains("wp-numbered"));
  await type(editors()[2], "## Scope"); await settle();
  const first = blockOf(editors()[2]);
  assert.ok(first.classList.contains("wp-h2"), "heading typography"); assert.equal(first.querySelector(".wp-heading-number")?.textContent, "1.");
  assert.equal(editors()[2].textContent, "Scope", "markers removed");
  await caretTo(editors()[2], "Scope".length); await keyNow(editors()[2], "Enter");
  await type(editors()[3], "Body text"); await settle();
  await caretTo(editors()[3], "Body text".length); await keyNow(editors()[3], "Enter");
  await type(editors()[4], "1. "); await settle(); await type(editors()[4], "## Plan"); await settle();
  assert.equal(blockOf(editors()[4]).querySelector(".wp-heading-number")?.textContent, "2.", "body text does not break the numbered run");
  // First Backspace at the start removes only the number; Undo brings it back.
  await caretTo(editors()[4], 0); await keyNow(editors()[4], "Backspace"); await settle();
  assert.ok(blockOf(editors()[4]).classList.contains("wp-h2")); assert.equal(blockOf(editors()[4]).querySelector(".wp-heading-number"), null);
  await keyNow(editors()[4], "z", { ctrlKey: true }); await settle();
  assert.equal(blockOf(editors()[4]).querySelector(".wp-heading-number")?.textContent, "2.");
  await settle(); await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
  const saved = days["2026-09-14"].blocks.filter(block => block.type === "H2");
  assert.deepEqual(saved.map(block => [block.content, block.metadata.numbered]), [["Scope", true], ["Plan", true]], "numbered headings persist as heading blocks + metadata");

  // Chromium ArrowDown changes the selection inside one outer editing host without dispatching focus on the next block.
  // Simulate that native selection movement so the toolbar must follow the caret rather than the last clicked block.
  const host = document.querySelector<HTMLElement>('.wp-editor')!, toolbar = document.querySelector<HTMLSelectElement>('select[aria-label="Block type"]')!;
  host.tabIndex = 0; // jsdom does not implement contenteditable focusability.
  await caretTo(editors()[0], 0);
  await act(async () => { host.focus(); editors()[3].setSelectionRange(3, 3); document.dispatchEvent(new win.Event('selectionchange')); });
  assert.equal(document.activeElement, host, 'the native editor host keeps focus during arrow movement');
  assert.equal(toolbar.value, 'TEXT', 'toolbar follows the paragraph reached by the caret');
  await act(async () => { toolbar.value = 'H1'; toolbar.dispatchEvent(new win.Event('change', { bubbles: true })); });
  assert.ok(blockOf(editors()[3]).classList.contains('wp-h1'), 'toolbar changes the current caret block');
  assert.ok(blockOf(editors()[0]).classList.contains('wp-text'), 'previously clicked block remains unchanged');

  // Stale selections must not override intentional toolbar or handle focus; non-collapsed text ranges are ignored.
  await act(async () => { toolbar.focus(); editors()[0].setSelectionRange(0, 0); document.dispatchEvent(new win.Event('selectionchange')); });
  assert.equal(toolbar.value, 'H1', 'selection left behind while the toolbar has focus cannot change its active block');
  const grip = blockOf(editors()[0]).querySelector<HTMLButtonElement>('.wp-grip')!;
  await act(async () => { grip.focus(); grip.click(); editors()[3].setSelectionRange(1, 1); document.dispatchEvent(new win.Event('selectionchange')); });
  assert.equal(document.querySelector('.wp-active')?.id, blockOf(editors()[0]).id, 'handle selection wins over stale caret');
  assert.equal(document.querySelectorAll('.wp-selected').length, 1);
  await act(async () => { host.focus(); editors()[3].setSelectionRange(0, 3); document.dispatchEvent(new win.Event('selectionchange')); });
  assert.equal(document.querySelector('.wp-active')?.id, blockOf(editors()[0]).id, 'range selection does not change the active block');
  await act(async () => { editors()[3].setSelectionRange(2, 2); document.dispatchEvent(new win.Event('selectionchange')); });
  assert.equal(document.querySelector('.wp-active')?.id, blockOf(editors()[3]).id, 'collapsed native caret synchronizes the active block');
  assert.equal(document.querySelectorAll('.wp-selected').length, 1, 'caret synchronization preserves structural selection');
  await act(async () => root.unmount());
});

test('Completed linked To-do detaches with its visible canonical title and leaves the task unchanged', async () => {
  const require = createRequire(import.meta.url); require.extensions['.css'] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: 'https://orbit.local/workflow/today?date=2026-09-14', pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { React, window: win, document: win.document, DOMParser: win.DOMParser, localStorage: win.localStorage, sessionStorage: win.sessionStorage, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Element: win.Element, Node: win.Node, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
  globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win); globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  win.HTMLElement.prototype.scrollIntoView = () => {};
  const { createRoot } = await import('react-dom/client');
  const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  const { PathnameContext, SearchParamsContext } = await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
  const { workflowApi } = await import('../../lib/api/workflow');
  const { newBlock } = await import('../../lib/workflow/workpad');
  const { default: Today } = await import('./Today');
  const { WorkflowProvider } = await import('./WorkflowContext');
  const task: WorkTask = { id: crypto.randomUUID(), title: 'Current canonical title', status: 'DONE', projectId: null, phaseId: null, priority: 'NORMAL', startDate: null, dueDate: null, memo: null, order: 0 };
  const linked = newBlock('CHECKLIST', 'Old recorded title'); linked.workTaskId = task.id; linked.checked = true; linked.metadata = { textStyle: 'H2', numbered: true, taskRef: 'primary' };
  let day: WorkpadDay = { date: '2026-09-14', revision: 0, blocks: [linked] }, taskUpdates = 0;
  const originalTask = structuredClone(task);
  workflowApi.get = async () => ({ projects: [], phases: [], tasks: [structuredClone(task)] });
  workflowApi.getDay = async () => structuredClone(day);
  workflowApi.saveDay = async (_date, next) => { assert.deepEqual(next.taskTitles ?? {}, {}, 'detach never submits a title change for an unlinked task'); day = { date: day.date, revision: next.revision + 1, blocks: structuredClone(next.blocks) }; return structuredClone(day); };
  workflowApi.patchTask = async () => { taskUpdates++; throw new Error('Detaching must not change the canonical task'); };
  const root = createRoot(document.getElementById('root')!);
  const router = { push: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  const render = async (key: string) => act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/workflow/today"><SearchParamsContext.Provider value={new URLSearchParams('date=2026-09-14')}><WorkflowProvider key={key}><Today/></WorkflowProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  try {
    await render('canonical');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    const input = document.querySelector<TextElement>('.wp-text-input')!;
    assert.equal(input.textContent, task.title, 'linked Workpad renders the newer canonical task title');
    await act(async () => { input.focus(); input.setSelectionRange(task.title.length, task.title.length); input.closest('.wp-editor')!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('.wp-text-input')!.textContent, task.title, 'third transition freezes the visible title instead of old recorded content');
    assert.ok(document.querySelector('.wp-h2'), 'detaching preserves the heading style'); assert.equal(document.querySelector('.wp-checkbox'), null);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    assert.equal(day.blocks[0].content, task.title); assert.equal(day.blocks[0].workTaskId, null); assert.equal(day.blocks[0].type, 'H2');
    assert.deepEqual(task, originalTask); assert.equal(taskUpdates, 0);

    // An unsaved inline draft is also visible text. Detaching its sole reference must not submit invalid taskTitles.
    day = { date: day.date, revision: 0, blocks: [structuredClone(linked)] };
    await render('draft'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    const draft = document.querySelector<TextElement>('.wp-text-input')!;
    await act(async () => { draft.focus(); draft.textContent = 'Unsaved visible draft'; draft.setSelectionRange(21, 21); draft.closest('.wp-editor')!.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText' })); });
    await act(async () => { draft.closest('.wp-editor')!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('.wp-text-input')!.textContent, 'Unsaved visible draft');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    assert.equal(day.blocks[0].content, 'Unsaved visible draft'); assert.equal(day.blocks[0].workTaskId, null);
    assert.deepEqual(task, originalTask); assert.equal(taskUpdates, 0);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});
