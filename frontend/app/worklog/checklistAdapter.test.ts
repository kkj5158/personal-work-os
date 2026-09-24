import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChecklistMatrixResponseDto } from "@/lib/api/types";
import { indexMatrix, patchMatrix, toChecklistState, toEntryChanges, toWorkResult, workAvailability } from "./checklistAdapter";

const matrix = {
  columns: [],
  rows: [
    { date: "2026-09-14", status: "WORK", applicable: true, cells: [{ entryId: "e1", itemId: "i1", result: "PASS" }] },
    { date: "2026-09-15", status: "DAY_OFF", applicable: false, cells: [{ entryId: "e2", itemId: "i1", result: "FAIL" }] },
  ],
} as unknown as ChecklistMatrixResponseDto;

test("WORK OS vocabulary maps onto the four shared states without collapsing any", () => {
  assert.deepEqual((["PASS", "FAIL", "UNRECORDED", "UNSET"] as const).map(toChecklistState), ["SUCCESS", "FAILURE", "NOT_RECORDED", "UNTOUCHED"]);
  assert.deepEqual((["SUCCESS", "FAILURE", "NOT_RECORDED", "UNTOUCHED"] as const).map(toWorkResult), ["PASS", "FAIL", "UNRECORDED", "UNSET"]);
});

test("attendance scoping: only a workday's existing entry is editable; non-work days are inactive, not failures", () => {
  const index = indexMatrix(matrix);
  assert.equal(workAvailability(index, "i1", "2026-09-14", "2026-09-20"), "EDITABLE");
  assert.equal(workAvailability(index, "i1", "2026-09-15", "2026-09-20"), "INACTIVE");
  assert.equal(workAvailability(index, "i1", "2026-09-16", "2026-09-20"), "INACTIVE");
  assert.equal(workAvailability(index, "i1", "2026-09-21", "2026-09-20"), "FUTURE");
  assert.deepEqual(toEntryChanges(index, [{ rowId: "i1", date: "2026-09-14", state: "NOT_RECORDED" }, { rowId: "i9", date: "2026-09-14", state: "SUCCESS" }]), [{ entryId: "e1", result: "UNRECORDED" }]);
});

test("confirmed writes patch the matrix in place — existing records are preserved", () => {
  const next = patchMatrix(matrix, [{ rowId: "i1", date: "2026-09-14", state: "FAILURE" }])!;
  assert.equal(next.rows[0].cells[0].result, "FAIL");
  assert.equal(next.rows[1].cells[0].result, "FAIL");
  assert.equal(matrix.rows[0].cells[0].result, "PASS", "input untouched");
});
