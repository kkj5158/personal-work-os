import { test } from "node:test";
import assert from "node:assert/strict";
import { challengeEqual, draftChanged, saveChallengeDrafts, validateChallenge, type ChallengeDraftMap } from "./challengeDrafts";
import type { Challenge, DietData } from "./types";
import { civilDay, dateTicks, inclusiveDays, shiftDateRange } from "../dateRange";

const challenge = (id = "a"): Challenge => ({ id, title: id, role: "CURRENT_FOCUS", homeSortOrder: 0, type: "MANUAL", status: "ACTIVE", startDate: "2026-03-07", endDate: "2026-03-10", color: "#4279db", keyPoint: "", notes: ["previous edit"], sortOrder: 0, startWeight: null, targetWeight: null, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: 0, targetValue: 10 });
const data = (challenges: Challenge[]): DietData => ({ challenges, days: [], checks: [], items: [], milestones: [], goals: [], settings: {} });
test("civil-day move preserves inclusive duration across DST, leap and year boundaries", () => {
  for (const range of [{ startDate: "2026-03-07", endDate: "2026-03-10" }, { startDate: "2024-02-28", endDate: "2024-03-01" }, { startDate: "2025-12-31", endDate: "2026-01-01" }]) {
    const moved = shiftDateRange(range, "move", 2); assert.equal(inclusiveDays(moved), inclusiveDays(range)); assert.equal(civilDay(moved.startDate) - civilDay(range.startDate), 2);
  }
  assert.throws(() => civilDay("2026-02-30"));
});
test("endpoints clamp without crossing; same-day and long periods remain exact", () => {
  const c = challenge(); assert.equal(shiftDateRange(c, "start", 100).startDate, c.endDate); assert.equal(shiftDateRange(c, "end", -100).endDate, c.startDate);
  assert.equal(inclusiveDays({ startDate: "2024-01-01", endDate: "2026-12-31" }), 1096);
  assert.equal(inclusiveDays({ startDate: c.startDate, endDate: c.startDate }), 1);
});
test("month ticks follow actual February and March boundaries", () => {
  assert.deepEqual(dateTicks(civilDay("2024-02-01"), civilDay("2024-04-01"), "month").map(t => t.day), [civilDay("2024-02-01"), civilDay("2024-03-01"), civilDay("2024-04-01")]);
});
test("ID drafts isolate fields and drag cancellation retains earlier edits", () => {
  const a = challenge(), b = challenge("b"), before = { ...a, title: "edited title" };
  const drafts: ChallengeDraftMap = { a: { base: a, value: before }, b: { base: b, value: b } };
  const moved = { ...before, ...shiftDateRange(before, "move", 3) }, cancelled = { ...moved, startDate: before.startDate, endDate: before.endDate };
  assert.deepEqual(cancelled, before); assert.deepEqual(drafts.b.value, b); assert.equal(draftChanged(drafts.b), false); assert.equal(draftChanged(drafts.a), true);
});
test("period edits validate milestones without moving canonical records or baseline", () => {
  const c = challenge(), snapshot = JSON.stringify(c), milestone = { id: "m", challengeId: c.id, title: "", date: c.endDate, value: 4, memoItems: [] };
  assert.match(validateChallenge({ ...c, endDate: c.startDate }, [milestone]), /마일스톤/); assert.equal(milestone.date, "2026-03-10"); assert.equal(JSON.stringify(c), snapshot);
});
test("partial save commits only successful IDs and retry writes only unresolved drafts", async () => {
  const a = challenge(), b = challenge("b"), remote = data([a, b]);
  const drafts: ChallengeDraftMap = { a: { base: a, value: { ...a, title: "saved a" } }, b: { base: b, value: { ...b, title: "saved b" } } }, calls: string[] = [], failures: string[] = [];
  let fail = true;
  const io = { load: async () => remote, save: async (c: Challenge) => { calls.push(c.id); if (c.id === "b" && fail) throw new Error("offline"); remote.challenges = remote.challenges.map(r => r.id === c.id ? c : r); }, committed: (id: string) => { delete drafts[id]; }, failed: (id: string) => { failures.push(id); } };
  await saveChallengeDrafts(["a", "b"], drafts, io); assert.deepEqual(Object.keys(drafts), ["b"]); assert.deepEqual(failures, ["b"]);
  fail = false; await saveChallengeDrafts(Object.keys(drafts), drafts, io); assert.deepEqual(calls, ["a", "b", "b"]); assert.deepEqual(drafts, {});
});
test("response loss after committed PUT reconciles without another write", async () => {
  const a = challenge(), remote = data([a]), draft = { ...a, title: "confirmed" }; let writes = 0, confirmed = false;
  await saveChallengeDrafts([a.id], { a: { base: a, value: draft } }, { load: async () => remote, save: async c => { writes++; remote.challenges = [c]; throw new Error("response lost"); }, committed: (_id, value) => { assert.equal(value.title, "confirmed"); confirmed = true; }, failed: () => assert.fail("must reconcile") });
  assert.equal(writes, 1); assert.equal(confirmed, true);
});
test("observed concurrent edits reject overwrite; invalid batch writes nothing", async () => {
  const a = challenge(); let writes = 0; const errors: string[] = [];
  const io = { load: async () => data([{ ...a, title: "other device" }]), save: async () => { writes++; }, committed: () => assert.fail(), failed: (_id: string, message: string) => { errors.push(message); } };
  await saveChallengeDrafts(["a"], { a: { base: a, value: { ...a, title: "mine" } } }, io); assert.match(errors[0], /다른 화면/); assert.equal(writes, 0);
  await saveChallengeDrafts(["a"], { a: { base: a, value: { ...a, title: "" } } }, io); assert.equal(writes, 0);
});
test("server serialization order, text normalization and independent ordering do not cause false conflict", () => {
  const a = challenge(), reversed = Object.fromEntries(Object.entries(a).reverse()) as Challenge;
  assert.equal(challengeEqual(a, { ...reversed, title: ` ${a.title} `, sortOrder: 22 }), true);
});
