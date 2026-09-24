import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { GlobalTabsProvider, useGlobalTabs, useShellNavigationGuard } from "./GlobalTabs";
import { EMPTY_TABS, TAB_STORAGE_KEY, visitTab } from "../lib/globalTabs";

test("shell switch and active close wait for the domain leave continuation, inactive close is safe", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  let proceed: (() => void) | null = null;
  const destinations: string[] = [];
  const saved = ["/worklog", "/notes?workspace=one&note=design", "/calendar"].reduce((state, route) => visitTab(state, route, true), EMPTY_TABS);
  localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(saved));
  function Editor() {
    useShellNavigationGuard(next => { proceed = next; });
    const shell = useGlobalTabs();
    return <button onClick={() => shell?.navigate("/life/categories", { newTab: true })}>Open LIFE</button>;
  }
  const router = { push: (href: string) => destinations.push(href) } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/calendar"><SearchParamsContext.Provider value={new URLSearchParams()}><GlobalTabsProvider><Editor/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  assert.equal(document.querySelectorAll('[role="tab"]').length, 3);
  assert.equal(document.querySelector('[aria-selected="true"]')?.textContent, "Calendar");
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="근무 기록 탭 닫기"]')!.click());
  assert.equal(document.querySelectorAll('[role="tab"]').length, 2);
  assert.equal(proceed, null);
  await act(() => document.querySelector<HTMLButtonElement>('[aria-label="Calendar 탭 닫기"]')!.click());
  assert.deepEqual(destinations, []); assert.equal(document.querySelectorAll('[role="tab"]').length, 2);
  // Continue editing cancels by never invoking the domain continuation.
  proceed = null;
  await act(() => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === "Open LIFE")!.click());
  assert.deepEqual(destinations, []);
  assert.equal(document.querySelectorAll('[role="tab"]').length, 2);
  await act(() => (proceed as unknown as () => void)());
  assert.deepEqual(destinations, ["/life/categories"]);
  assert.equal(document.querySelectorAll('[role="tab"]').length, 3);
  assert.equal(document.querySelector('[aria-selected="true"]')?.textContent, "LIFE CODE · 카테고리");
  assert.equal(JSON.parse(window.sessionStorage.getItem(TAB_STORAGE_KEY)!).tabs.at(-1).route, "/life/categories");
  await act(() => root.unmount()); dom.window.close();
});

test("closing a nested surface restores the underlying Calendar navigation guard",async()=>{
  const dom=new JSDOM("<div id='root'></div>",{url:"https://orbit.local/calendar"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const calls:string[]=[];
  function Modal(){useShellNavigationGuard(()=>{calls.push("reflection");});return null;}
  function Page(){const [open,setOpen]=React.useState(false);useShellNavigationGuard(()=>{calls.push("actual");});const shell=useGlobalTabs();return <><button onClick={()=>setOpen(!open)}>Toggle surface</button><button onClick={()=>shell?.navigate("/worklog")}>Navigate</button>{open && <Modal/>}</>;}
  const root=createRoot(document.getElementById("root")!);
  const router={push:()=>calls.push("navigated")} as unknown as React.ContextType<typeof AppRouterContext>;
  await act(()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/calendar"><SearchParamsContext.Provider value={new URLSearchParams()}><GlobalTabsProvider><Page/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const click=async(name:string)=>act(()=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent===name)!.click());
  await click("Navigate");await click("Toggle surface");await click("Navigate");await click("Toggle surface");await click("Navigate");
  assert.deepEqual(calls,["actual","reflection","actual"]);await act(()=>root.unmount());dom.window.close();
});

test("a failed leave save retains draft/tab/route and retries through the guard", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/notes" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const destinations: string[] = []; let fail = true;
  function Editor() {
    useShellNavigationGuard(async proceed => { if (fail) throw new Error("저장 실패"); proceed(); });
    const shell = useGlobalTabs();
    return <><textarea defaultValue="unsaved draft"/><button onClick={() => shell?.navigate("/calendar")}>Leave</button></>;
  }
  const router = { push: (href: string) => destinations.push(href) } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/notes"><SearchParamsContext.Provider value={new URLSearchParams()}><GlobalTabsProvider><Editor/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  await act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === "Leave")!.click());
  assert.deepEqual(destinations, []); assert.equal(document.querySelector('textarea')!.value, "unsaved draft");
  assert.match(document.querySelector('[role=alert]')!.textContent!, /저장 실패/);
  assert.equal(JSON.parse(window.sessionStorage.getItem(TAB_STORAGE_KEY)!).tabs[0].route, "/notes");
  fail = false;
  await act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === "다시 시도")!.click());
  assert.deepEqual(destinations, ["/calendar"]);
  await act(() => root.unmount()); dom.window.close();
});

