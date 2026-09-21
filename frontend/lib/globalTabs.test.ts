import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTab, closeOtherTabs, closeTabsToRight, duplicateTab, selectTab, toggleTabPin, EMPTY_TABS, personalOsTitle, reorderTabs, restoreTabs, TAB_STORAGE_KEY, tabTarget, visitTab } from "./globalTabs";

test('WORK FLOW routes preserve daily source context in shared tabs',()=>{
 const target=tabTarget('/workflow/today?date=2026-09-14&block=source&content=private');
 assert.equal(target?.system,'WORK FLOW');assert.equal(target?.route,'/workflow/today?block=source&date=2026-09-14');
 for(const route of ['projects','timeline','todo','today'])assert.equal(tabTarget(`/workflow/${route}`)?.system,'WORK FLOW');
 assert.equal(tabTarget('/workflow/calendar'),null);
});

test("Personal OS naming preserves the existing tab compatibility key", () => {
  assert.equal(personalOsTitle("Calendar"), "Calendar | Personal OS");
  assert.equal(personalOsTitle(), "Personal OS");
  assert.equal(TAB_STORAGE_KEY, "orbit.globalTabs.v1");
});

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
    { tabId: "one", route: "/worklog", title: "duplicate identity" },
  ] }));
  assert.equal(state.tabs.length, 1); assert.equal(state.activeTabId, "one");
  assert.equal("content" in state.tabs[0], false);
});

test("pinned tabs retain order and survive bulk close, direct close stays explicit", () => {
  let state = ["/worklog", "/notes", "/calendar", "/authoring"].reduce((value, route) => visitTab(value, route, true), EMPTY_TABS);
  const [work, note, calendar, authoring] = state.tabs;
  state = toggleTabPin(state, calendar.tabId);
  assert.deepEqual(state.tabs.map(tab => tab.tabId), [work, note, calendar, authoring].map(tab => tab.tabId));
  assert.deepEqual(restoreTabs(JSON.stringify(state)), state);
  const others = closeOtherTabs(state, note.tabId);
  assert.deepEqual(others.tabs.map(tab => tab.tabId), [note.tabId, calendar.tabId]);
  assert.equal(others.activeTabId, note.tabId);
  const right = closeTabsToRight(state, work.tabId);
  assert.deepEqual(right.tabs.map(tab => tab.tabId), [work.tabId, calendar.tabId]);
  assert.equal(right.activeTabId, work.tabId);
  const pinnedActive = selectTab(state, calendar.tabId);
  assert.equal(closeOtherTabs(pinnedActive, note.tabId).activeTabId, calendar.tabId);
  assert.equal(closeTabsToRight(pinnedActive, work.tabId).activeTabId, calendar.tabId);
  assert.equal(closeTab(pinnedActive, calendar.tabId).tabs.some(tab => tab.pinned), false);
  assert.equal(toggleTabPin(state, calendar.tabId).tabs[2].pinned, false);
  assert.equal(restoreTabs(JSON.stringify({ ...state, tabs: [{ ...work, pinned: "true" }] })).tabs[0].pinned, false);
});

test("duplicates keep route context, independent identity, selection and restoration", () => {
  const original = visitTab(EMPTY_TABS, "/notes?workspace=one&note=design", true, "설계");
  const pinned = toggleTabPin(original, original.activeTabId!);
  const state = duplicateTab(pinned, pinned.activeTabId!);
  const [first, copy] = state.tabs;
  assert.notEqual(copy.tabId, first.tabId);
  assert.equal(copy.contextKey, first.contextKey); assert.equal(copy.route, first.route); assert.equal(copy.title, first.title);
  assert.equal(first.pinned, true); assert.equal(copy.pinned, false);
  assert.equal(state.activeTabId, copy.tabId);
  assert.deepEqual(restoreTabs(JSON.stringify(state)), state);
  assert.equal(visitTab(state, copy.route).activeTabId, copy.tabId);
  assert.equal(visitTab(selectTab(state, first.tabId), copy.route).activeTabId, first.tabId);
  const navigated = visitTab(state, "/calendar");
  assert.equal(navigated.tabs[0].route, first.route);
  assert.equal(navigated.tabs[1].tabId, copy.tabId); assert.equal(navigated.tabs[1].route, "/calendar");
  assert.equal(visitTab(pinned, "/calendar").tabs[0].pinned, true);
});
