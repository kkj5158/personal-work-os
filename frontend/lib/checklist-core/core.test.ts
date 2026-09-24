import assert from "node:assert/strict";
import { test } from "node:test";
import { rectangleKeys, movePoint } from "./selection";
import { planDateNotRecorded } from "./dateAction";
import { ChecklistWriteQueue } from "./writeQueue";
import { addCell, currentStreak, emptySummary, finalize, isActiveOn } from "./stats";
import { cellKey, type CellChange, type ChecklistState } from "./types";

const tick = () => new Promise(resolve => setImmediate(resolve));

test("rectangle selection spans items × dates and skips non-editable cells", () => {
  const keys = rectangleKeys(["a", "b", "c"], ["d1", "d2", "d3"], { row: 2, col: 2 }, { row: 0, col: 1 }, (row, date) => !(row === "b" && date === "d2"));
  assert.deepEqual([...keys].sort(), [cellKey("a", "d2"), cellKey("a", "d3"), cellKey("b", "d3"), cellKey("c", "d2"), cellKey("c", "d3")].sort());
  assert.deepEqual(movePoint({ row: 0, col: 0 }, "ArrowUp", 3, 3), { row: 0, col: 0 });
  assert.deepEqual(movePoint({ row: 0, col: 0 }, "ArrowRight", 3, 3), { row: 0, col: 1 });
  assert.equal(movePoint({ row: 0, col: 0 }, "x", 3, 3), null);
});

test("date-level NOT_RECORDED plans item-level rows and surfaces meaningful conflicts", () => {
  const states: Record<string, ChecklistState> = { a: "SUCCESS", b: "UNTOUCHED", c: "NOT_RECORDED", d: "FAILURE", e: "UNTOUCHED" };
  const plan = planDateNotRecorded("2026-09-13", ["a", "b", "c", "d", "e"], row => states[row], row => row !== "e");
  assert.deepEqual(plan.safe.map(c => c.rowId), ["b"]);
  assert.deepEqual(plan.conflicts.map(c => c.rowId), ["a", "d"]);
  assert.equal(plan.unchanged, 1);
  assert.ok([...plan.safe, ...plan.conflicts].every(c => c.state === "NOT_RECORDED"));
});

test("write queue: optimistic, coalesced single-flight batches, commit without refetch", async () => {
  const writes: CellChange[][] = [];
  const pending: (() => void)[] = [];
  const committed: CellChange[][] = [];
  const base = new Map<string, ChecklistState>();
  const queue = new ChecklistWriteQueue(
    changes => { writes.push(changes); return new Promise<void>(resolve => pending.push(resolve)); },
    changes => { committed.push(changes); for (const c of changes) base.set(cellKey(c.rowId, c.date), c.state); },
    () => assert.fail("no failure expected"),
    () => {},
  );
  const previous = (row: string, date: string) => base.get(cellKey(row, date)) ?? "UNTOUCHED";
  queue.enqueue([{ rowId: "a", date: "d1", state: "SUCCESS" }], previous);
  assert.equal(queue.get("a", "d1"), "SUCCESS");
  await tick();
  assert.equal(writes.length, 1);
  // Rapid clicks while the first request is in flight coalesce into ONE next batch, latest state wins.
  queue.enqueue([{ rowId: "a", date: "d1", state: "UNTOUCHED" }], previous);
  queue.enqueue([{ rowId: "b", date: "d1", state: "FAILURE" }], previous);
  queue.enqueue([{ rowId: "a", date: "d1", state: "NOT_RECORDED" }], previous);
  assert.equal(queue.get("a", "d1"), "NOT_RECORDED");
  await tick();
  assert.equal(writes.length, 1, "never two requests in flight");
  pending.shift()!();
  await tick(); await tick();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], [{ rowId: "a", date: "d1", state: "NOT_RECORDED" }, { rowId: "b", date: "d1", state: "FAILURE" }]);
  pending.shift()!();
  await queue.idle();
  assert.equal(queue.get("a", "d1"), undefined, "overlay released once the base is patched");
  assert.equal(base.get(cellKey("a", "d1")), "NOT_RECORDED");
  assert.equal(queue.busyCount, 0);
});

test("write queue: a failed batch rolls cells back to the confirmed state", async () => {
  const failures: CellChange[][] = [];
  const queue = new ChecklistWriteQueue(() => Promise.reject(new Error("offline")), () => assert.fail("must not commit"), (_, c) => failures.push(c), () => {});
  queue.enqueue([{ rowId: "a", date: "d1", state: "FAILURE" }], () => "SUCCESS");
  assert.equal(queue.get("a", "d1"), "FAILURE");
  await queue.idle();
  assert.equal(failures.length, 1);
  assert.equal(queue.get("a", "d1"), undefined, "falls back to the unchanged base state");
});

test("rates: NOT_RECORDED is never FAILURE and leaves the completion denominator; archive intervals are excluded", () => {
  const summary = emptySummary();
  for (const state of ["SUCCESS", "SUCCESS", "FAILURE", "NOT_RECORDED", "UNTOUCHED"] as ChecklistState[]) addCell(summary, state, false);
  addCell(summary, "UNTOUCHED", true); // today pending — not counted
  const rates = finalize(summary);
  assert.equal(rates.eligible, 5);
  assert.equal(rates.failure, 1);
  assert.equal(rates.notRecorded, 1);
  assert.equal(rates.completionRate, 50); // 2 / (5 - 1)
  assert.equal(rates.failureRate, 25);
  assert.equal(rates.recordingRate, 60); // (2 + 1) / 5
  assert.equal(rates.notRecordedRate, 20);
  const periods = [{ itemId: "i", archivedOn: "2026-09-10", restoredOn: "2026-09-15" }];
  assert.equal(isActiveOn("2026-09-09", "2026-09-01", periods), true);
  assert.equal(isActiveOn("2026-09-10", "2026-09-01", periods), false);
  assert.equal(isActiveOn("2026-09-14", "2026-09-01", periods), false);
  assert.equal(isActiveOn("2026-09-15", "2026-09-01", periods), true, "restore day continues recording");
  assert.equal(isActiveOn("2026-08-31", "2026-09-01", periods), false);
  assert.equal(isActiveOn("2026-09-20", "2026-09-01", [], "2026-09-18"), false, "currently archived");
});

test("streak: NOT_RECORDED and inactive days neither extend nor break; failure does", () => {
  const states: Record<string, ChecklistState> = { "2026-09-20": "UNTOUCHED", "2026-09-19": "SUCCESS", "2026-09-18": "NOT_RECORDED", "2026-09-17": "SUCCESS", "2026-09-16": "UNTOUCHED", "2026-09-15": "FAILURE", "2026-09-14": "SUCCESS" };
  const dates = Object.keys(states).sort().reverse();
  assert.equal(currentStreak(dates, "2026-09-20", d => d !== "2026-09-16", d => states[d]), 2);
  assert.equal(currentStreak(dates, "2026-09-20", () => true, d => states[d]), 2);
});