test("tab menu commands preserve pins, duplicate identity and guarded active navigation", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://orbit.local/calendar" });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperties(window, { innerWidth: { value: 320 }, innerHeight: { value: 180 } });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, bottom: 160, right: 200, width: 200, height: 160, toJSON: () => ({}) }; };
  let continuation: (() => void) | null = null;
  const destinations: string[] = [];
  const saved = ["/worklog", "/notes", "/authoring", "/calendar"].reduce((state, route) => visitTab(state, route, true), EMPTY_TABS);
  localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(saved));
  function Editor() { useShellNavigationGuard(proceed => { continuation = proceed; }); return <p>Page body</p>; }
  const router = { push: (href: string) => destinations.push(href), prefetch: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  await act(() => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/calendar"><SearchParamsContext.Provider value={new URLSearchParams()}><GlobalTabsProvider><Editor/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const tabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const stored = () => JSON.parse(window.sessionStorage.getItem(TAB_STORAGE_KEY)!);
  const open = async (index: number) => {
    const event = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 319, clientY: 179 });
    await act(() => { tabs()[index].dispatchEvent(event); });
    assert.equal(event.defaultPrevented, true);
  };
  const command = async (name: string) => act(() => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === name)!.click());
  const proceed = async () => { assert.ok(continuation); await act(() => continuation!()); continuation = null; };
  await open(0);
  assert.equal(stored().activeTabId, saved.activeTabId); // Inactive right-click is not navigation.
  assert.equal(document.querySelectorAll('[role="menuitem"]').length, 6);
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  assert.equal(menu.style.left, "112px"); assert.equal(menu.style.top, "12px");
  await act(() => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(document.activeElement, tabs()[0]);
  await open(0);
  await act(() => document.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true })));
  assert.equal(document.querySelector('[role="menu"]'), null);
  const bodyMenu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  document.querySelector("p")!.dispatchEvent(bodyMenu);
  assert.equal(bodyMenu.defaultPrevented, false);
  await open(0); await command("탭 고정");
  assert.equal(stored().tabs[0].pinned, true); assert.equal(document.querySelector('[role="menu"]'), null);
  await open(3); await command("탭 복제");
  assert.equal(tabs().length, 4); assert.deepEqual(destinations, []);
  await proceed();
  assert.equal(tabs().length, 5); assert.equal(stored().activeTabId, stored().tabs[4].tabId);
  assert.notEqual(stored().tabs[3].tabId, stored().tabs[4].tabId);
  assert.equal(stored().tabs[3].route, stored().tabs[4].route);
  await act(() => tabs()[3].click()); await proceed();
  assert.equal(stored().activeTabId, saved.activeTabId); // Select the original copy by ID.
  await open(3); await command("다른 탭 닫기");
  assert.equal(continuation, null); assert.equal(tabs().length, 2);
  assert.equal(stored().tabs[0].pinned, true);
  await open(0); await command("오른쪽 탭 닫기");
  assert.equal(tabs().length, 2); await proceed(); assert.equal(tabs().length, 1);
  assert.equal(stored().tabs[0].tabId, saved.tabs[0].tabId);
  await open(0); await command("탭 고정 해제"); assert.equal(stored().tabs[0].pinned, false);
  await open(0); await command("탭 닫기");
  assert.equal(stored().tabs[0].tabId, saved.tabs[0].tabId);
  await proceed();
  assert.equal(tabs().length, 1); assert.notEqual(stored().tabs[0].tabId, saved.tabs[0].tabId);
  assert.equal(stored().tabs[0].route, "/worklog");
  await act(() => root.unmount()); dom.window.close();
});

test("new window action preserves the route and leaves the current editor and tab layout intact", async () => {
  const dom = new JSDOM("<div id='root'></div>", {url:"https://orbit.local/calendar?date=2026-09-24&view=week&mode=planning"});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
  const opened: unknown[][]=[];
  dom.window.open=((...args:unknown[])=>{opened.push(args);return null;}) as typeof dom.window.open;
  const router={push:()=>assert.fail("Opening a new window must not navigate the source")} as unknown as React.ContextType<typeof AppRouterContext>;
  const root=createRoot(document.getElementById("root")!);
  await act(()=>root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value="/calendar"><SearchParamsContext.Provider value={new URLSearchParams(dom.window.location.search)}><GlobalTabsProvider><textarea defaultValue="local draft"/></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  const before=window.sessionStorage.getItem(TAB_STORAGE_KEY);
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="새 창에서 열기"]')!.click());
  assert.deepEqual(opened,[["/calendar?date=2026-09-24&mode=planning&view=week","_blank","popup=yes,noopener,noreferrer,width=1280,height=900"]]);
  assert.equal(window.sessionStorage.getItem(TAB_STORAGE_KEY),before);
  assert.equal(localStorage.getItem(TAB_STORAGE_KEY),null,"tab changes stay window-local");
  assert.equal(document.querySelector("textarea")!.value,"local draft");
  await act(()=>root.unmount());dom.window.close();
});
