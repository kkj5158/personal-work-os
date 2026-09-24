import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import type { WorkpadDay, WorkTask } from "../../lib/api/workflow";

async function main() {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/workflow/today?date=2026-09-14", pretendToBeVisual: true });
  const win = dom.window;
  Object.assign(globalThis, { React, window: win, document: win.document, localStorage: win.localStorage, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Element: win.Element, Node: win.Node, sessionStorage: win.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  globalThis.requestAnimationFrame = callback => { callback(0); return 0; };
  globalThis.cancelAnimationFrame=()=>{};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLElement.prototype.setPointerCapture = () => {};
  const { createRoot } = await import("react-dom/client");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { newBlock, cloneBlocks, normalize, textBlocks } = await import("../../lib/workflow/workpad");
  const { default: Today } = await import("./Today");
  const { default: Stream } = await import("./WorklogStream");
  let streamMode=false;
  const { WorkflowProvider } = await import("./WorkflowContext");
  const { GlobalTabsProvider, useGlobalTabs } = await import("../../components/GlobalTabs");
  const first = newBlock("TEXT", "Plan"), second = newBlock("BULLET", "Evidence"); second.order = 1;
  const days: Record<string, WorkpadDay> = { "2026-09-14": { date: "2026-09-14", revision: 0, blocks: [first, second] } };
  let workTasks: WorkTask[] = [], saves = 0, promotions = 0, uploads = 0, saveFails = false, titleSaveFails = false;
  let uploadGate: Promise<void> | null = null;
  let carryRequest: { from: string; ids: string[]; to: string } | null = null;
  const routes: string[] = [];
  workflowApi.get = async () => ({ projects: [], phases: [], tasks: structuredClone(workTasks) });
  workflowApi.getDay = async date => structuredClone(days[date] ?? { date, revision: 0, blocks: [] });
  workflowApi.saveDay = async (date, day) => {
    if (saveFails) throw new Error("Offline: keep draft");
    assert.equal(day.revision, days[date]?.revision ?? 0, "autosave uses latest server revision");
    for(const [id,title] of Object.entries(day.taskTitles??{})){workTasks=workTasks.map(t=>t.id===id?{...t,title}:t);}
    saves++; days[date] = { date, revision: day.revision + 1, blocks: structuredClone(day.blocks) }; return structuredClone(days[date]);
  };
  workflowApi.promote = async (date, blockId) => {
    promotions++;
    const block = days[date].blocks.find(b => b.id === blockId)!;
    const task: WorkTask = { id: crypto.randomUUID(), title: block.content, status: "TODO", projectId: null, phaseId: null, priority: "NORMAL", startDate: null, dueDate: null, memo: null, order: 0 };
    workTasks.push(task); block.workTaskId = task.id; block.type = "CHECKLIST"; days[date].revision++;
    return task;
  };
  workflowApi.saveTask = async task => { if (titleSaveFails) throw new Error("Task title save failed"); const saved = task as WorkTask; workTasks = workTasks.map(t => t.id === task.id ? saved : t); return saved; };
  workflowApi.uploadImage = async () => { if (uploadGate) await uploadGate; return { id: `image-${++uploads}`, width: 400, height: 200 }; };
  workflowApi.getImage = async () => new Blob(["image"], { type: "image/png" });
  workflowApi.carry = async (from, ids, to) => {
    carryRequest = { from, ids, to };
    const source = days[from].blocks.filter(b => ids.includes(b.id));
    const blocks = cloneBlocks(source).map((b, i) => ({ ...b, sourceDate: from, sourceBlockId: source[i].id }));
    days[to] = { date: to, revision: 1, blocks }; return structuredClone(days[to]);
  };
  function Leave() { const shell = useGlobalTabs(); return <button onClick={() => shell?.navigate("/worklog")}>Leave workpad</button>; }
  const router = { push: (route: string) => routes.push(route) } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  let params = new URLSearchParams("date=2026-09-14");
  const render = async () => act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/workflow/today"><SearchParamsContext.Provider value={params}><GlobalTabsProvider><WorkflowProvider><Leave/>{streamMode?<Stream/>:<Today/>}</WorkflowProvider></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const button = (label: string) => { const b = buttons().find(b => b.getAttribute("aria-label") === label || b.textContent?.includes(label)); assert.ok(b, `button ${label} exists`); return b; };
  const click = async (label: string) => { await act(async () => button(label).click()); await settle(); };
  const textareas = () => Array.from(document.querySelectorAll<import("./EditableText").TextElement>(".wp-text-input"));
  const input=async(element:HTMLElement,value:string)=>{await act(async()=>{element.textContent=value;element.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));});};
  const key = async (element: HTMLElement, key: string, options: KeyboardEventInit = {}) => {
    const event = new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    await act(async () => element.dispatchEvent(event)); await settle(); return event;
  };
  let checked = 0;
  const pass = (label: string) => { checked++; console.log(`PASS UI ${label}`); };
  const {publishEntityChange}=await import('../../lib/windowSync');
  const notify=async()=>{await act(async()=>{publishEntityChange({entityType:'workpad',entityId:params.get('date')!,revision:days[params.get('date')!].revision});await new Promise(r=>setTimeout(r,30));});};
  await render();await settle();const date=params.get('date')!;
  days[date].blocks[1].content='Remote clean';days[date].revision++;await notify();assert.equal(textareas()[1].textContent,'Remote clean');
  await input(textareas()[0],'Local first');days[date].blocks[1].content='Remote second';days[date].revision++;await notify();assert.equal(textareas()[0].textContent,'Local first');assert.equal(textareas()[1].textContent,'Remote second');assert.equal(days[date].blocks[0].content,'Local first');
  await key(textareas()[0],'z',{ctrlKey:true});assert.equal(textareas()[1].textContent,'Remote second','old Undo cannot revert merged remote edits');
  await input(textareas()[0],'Local conflict');days[date].blocks[0].content='Remote conflict';days[date].blocks[1].content='Remote independent';days[date].revision++;await notify();assert.match(document.body.textContent!,/also changed in another window/);assert.equal(textareas()[0].textContent,'Local conflict');
  await click('Compare changes');assert.match(document.body.textContent!,/Remote conflict/);await click('Keep my changes');assert.equal(days[date].blocks[0].content,'Local conflict');assert.equal(days[date].blocks[1].content,'Remote independent');
  await act(async()=>{textareas()[0].focus();textareas()[0].setSelectionRange(0,0);});
  await key(textareas()[0],'Enter',{ctrlKey:true,shiftKey:true});
  const priorTitle=workTasks[0].title;await input(textareas()[0],'Atomic linked title');assert.equal(workTasks[0].title,priorTitle,'task is not independently mutated ahead of day save');
  await click('Leave workpad');assert.equal(workTasks[0].title,'Atomic linked title');assert.equal(days[date].blocks[0].content,'Atomic linked title');
  await key(textareas()[0],'z',{ctrlKey:true});await click('Leave workpad');assert.equal(workTasks[0].title,priorTitle,'Undo uses atomic day save too');
  await act(async()=>root.unmount());dom.window.close();console.log('PASS Workpad clean refresh, disjoint autosave merge, undo isolation, conflict comparison, draft preservation and safe resolution');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
