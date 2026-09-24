import { isMeaningful, type CellChange, type ChecklistState } from "./types";

export type DateNotRecordedPlan = {
  date: string;
  /** Cells that become NOT_RECORDED without overwriting any meaningful result. */
  safe: CellChange[];
  /** Existing SUCCESS/FAILURE cells that would be overwritten — require confirmation. */
  conflicts: CellChange[];
  /** Cells already NOT_RECORDED. */
  unchanged: number;
};

/**
 * MarkDateAsNotRecorded(date, scope): NOT_RECORDED describes recording
 * quality for the whole date, so the user issues one command for the target
 * set. Storage stays item-level; this plans the item-level changes.
 */
export function planDateNotRecorded(
  date: string,
  rowIds: readonly string[],
  getState: (rowId: string, date: string) => ChecklistState,
  editable: (rowId: string, date: string) => boolean,
): DateNotRecordedPlan {
  const safe: CellChange[] = [];
  const conflicts: CellChange[] = [];
  let unchanged = 0;
  for (const rowId of rowIds) {
    if (!editable(rowId, date)) continue;
    const current = getState(rowId, date);
    if (current === "NOT_RECORDED") unchanged++;
    else if (isMeaningful(current)) conflicts.push({ rowId, date, state: "NOT_RECORDED" });
    else safe.push({ rowId, date, state: "NOT_RECORDED" });
  }
  return { date, safe, conflicts, unchanged };
}
