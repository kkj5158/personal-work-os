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
test("noncancelable traverse pop fallback restores without canceling its own inverse navigate event", () => {
  const dom = new JSDOM('<textarea id="draft">unsaved</textarea>', { url: "http://localhost/money/coupang-work-calendar" });
  Object.assign(globalThis, { window: dom.window });
  const navigation = new dom.window.EventTarget(); let index = 1, prompts = 0, inverseTraversals = 0, routerPops = 0;
  Object.defineProperty(navigation, "currentEntry", { get: () => ({ index }) }); Object.defineProperty(dom.window, "navigation", { value: navigation });
  const navigate = (cancelable: boolean) => { const event = new dom.window.Event("navigate", { cancelable }); Object.defineProperties(event, { navigationType: { value: "traverse" }, destination: { value: { sameDocument: true } } }); return navigation.dispatchEvent(event); };
  const dispose = guardCalendarHistory(() => true, () => { prompts++; return false; });
  const router = () => routerPops++; dom.window.addEventListener("popstate", router);
  dom.window.history.go = delta => {
    inverseTraversals++;
    assert.equal(delta, 1); assert.equal(navigate(true), true, "inverse navigate must bypass dirty confirmation while restoring");
    index = 1; dom.window.history.replaceState({ route: "work" }, "", "/money/coupang-work-calendar");
    dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: { route: "work" } }));
  };
  try {
    assert.equal(navigate(false), true); assert.equal(prompts, 0);
    index = 0; dom.window.history.replaceState({ route: "income" }, "", "/money/income-calendar");
    dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: { route: "income" } }));
    assert.equal(prompts, 1); assert.equal(inverseTraversals, 1); assert.equal(routerPops, 0); assert.equal(dom.window.location.pathname, "/money/coupang-work-calendar"); assert.ok(dom.window.document.getElementById("draft"));
    assert.equal(navigate(true), false, "a subsequent user traverse is guarded again after restoration completes"); assert.equal(prompts, 2);
  } finally { dispose(); dom.window.removeEventListener("popstate", router); dom.window.close(); }
});
test("early navigation guard ignores non-traverse, cross-document, noncancelable and clean events", () => {
  const dom = new JSDOM("", { url: "http://localhost/money/coupang-work-calendar" }); Object.assign(globalThis, { window: dom.window });
  const navigation = new dom.window.EventTarget(); Object.defineProperty(dom.window, "navigation", { value: navigation });
  let prompts = 0, dirty = true;
  const dispose = guardCalendarHistory(() => dirty, () => { prompts++; return false; });
  try {
    for (const [navigationType, sameDocument, cancelable] of [["push", true, true], ["replace", true, true], ["reload", true, true], ["traverse", false, true], ["traverse", true, false]] as const) {
      const event = new dom.window.Event("navigate", { cancelable }); Object.defineProperties(event, { navigationType: { value: navigationType }, destination: { value: { sameDocument } } }); assert.equal(navigation.dispatchEvent(event), true);
    }
    dirty = false; const event = new dom.window.Event("navigate", { cancelable: true }); Object.defineProperties(event, { navigationType: { value: "traverse" }, destination: { value: { sameDocument: true } } }); assert.equal(navigation.dispatchEvent(event), true); assert.equal(prompts, 0);
  } finally { dispose(); dom.window.close(); }
});
