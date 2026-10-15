import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { guardCalendarHistory } from "./calendarHistory";
test("browser Back rejection keeps original route and draft mounted; acceptance reaches router", () => {
  const dom = new JSDOM("", { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { window: dom.window });
  dom.window.history.replaceState({ route: "work" }, "");
  let confirmed = false, prompts = 0, routerEvents = 0;
  const dispose = guardCalendarHistory(() => true, () => { prompts++; return confirmed; });
  const router = () => routerEvents++;
  dom.window.addEventListener("popstate", router);
  dom.window.history.replaceState({ route: "income" }, "", "/money/income-calendar");
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: { route: "income" } }));
  assert.equal(dom.window.location.pathname, "/money/coupang-work-calendar"); assert.equal(routerEvents, 0); assert.equal(prompts, 1);
  confirmed = true;
  dom.window.history.replaceState({ route: "income" }, "", "/money/income-calendar");
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: { route: "income" } }));
  assert.equal(dom.window.location.pathname, "/money/income-calendar"); assert.equal(routerEvents, 1);
  dispose(); dom.window.removeEventListener("popstate", router);
});
test("native indexed Back and Forward cancellation restores the original entry without losing Forward history", async () => {
  const routes = ["/money/spending-calendar", "/money/coupang-work-calendar", "/money/income-calendar"];
  const dom = new JSDOM("", { url: "http://localhost" + routes[0] });
  Object.assign(globalThis, { window: dom.window });
  dom.window.history.replaceState({ route: routes[0] }, "");
  dom.window.history.pushState({ route: routes[1] }, "", routes[1]);
  dom.window.history.pushState({ route: routes[2] }, "", routes[2]);
  Object.defineProperty(dom.window, "navigation", { value: { get currentEntry() { return { index: routes.indexOf(dom.window.location.pathname) }; } } });
  const waitFor = async (condition: () => boolean) => { const deadline = Date.now() + 3000; while (!condition()) { assert.ok(Date.now() < deadline, "native history traversal completed"); await new Promise(resolve => setTimeout(resolve, 5)); } };
  dom.window.history.back(); await waitFor(() => dom.window.location.pathname === routes[1]);
  assert.equal(dom.window.location.pathname, routes[1]);
  let confirmed = false, prompts = 0, routerEvents = 0, observedPops = 0;
  const observeNativePop = () => observedPops++;
  dom.window.addEventListener("popstate", observeNativePop, true);
  const dispose = guardCalendarHistory(() => true, () => { prompts++; return confirmed; });
  const router = () => routerEvents++;
  dom.window.addEventListener("popstate", router);
  try {
    dom.window.history.back(); await waitFor(() => prompts === 1 && observedPops === 2 && dom.window.location.pathname === routes[1]);
    assert.equal(dom.window.location.pathname, routes[1]); assert.equal(prompts, 1); assert.equal(routerEvents, 0); assert.equal(dom.window.history.length, 3);
    dom.window.history.forward(); await waitFor(() => prompts === 2 && observedPops === 4 && dom.window.location.pathname === routes[1]);
    assert.equal(dom.window.location.pathname, routes[1]); assert.equal(prompts, 2); assert.equal(routerEvents, 0); assert.equal(dom.window.history.length, 3);
    confirmed = true;
    dom.window.history.forward(); await waitFor(() => routerEvents === 1 && dom.window.location.pathname === routes[2]);
    assert.equal(dom.window.location.pathname, routes[2], "the original Forward destination survives both canceled traversals"); assert.equal(routerEvents, 1);
    dom.window.history.back(); await waitFor(() => routerEvents === 2 && dom.window.location.pathname === routes[1]);
    assert.equal(dom.window.location.pathname, routes[1]); assert.equal(routerEvents, 2);
  } finally { dispose(); dom.window.removeEventListener("popstate", router); dom.window.removeEventListener("popstate", observeNativePop, true); dom.window.close(); }
});
test("public navigate traversal cancels before an earlier router interceptor commits; accepted Forward asks once", async () => {
  const routes = ["/money/spending-calendar", "/money/coupang-work-calendar", "/money/income-calendar"];
  const dom = new JSDOM('<textarea id="draft">unsaved work draft</textarea>', { url: "http://localhost" + routes[0] });
  Object.assign(globalThis, { window: dom.window });
  dom.window.history.pushState({ route: routes[1] }, "", routes[1]); dom.window.history.pushState({ route: routes[2] }, "", routes[2]);
  const waitFor = async (condition: () => boolean) => { const deadline = Date.now() + 3000; while (!condition()) { assert.ok(Date.now() < deadline, "native traversal completed"); await new Promise(resolve => setTimeout(resolve, 5)); } };
  dom.window.history.back(); await waitFor(() => dom.window.location.pathname === routes[1]);
  const navigation = new dom.window.EventTarget();
  Object.defineProperty(navigation, "currentEntry", { get: () => ({ index: routes.indexOf(dom.window.location.pathname) }) });
  Object.defineProperty(dom.window, "navigation", { value: navigation });
  let routerCommits = 0, prompts = 0, dirty = true, confirmed = false, inverseTraversals = 0;
  const nativeGo = dom.window.history.go.bind(dom.window.history);
  dom.window.history.go = delta => { inverseTraversals++; nativeGo(delta); };
  // An earlier React-style interception schedules its handler, but must honor
  // cancellation by a later listener before the intercepted navigation runs.
  navigation.addEventListener("navigate", event => { queueMicrotask(() => { if (!event.defaultPrevented) { routerCommits++; dom.window.document.getElementById("draft")?.remove(); } }); });
  const dispose = guardCalendarHistory(() => dirty, () => { prompts++; if (confirmed) dirty = false; return confirmed; });
  const traverse = () => { const event = new dom.window.Event("navigate", { cancelable: true }); Object.defineProperties(event, { navigationType: { value: "traverse" }, destination: { value: { sameDocument: true } } }); return navigation.dispatchEvent(event); };
  try {
    assert.equal(traverse(), false, "Back is canceled at the Navigation API boundary"); await Promise.resolve();
    assert.equal(traverse(), false, "Forward is canceled at the same early boundary"); await Promise.resolve();
    assert.equal(prompts, 2); assert.equal(routerCommits, 0); assert.equal(inverseTraversals, 0); assert.equal(dom.window.history.length, 3); assert.equal(dom.window.location.pathname, routes[1]); assert.ok(dom.window.document.getElementById("draft"));
    confirmed = true;
    assert.equal(traverse(), true); await Promise.resolve();
    dom.window.history.forward(); await waitFor(() => dom.window.location.pathname === routes[2]);
    assert.equal(prompts, 3, "accepted traverse clears dirty before popstate and prompts only once"); assert.equal(routerCommits, 1); assert.equal(inverseTraversals, 0);
  } finally { dispose(); dom.window.close(); }
});
