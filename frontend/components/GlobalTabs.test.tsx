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
  assert.equal(JSON.parse(localStorage.getItem(TAB_STORAGE_KEY)!).tabs.at(-1).route, "/life/categories");
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
  assert.equal(JSON.parse(localStorage.getItem(TAB_STORAGE_KEY)!).tabs[0].route, "/notes");
  fail = false;
  await act(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent === "다시 시도")!.click());
  assert.deepEqual(destinations, ["/calendar"]);
  await act(() => root.unmount()); dom.window.close();
});
