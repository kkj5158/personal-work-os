import type { ChecklistMatrixResponseDto, ChecklistResult } from "@/lib/api/types";
import type { CellAvailability, CellChange, ChecklistState } from "@/lib/checklist-core/types";

// WORK OS adapter for the shared checklist interaction. Storage stays
// attendance-scoped (one entry per WorkRecord × item); only the vocabulary is mapped.
const TO_STATE: Record<ChecklistResult, ChecklistState> = { PASS: "SUCCESS", FAIL: "FAILURE", UNRECORDED: "NOT_RECORDED", UNSET: "UNTOUCHED" };
const TO_RESULT: Record<ChecklistState, ChecklistResult> = { SUCCESS: "PASS", FAILURE: "FAIL", NOT_RECORDED: "UNRECORDED", UNTOUCHED: "UNSET" };
export const toChecklistState = (result: ChecklistResult) => TO_STATE[result];
export const toWorkResult = (state: ChecklistState) => TO_RESULT[state];

type Matrix = ChecklistMatrixResponseDto;
type Cell = Matrix["rows"][number]["cells"][number];

export function indexMatrix(matrix: Matrix | null) {
  const cells = new Map<string, Cell>();
  const rows = new Map<string, Matrix["rows"][number]>();
  for (const row of matrix?.rows ?? []) {
    rows.set(row.date, row);
    for (const cell of row.cells) cells.set(`${cell.itemId}|${row.date}`, cell);
  }
  return { cells, rows };
}

/** Only an existing entry on a workday is editable; a non-work day or missing entry is inactive, never a failure. */
export function workAvailability(index: ReturnType<typeof indexMatrix>, itemId: string, date: string, today: string): CellAvailability {
  if (date > today) return "FUTURE";
  const row = index.rows.get(date);
  return row?.applicable && index.cells.has(`${itemId}|${date}`) ? "EDITABLE" : "INACTIVE";
}

export function toEntryChanges(index: ReturnType<typeof indexMatrix>, changes: CellChange[]) {
  return changes.flatMap(change => {
    const cell = index.cells.get(`${change.rowId}|${change.date}`);
    return cell ? [{ entryId: cell.entryId, result: toWorkResult(change.state) }] : [];
  });
}

/** Patches confirmed results into the matrix — no refetch after a write. */
export function patchMatrix(matrix: Matrix | null, changes: CellChange[]): Matrix | null {
  if (!matrix) return matrix;
  const next = new Map(changes.map(c => [`${c.rowId}|${c.date}`, toWorkResult(c.state)]));
  return { ...matrix, rows: matrix.rows.map(row => ({ ...row, cells: row.cells.map(cell => next.has(`${cell.itemId}|${row.date}`) ? { ...cell, result: next.get(`${cell.itemId}|${row.date}`)! } : cell) })) };
}
