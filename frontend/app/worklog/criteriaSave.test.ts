// Deterministic verification for FIX 8 (StartTimeCriteriaModal partial-save
// consistency). Same rationale as lib/seoulDate.test.ts: no test runner is
// installed in this frontend, so this is a small assert-based script
// runnable directly via `node app/worklog/criteriaSave.test.ts` (Node
// 22.6+), exercising the exact planSaveAction/commitCriterionResult
// functions StartTimeCriteriaModal's handleSave calls — not a parallel
// reimplementation of the logic.
import assert from "node:assert/strict";
import { commitCriterionResult, criterionEquals, planSaveAction, type DraftCriterion } from "./criteriaSave.ts";
import type { StartTimeCriterion } from "./startTimeCriterion.ts";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function draft(overrides: Partial<DraftCriterion>): DraftCriterion {
  return { id: "temp-a", name: "아침 기본 출근", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null, isNew: true, ...overrides };
}

test("planSaveAction: an isNew row always plans create, regardless of baseline", () => {
  const row = draft({ id: "temp-a", isNew: true });
  assert.equal(planSaveAction(row, new Map()), "create");
});

test("planSaveAction: an existing row with no baseline entry plans update (never create)", () => {
  const row = draft({ id: "real-1", isNew: false });
  assert.equal(planSaveAction(row, new Map()), "update");
});

test("planSaveAction: an existing row matching its baseline plans noop", () => {
  const persisted: StartTimeCriterion = { id: "real-1", name: "아침 기본 출근", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  const row = draft({ id: "real-1", isNew: false });
  assert.equal(planSaveAction(row, new Map([["real-1", persisted]])), "noop");
});

test("planSaveAction: an existing row that diverges from its baseline plans update", () => {
  const persisted: StartTimeCriterion = { id: "real-1", name: "아침 기본 출근", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  const row = draft({ id: "real-1", isNew: false, graceMinutes: 10 });
  assert.equal(planSaveAction(row, new Map([["real-1", persisted]])), "update");
});

// The core FIX 8 property: row A and row B succeed, row C fails; a retry
// re-plans against the *reconciled* state (not the original request), so A
// and B are never re-created — only C is retried.
test("retry after a partial failure never re-plans create for an already-committed row", () => {
  const rowA = draft({ id: "temp-a", name: "A", isNew: true });
  const rowB = draft({ id: "temp-b", name: "B", isNew: true });
  const rowC = draft({ id: "temp-c", name: "C", isNew: true });

  let working: DraftCriterion[] = [rowA, rowB, rowC];
  let baseline = new Map<string, StartTimeCriterion>();

  // Attempt 1: A and B "succeed" (server assigns real ids), C throws before
  // being committed — exactly what handleSave's try/catch leaves behind.
  const persistedA: StartTimeCriterion = { id: "real-a", name: "A", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  ({ working, baseline } = commitCriterionResult(working, baseline, "temp-a", persistedA));
  const persistedB: StartTimeCriterion = { id: "real-b", name: "B", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  ({ working, baseline } = commitCriterionResult(working, baseline, "temp-b", persistedB));
  // C's create throws here in the real flow — nothing committed for it.

  // The user clicks 저장 again. handleSave re-validates from the current
  // draft (now containing A/B's post-commit rows) and re-plans every row.
  const rowAAfterAttempt1 = working.find((d) => d.name === "A")!;
  const rowBAfterAttempt1 = working.find((d) => d.name === "B")!;
  const rowCAfterAttempt1 = working.find((d) => d.name === "C")!;

  assert.equal(rowAAfterAttempt1.isNew, false, "A must no longer be isNew after committing");
  assert.equal(rowAAfterAttempt1.id, "real-a", "A must carry its real server id after committing");
  assert.equal(planSaveAction(rowAAfterAttempt1, baseline), "noop", "A must not be re-created or even re-updated on retry");
  assert.equal(planSaveAction(rowBAfterAttempt1, baseline), "noop", "B must not be re-created or even re-updated on retry");
  assert.equal(planSaveAction(rowCAfterAttempt1, baseline), "create", "C (never committed) must still plan create on retry");

  // Attempt 2: only C is actually sent to the server this time.
  const persistedC: StartTimeCriterion = { id: "real-c", name: "C", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  ({ working, baseline } = commitCriterionResult(working, baseline, "temp-c", persistedC));
  assert.deepEqual(
    working.map((d) => d.id).sort(),
    ["real-a", "real-b", "real-c"].sort(),
    "no row was ever created twice — exactly one server id per original row",
  );
});

test("criterionEquals ignores id — only the editable fields matter for change detection", () => {
  const a: StartTimeCriterion = { id: "x", name: "A", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  const b: StartTimeCriterion = { id: "y", name: "A", startTime: "09:00", active: true, graceMinutes: 5, isDefault: false, memo: null };
  assert.equal(criterionEquals(a, b), true);
});
