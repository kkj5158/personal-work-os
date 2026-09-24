import assert from "node:assert/strict";
import { test } from "node:test";
import { journalGroups, progressReport, recordMap, availabilityOf, periodsByItem, ALL_IMPORTANCE } from "./model";
import type { Catalog, Item } from "./api";

const item = (id: string, areaId: string, importance: Item["importance"], sortOrder: number, extra: Partial<Item> = {}): Item =>
  ({ id, areaId, name: id, description: "", importance, icon: "check", sortOrder, startDate: "2026-09-01", archivedOn: null, ...extra });

const catalog: Catalog = {
  identities: [{ id: "kafka", name: "KAFKA", description: "", color: "#9b7fe6", sortOrder: 1 }, { id: "ren", name: "REN", description: "", color: "#6cc68b", sortOrder: 0 }],
  areas: [
    { id: "work", identityId: "kafka", name: "Work", description: "", color: "#e9b64f", sortOrder: 0 },
    { id: "meal", identityId: "ren", name: "식사 기록", description: "", color: "#6cc68b", sortOrder: 1 },
    { id: "body", identityId: "ren", name: "몸 상태 기록", description: "", color: "#4c7ef0", sortOrder: 0 },
  ],
  items: [
    item("m-optional", "meal", "OPTIONAL", 0), item("m-core", "meal", "CORE", 1), item("m-secondary", "meal", "SECONDARY", 2),
    item("b-core", "body", "CORE", 0), item("w-core", "work", "CORE", 0), item("m-archived", "meal", "CORE", 3, { archivedOn: "2026-09-18" }),
  ],
  archivePeriods: [{ itemId: "m-archived", archivedOn: "2026-09-18", restoredOn: null }, { itemId: "b-core", archivedOn: "2026-09-05", restoredOn: "2026-09-08" }],
};

test("Journal order is Identity → Area → explicit sort order; importance never reorders; archived hidden", () => {
  const groups = journalGroups(catalog, { identityId: null, areaId: null, importance: ALL_IMPORTANCE });
  assert.deepEqual(groups.map(g => g.area.id), ["body", "meal", "work"]);
  assert.deepEqual(groups[1].items.map(i => i.id), ["m-optional", "m-core", "m-secondary"]);
});

test("Identity, Area and importance filters narrow the same grid", () => {
  assert.deepEqual(journalGroups(catalog, { identityId: "kafka", areaId: null, importance: ALL_IMPORTANCE }).map(g => g.area.id), ["work"]);
  assert.deepEqual(journalGroups(catalog, { identityId: "ren", areaId: "meal", importance: ALL_IMPORTANCE }).map(g => g.area.id), ["meal"]);
  const core = journalGroups(catalog, { identityId: null, areaId: null, importance: ["CORE"] });
  assert.deepEqual(core.flatMap(g => g.items.map(i => i.id)), ["b-core", "m-core", "w-core"]);
});

test("availability: future and archived intervals are never editable (and never failures)", () => {
  const byId = new Map(catalog.items.map(i => [i.id, i]));
  const periods = periodsByItem(catalog.archivePeriods);
  assert.equal(availabilityOf(byId.get("b-core"), "2026-09-06", "2026-09-20", periods), "INACTIVE");
  assert.equal(availabilityOf(byId.get("b-core"), "2026-09-08", "2026-09-20", periods), "EDITABLE");
  assert.equal(availabilityOf(byId.get("b-core"), "2026-09-21", "2026-09-20", periods), "FUTURE");
  assert.equal(availabilityOf(byId.get("m-archived"), "2026-09-19", "2026-09-20", periods), "INACTIVE");
});

test("progress: archived interval is not missing data, NOT_RECORDED is separate, importance adds no weight", () => {
  const records = recordMap([
    { itemId: "b-core", date: "2026-09-04", state: "SUCCESS" },
    { itemId: "b-core", date: "2026-09-09", state: "NOT_RECORDED" },
    { itemId: "b-core", date: "2026-09-10", state: "FAILURE" },
    { itemId: "m-optional", date: "2026-09-04", state: "SUCCESS" },
  ]);
  const report = progressReport(catalog, records, "2026-09-04", "2026-09-10", "2026-09-10", { identityId: "ren", areaId: "body" });
  // 7 days minus the 3 archived days (5,6,7) = 4 active days; today counts because it is recorded.
  assert.equal(report.total.eligible, 4);
  assert.equal(report.total.notRecorded, 1);
  assert.equal(report.total.failure, 1);
  assert.equal(report.total.untouched, 1);
  assert.equal(report.total.completionRate, (1 / 3) * 100);
  const all = progressReport(catalog, records, "2026-09-04", "2026-09-04", "2026-09-10", { identityId: "ren", areaId: null });
  // One CORE success + one OPTIONAL success weigh exactly the same.
  const meal = all.items.find(r => r.item.id === "m-optional")!, body = all.items.find(r => r.item.id === "b-core")!;
  assert.equal(meal.summary.completionRate, body.summary.completionRate);
  assert.ok(all.byArea.some(a => a.area.id === "meal") && all.byIdentity.length === 1);
});
