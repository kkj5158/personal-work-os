import type { StartTimeCriterion } from "./startTimeCriterion";

export interface DraftCriterion extends StartTimeCriterion {
  /** True only for a row added via 기준 추가 during this modal session and
   *  not yet saved. */
  isNew: boolean;
}

export function criterionEquals(a: StartTimeCriterion, b: StartTimeCriterion): boolean {
  return a.name === b.name && a.startTime === b.startTime && a.active === b.active && a.graceMinutes === b.graceMinutes;
}

export type SaveAction = "create" | "update" | "noop";

// Pure decision for one row: does StartTimeCriteriaModal's handleSave need
// to POST (create), PUT (update), or do nothing (already in sync) for it?
// `baseline` is what's already known to be persisted — reused across a
// retry after a partial failure (see commitCriterionResult below), not
// rebuilt from scratch each attempt, which is exactly what keeps a retry
// from re-creating a row that already succeeded earlier in a prior attempt.
export function planSaveAction(row: DraftCriterion, baseline: Map<string, StartTimeCriterion>): SaveAction {
  if (row.isNew) return "create";
  const rowBaseline = baseline.get(row.id);
  if (!rowBaseline || !criterionEquals(rowBaseline, row)) return "update";
  return "noop";
}

// Folds one row's just-persisted server result into the working draft list
// and the reconciliation baseline. Called immediately after each row's
// create/update succeeds (not batched until the very end), so if a later
// row in the same save attempt fails, everything committed so far is
// already reflected here — a subsequent retry's planSaveAction sees this
// row as isNew: false with its real server id already baselined, and can
// never plan another "create" for it.
export function commitCriterionResult(
  working: DraftCriterion[],
  baseline: Map<string, StartTimeCriterion>,
  originalId: string,
  result: StartTimeCriterion,
): { working: DraftCriterion[]; baseline: Map<string, StartTimeCriterion> } {
  return {
    working: working.map((d) => (d.id === originalId ? { ...result, isNew: false } : d)),
    baseline: new Map(baseline).set(result.id, result),
  };
}
