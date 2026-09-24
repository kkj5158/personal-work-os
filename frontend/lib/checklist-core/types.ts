// Shared checklist interaction model — CHECKLIST SYS canon, consumed by the
// CHECKLIST SYS, WORK OS and DIET SYS adapters. Product storage differs; the
// four conceptual states and the interaction semantics do not.

/** UNTOUCHED = no result entered. NOT_RECORDED is recording failure, never FAILURE. */
export type ChecklistState = "SUCCESS" | "FAILURE" | "NOT_RECORDED" | "UNTOUCHED";
export const CHECKLIST_STATES: ChecklistState[] = ["SUCCESS", "FAILURE", "NOT_RECORDED", "UNTOUCHED"];

/** Classification/filter only — never ordering, weighting or scoring. */
export type ChecklistImportance = "CORE" | "SECONDARY" | "OPTIONAL";
export const IMPORTANCES: ChecklistImportance[] = ["CORE", "SECONDARY", "OPTIONAL"];

/** One cell mutation. `rowId` is the adapter's item id; `date` is YYYY-MM-DD. */
export type CellChange = { rowId: string; date: string; state: ChecklistState };

export const cellKey = (rowId: string, date: string) => `${rowId}|${date}`;
export const splitCellKey = (key: string) => {
  const at = key.lastIndexOf("|");
  return { rowId: key.slice(0, at), date: key.slice(at + 1) };
};

/** Whether a cell can be edited, and why not. Inactive/future cells never read as failures. */
export type CellAvailability = "EDITABLE" | "FUTURE" | "INACTIVE";

export const STATE_LABELS: Record<ChecklistState, string> = {
  SUCCESS: "성공",
  FAILURE: "실패",
  NOT_RECORDED: "기록 못함",
  UNTOUCHED: "초기화",
};

/** A meaningful result is one that should not be silently overwritten by date-level NOT_RECORDED. */
export const isMeaningful = (state: ChecklistState) => state === "SUCCESS" || state === "FAILURE";
