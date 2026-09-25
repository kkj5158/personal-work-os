import { test } from "node:test";
import assert from "node:assert/strict";
import { challengesOn, checklistOn } from "./day";
import { DailyNoteAutosave, type DailyNote, type SaveState } from "./dailyNote";
import type { Challenge, ChecklistItem, DietData } from "./types";

const challenge = (id: string, role: Challenge["role"], startDate: string, endDate: string): Challenge => ({ id, role, homeSortOrder: 0, title: id, type: "WEIGHT", status: "ACTIVE", startDate, endDate, color: "#000000", keyPoint: "", notes: [], sortOrder: 0, startWeight: 100, targetWeight: 90, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null });
const item = (id: string, importance: ChecklistItem["importance"], startDate = "2026-09-01"): ChecklistItem => ({ id, title: id, importance, keyPoint: "", sortOrder: 0, weeklyReference: null, monthlyReference: null, active: true, startDate });

test("challenge context is derived from the date across period boundaries", () => {
  const list = [challenge("final", "FINAL_GOAL", "2026-08-01", "2026-12-31"), challenge("sep", "CURRENT_FOCUS", "2026-09-01", "2026-09-26"), challenge("oct", "CURRENT_FOCUS", "2026-09-27", "2026-10-31")];
  assert.deepEqual(challengesOn("2026-09-26", list).map(c => c.id), ["sep", "final"]);
  assert.deepEqual(challengesOn("2026-09-27", list).map(c => c.id), ["oct", "final"]);
  // Editing a period moves the context, never the date's note.
  assert.deepEqual(challengesOn("2026-09-26", [{ ...list[1], endDate: "2026-09-20" }]).map(c => c.id), []);
});

test("date checklist uses shared states and counts 기록 못함 separately", () => {
  const data: DietData = { days: [], goals: [], challenges: [], milestones: [], settings: {}, archivePeriods: [],
    items: [item("opt", "OPTIONAL"), item("core", "CORE"), item("later", "CORE", "2026-10-01")],
    checks: [{ date: "2026-09-26", itemId: "core", state: "SUCCESS", memo: "" }, { date: "2026-09-26", itemId: "opt", state: "UNRECORDED", memo: "" }] };
  const day = checklistOn("2026-09-26", data);
  assert.deepEqual(day.rows.map(r => r.item.id), ["core", "opt"]);
  assert.deepEqual([day.success, day.failure, day.unrecorded, day.total], [1, 0, 1, 2]);
});

test("autosave debounces, serializes, carries versions and keeps failed text for retry", async () => {
  const writes: [string, number][] = [];
  const states: SaveState[] = [];
  let fail = false;
  let version = 0;
  const saver = new DailyNoteAutosave("2026-09-26", 0, async (date, content, expected) => {
    writes.push([content, expected]);
    if (fail) throw Object.assign(new Error("offline"), { status: 0 });
    version = expected + 1;
    return { date, content, version, updatedAt: null } satisfies DailyNote;
  }, state => states.push(state), 5);
  saver.edit("a"); saver.edit("ab");
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(writes, [["ab", 0]]);
  fail = true;
  saver.edit("abc");
  await saver.flush();
  assert.equal(states.at(-1), "error");
  assert.ok(saver.dirty);
  fail = false;
  await saver.retry();
  assert.deepEqual(writes.at(-1), ["abc", 1]);
  assert.equal(states.at(-1), "saved");
  assert.equal(saver.dirty, false);
});

test("autosave reports version conflicts without overwriting", async () => {
  const states: SaveState[] = [];
  const saver = new DailyNoteAutosave("2026-09-26", 3, async () => { throw Object.assign(new Error("stale"), { status: 409 }); }, s => states.push(s), 5);
  saver.edit("x");
  await saver.flush();
  assert.equal(states.at(-1), "conflict");
});
