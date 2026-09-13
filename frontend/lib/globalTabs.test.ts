import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTab, EMPTY_TABS, reorderTabs, restoreTabs, tabTarget, visitTab } from "./globalTabs";

test("cross-system targets preserve workspace and calendar context without content", () => {
  const routes = ["/worklog?date=2026-09-11", "/notes?workspace=one&note=design", "/life/categories", "/calendar?date=2026-09-11&view=week&mode=compare"];
  const state = routes.reduce((state, route) => visitTab(state, route, true), EMPTY_TABS);
  assert.deepEqual(state.tabs.map(tab => tab.system), ["WORK OS", "NOTE SYS", "LIFE CODE", "Calendar"]);
  assert.equal(state.tabs[3].route, "/calendar?date=2026-09-11&mode=compare&view=week");
  assert.equal(tabTarget("/notes?workspace=one&note=design&context=excerpt&content=secret&token=secret")?.route, "/notes?note=design&workspace=one");
  assert.equal(tabTarget("//evil.test/notes"), null);
  assert.equal(tabTarget("/\\evil.test/notes"), null);
  assert.equal(tabTarget("/login"), null);
});
test("normal navigation replaces active context while explicit new tabs dedupe logical notes", () => {
  let state = visitTab(EMPTY_TABS, "/worklog");
  const firstId = state.activeTabId;
  state = visitTab(state, "/worklog/checklist");
  assert.equal(state.tabs.length, 1); assert.equal(state.activeTabId, firstId);
  state = visitTab(state, "/notes?workspace=one&note=design", true, "설계");
  const noteId = state.activeTabId;
  state = visitTab(state, "/notes?module=RECENT_NOTES&workspace=one&note=design", true);
  assert.equal(state.tabs.length, 2); assert.equal(state.activeTabId, noteId); assert.equal(state.tabs[1].title, "설계");
  state = visitTab(state, "/notes?workspace=two&note=design", true);
  assert.equal(state.tabs.length, 3);
});
test("close picks a neighbour, reorder and refresh preserve active identity", () => {
  const state = ["/worklog", "/notes", "/calendar"].reduce((state, route) => visitTab(state, route, true), EMPTY_TABS);
  const reordered = reorderTabs(state, state.tabs[2].tabId, state.tabs[0].tabId);
  assert.equal(reordered.tabs[0].system, "Calendar");
  assert.equal(reordered.activeTabId, state.activeTabId);
  assert.deepEqual(restoreTabs(JSON.stringify(reordered)), reordered);
  const closed = closeTab(reordered, reordered.activeTabId!);
  assert.equal(closed.tabs.length, 2); assert.equal(closed.activeTabId, closed.tabs[0].tabId);
  assert.deepEqual(closeTab(closeTab(closed, closed.tabs[0].tabId), closed.tabs[1].tabId), EMPTY_TABS);
});
test("corrupt storage and unsafe saved targets cannot become navigation", () => {
  assert.deepEqual(restoreTabs("broken"), EMPTY_TABS);
  assert.deepEqual(restoreTabs('{"version":2,"tabs":[]}'), EMPTY_TABS);
  const state = restoreTabs(JSON.stringify({ version: 1, activeTabId: "evil", tabs: [
    { tabId: "evil", route: "https://evil.test", title: "bad" },
    { tabId: "one", route: "/worklog", title: "good", content: "never restore content" },
    { tabId: "two", route: "/worklog", title: "duplicate" },
  ] }));
  assert.equal(state.tabs.length, 1); assert.equal(state.activeTabId, "one");
  assert.equal("content" in state.tabs[0], false);
});
