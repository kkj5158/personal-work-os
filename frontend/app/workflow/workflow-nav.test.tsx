import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { JSDOM } from "jsdom";

/**
 * Regression: every visible WORK FLOW sidebar item must actually navigate through the shared Global Tabs shell.
 * (This Week / Waiting clicks were silently dropped because GlobalTabs did not recognise their routes.)
 */
test("WORK FLOW sidebar: every menu item click reaches router.push with its route (incl. This Week, Waiting)", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => {};
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost/workflow/projects", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const { createRoot } = await import("react-dom/client");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { workflowApi } = await import("../../lib/api/workflow");
  const { GlobalTabsProvider } = await import("../../components/GlobalTabs");
  const { default: WorkflowShell, WORKFLOW_NAV_CORE, WORKFLOW_NAV_SUPPORT, WORKFLOW_NAV_SHARED, WORKFLOW_NAV_ARCHIVED } = await import("./WorkflowShell");
  workflowApi.get = async () => ({ projects: [], phases: [], tasks: [], planDays: [], groups: [] });
  workflowApi.week = async start => ({ weekStart: start, revision: 0, focusSlots: [], goals: [], projects: [], tasks: [], planDays: [] });
  const pushed: string[] = [];
  let pathname = "/workflow/projects";
  const router = { push: (route: string) => { pushed.push(route); pathname = route.split("?")[0]; }, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} } as unknown as React.ContextType<typeof AppRouterContext>;
  const root = createRoot(document.getElementById("root")!);
  const render = async () => act(async () => root.render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={pathname}><SearchParamsContext.Provider value={new URLSearchParams()}>
    <GlobalTabsProvider><WorkflowShell><p>content</p></WorkflowShell></GlobalTabsProvider></SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>));
  await render();
  const nav = () => document.querySelector(".app-sidebar nav")!;
  const archived = () => nav().querySelector<HTMLButtonElement>(".app-nav-group-toggle")!;
  const archivedBody = () => document.getElementById(archived().getAttribute("aria-controls")!)!;
  assert.deepEqual([...nav().querySelectorAll("h2")].map(e => e.textContent), ["WORK FLOW", "SUPPORT", "SHARED SPACE", "Archived"]);
  assert.equal(nav().querySelectorAll('[aria-label="Workpad"]').length, 1);
  assert.ok(!WORKFLOW_NAV_CORE.some(item => item.path === "today"));
  assert.equal(archived().getAttribute("aria-expanded"), "false");
  assert.equal(archivedBody().hidden, true);
  await act(async () => archived().click());
  assert.equal(archivedBody().hidden, false);
  await act(async () => archived().click());
  pathname = "/workflow/today"; // Existing deep link / refresh entry.
  await render();
  assert.equal(archived().getAttribute("aria-expanded"), "true");
  assert.equal(archivedBody().querySelector('[aria-label="Workpad"]')?.getAttribute("aria-current"), "page");
  await act(async () => archived().click());
  assert.equal(archivedBody().hidden, true, "active group can still be manually collapsed");
  pathname = "/workflow/projects";
  await render();
  assert.equal(nav().querySelector('[aria-label="Workpad"]')?.hasAttribute("aria-current"), false);
  pathname = "/workflow/today";
  await render();
  assert.equal(archivedBody().hidden, false, "returning via back/forward reveals Workpad again");
  const items = [...WORKFLOW_NAV_CORE, ...WORKFLOW_NAV_SUPPORT, ...WORKFLOW_NAV_SHARED, ...WORKFLOW_NAV_ARCHIVED];
  assert.ok(items.some(item => item.path === "week") && items.some(item => item.path === "waiting"));
  // Cross-navigation through visible menu items only, including repeated visits.
  const sequence = ["Projects", "This Week", "Waiting", "Timeline", "This Week", "Waiting", ...items.map(item => item.label)];
  for (const label of sequence) {
    if (label === "Workpad" && archivedBody().hidden) await act(async () => archived().click());
    const item = items.find(entry => entry.label === label)!;
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(candidate => candidate.textContent?.trim() === label);
    assert.ok(button, `${label} is a visible sidebar button`);
    const before = pushed.length;
    await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
    if (pathname !== `/workflow/${item.path}` || pushed.length > before) assert.equal(pushed.at(-1), `/workflow/${item.path}`, `${label} click navigates to /workflow/${item.path}`);
    await render();
    const active = [...document.querySelectorAll<HTMLButtonElement>("button")].find(candidate => candidate.textContent?.trim() === label)!;
    assert.equal(active.getAttribute("aria-current"), "page", `${label} is the active menu item after its click`);
  }
  await act(async () => root.unmount());
});
