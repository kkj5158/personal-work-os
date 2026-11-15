import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySpaceHistory, rememberSpace, restoreSpaceHistory, routeNavigation, SPACES, spaceDestination, SYSTEMS, systemDestination, WORK_GROUPS } from "./spaceNavigation";
import { tabTarget } from "./globalTabs";

const matrix = {
  work: ["/workflow", "/workflow/week", "/workflow/projects", "/workflow/todo", "/workflow/timeline", "/workflow/waiting", "/workflow/attention", "/calendar", "/workflow/routine", "/worklog", "/worklog/attendance", "/worklog/checklist", "/workflow/shared-desk", "/workflow/today"],
  knowledge: ["/notes", "/blog"],
  growth: ["/study", "/authoring", "/authoring/library", "/authoring/recovery/session/11111111-1111-4111-8111-111111111111/full"],
  life: ["/life/categories", "/life/calendar", "/life/sleep", "/life/sleep/records", "/life/sleep/statistics", "/life/sleep/settings", "/diet", "/diet/record", "/diet/planner", "/diet/note", "/diet/progress", "/diet/gallery", "/diet/identity", "/checklist", "/checklist/progress", "/checklist/manage", "/checklist/manage/items", "/checklist/archived"],
  finance: ["/money", "/money/bookkeeping", "/money/review", "/money/workbench", "/money/classification", "/money/spending-calendar", "/money/income-calendar", "/money/coupang-work-calendar", "/money/accounts", "/money/reconciliation", "/money/loans", "/money/analysis", "/money/settings", "/money/transactions", "/money/flow", "/money/accounts/11111111-1111-4111-8111-111111111111"],
} as const;
for (const [spaceId, routes] of Object.entries(matrix)) {
  test(`${spaceId}: every canonical/legacy route retains its system and Space ownership`, () => {
    for (const route of routes) {
      const result = routeNavigation(route);
      assert.equal(result?.spaceId, spaceId, route);
      assert.equal(result?.id, tabTarget(route)?.system, "legacy tab system identity stays intact");
      assert.equal(result?.route, route);
    }
  });
}
test("five Spaces, exact WORK menu, CHECKLIST belongs only to LIFE", () => {
  assert.deepEqual(SPACES.map(row => row.name), ["WORK", "KNOWLEDGE & LOG", "GROWTH", "LIFE", "FINANCE"]);
  assert.deepEqual(WORK_GROUPS.map(row => [row.section, row.items.map(item => item.label)]), [
    ["PLANNING", ["This Week", "Projects", "All To-dos", "Timeline", "Waiting", "WORK QUEUE"]],
    ["EXECUTION", ["Calendar", "Work Routine"]], ["RECORDS", ["근무 기록", "출결 관리", "근무 체크리스트"]], ["TOOLS", ["공유 작업대"]], ["ARCHIVED", ["Workpad"]],
  ]);
  for (const group of WORK_GROUPS) for (const item of group.items) assert.equal(routeNavigation(item.href)?.spaceId, "work");
  assert.equal(routeNavigation("/worklog/checklist")?.id, "WORK OS");
  assert.equal(routeNavigation("/checklist")?.spaceId, "life");
  assert.deepEqual(SYSTEMS.filter(row => row.spaceId === "life").map(row => row.id), ["LIFE CODE", "DIET SYS", "CHECKLIST SYS"]);
});
test("first entry uses real pages, return restores per-Space and per-system page/query context", () => {
  let history = emptySpaceHistory();
  assert.deepEqual(SPACES.map(row => spaceDestination(history, row.id)), ["/workflow/week", "/notes", "/study", "/life/categories", "/money"]);
  for (const route of ["/notes?workspace=design&workspaceName=Design&note=one&module=ALL_NOTES&date=2026-11-15&tag=ui", "/blog", "/study?tab=history&demo=1&mode=document&doc=answer", "/life/sleep?date=2026-11-15&view=week&kind=nap", "/checklist?identity=one&area=two", "/calendar?date=2026-11-15&view=week&tab=sleep", "/money/bookkeeping?month=2026-11&account=11111111-1111-4111-8111-111111111111", "/diet/note?workspace=health&note=two&date=2026-11-15"]) history = rememberSpace(history, route);
  history = restoreSpaceHistory(JSON.stringify(history));
  assert.equal(spaceDestination(history, "knowledge"), "/blog");
  assert.equal(systemDestination(history, "NOTE SYS"), "/notes?date=2026-11-15&module=ALL_NOTES&note=one&tag=ui&workspace=design&workspaceName=Design");
  assert.equal(spaceDestination(history, "work"), "/calendar?date=2026-11-15&tab=sleep&view=week");
  assert.equal(spaceDestination(history, "life"), "/diet/note?date=2026-11-15&note=two&workspace=health");
  assert.equal(systemDestination(history, "CHECKLIST SYS"), "/checklist?area=two&identity=one");
  assert.equal(spaceDestination(history, "finance"), "/money/bookkeeping?account=11111111-1111-4111-8111-111111111111&month=2026-11");
});
test("corrupt, unsafe, cross-Space and stale history safely falls back; content/secrets never stored", () => {
  for (const raw of [null, "{", '{"version":2}', '{"version":1,"spaces":{"life":"/money","work":"//outside.example"},"systems":{"NOTE SYS":"/blog"}}']) assert.deepEqual(restoreSpaceHistory(raw), emptySpaceHistory());
  const history = rememberSpace(emptySpaceHistory(), "/notes?workspace=one&token=private&content=private&note=two");
  assert.equal(systemDestination(history, "NOTE SYS"), "/notes?note=two&workspace=one");
  for (const route of ["/unknown", "/notes/unknown", "//external.example/notes", "https://external.example/notes", "/\\external"]) {
    assert.equal(routeNavigation(route), null); assert.equal(rememberSpace(history, route), history);
  }
});
test("existing non-tab planning, authorization and development fixture routes retain shell ownership without storing sensitive context", () => {
  for (const [route, space] of [["/planning?date=2026-11-15", "work"], ["/workflow/attention/connect?challenge=private", "work"], ["/notes/fixture", "knowledge"]]) {
    assert.equal(routeNavigation(route)?.spaceId, space);
    assert.equal(routeNavigation(route)?.restorable, false);
    const history = emptySpaceHistory(); assert.equal(rememberSpace(history, route), history);
  }
});
test("CHECKLIST's existing archive redirect retains its view when leaving and restoring LIFE", () => {
  const history = rememberSpace(emptySpaceHistory(), "/checklist?archived=1&identity=one&area=two");
  assert.equal(spaceDestination(restoreSpaceHistory(JSON.stringify(history)), "life"), "/checklist?archived=1&area=two&identity=one");
  assert.equal(routeNavigation("/checklist?archived=private")?.route, "/checklist");
});
