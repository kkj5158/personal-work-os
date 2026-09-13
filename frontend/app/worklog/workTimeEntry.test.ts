import assert from "node:assert/strict";
import { aggregateWorkMinutesByCategory, toWorkTimeDraftEntry, validateWorkTimeDraftEntries } from "./workTimeEntry.ts";
import type { WorkTimeDraftEntry } from "./workTimeEntry.ts";
import type { ActivityCategory } from "../../lib/api/types.ts";
const categories: ActivityCategory[] = [
 { id: "p", name: "개발", parentId: null, isActive: true, isDefault: false, sortOrder: 0 },
 { id: "c", name: "Orbit", parentId: "p", isActive: true, isDefault: false, sortOrder: 0 },
];
const draft: WorkTimeDraftEntry = { id: "e", parentCategoryId: "p", categoryId: "p", item: "work", timeText: "00:30", memo: "" };
const parse = (text: string) => { const [h,m] = text.split(":").map(Number); return h * 60 + m; };
const validate = (patch: Partial<WorkTimeDraftEntry>) => validateWorkTimeDraftEntries([{ ...draft, ...patch }], parse, categories);
assert.equal(validate({}).validEntries[0].categoryId, "p");
assert.equal(validate({categoryId: ""}).validEntries[0].categoryId, "p");
assert.equal(validate({categoryId: "c"}).validEntries[0].categoryId, "c");
assert.equal(validate({}).validEntries[0].startTime, null);
assert.equal(validate({startText: "10:05", endText: "11:35", timeText: "99:00"}).validEntries[0].minutes, 90);
assert.ok(validate({startText: "10:05"}).errors.e.interval);
assert.ok(validate({startText: "10:01", endText: "11:35"}).errors.e.interval);
assert.ok(validate({startText: "23:55", endText: "00:05"}).errors.e.interval);
const loaded = toWorkTimeDraftEntry({ id: "e", categoryId: "p", item: "work", minutes: 90, startTime: "10:05:00", endTime: "11:35:00" }, String, categories);
assert.equal(loaded.parentCategoryId, "p");
assert.equal(loaded.startText, "10:05");
const totals = aggregateWorkMinutesByCategory([{ categoryId: "p", minutes: 30 }, { categoryId: "c", minutes: 90 }], categories);
assert.equal(totals.get("p"), 120);
assert.equal(totals.get("c"), 90);
console.log("PASS: parent/child selection, unscheduled/scheduled timing, pair, 5m, derived duration, roundtrip and nonduplicated aggregation");
