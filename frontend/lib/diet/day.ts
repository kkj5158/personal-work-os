import type { Challenge, ChecklistItem, DailyCheck, DietData } from "./types";
import { dietActiveOn } from "./model";

const ROLE_ORDER: Challenge["role"][] = ["CURRENT_FOCUS", "NEXT_FOCUS", "FINAL_GOAL"];
const IMPORTANCE_ORDER: ChecklistItem["importance"][] = ["CORE", "SECONDARY", "OPTIONAL"];

/**
 * Challenge context is derived from the date: every Challenge whose current period
 * covers it. Daily Notes never store a challenge link, so editing periods only
 * changes this derived view.
 */
export function challengesOn(date: string, challenges: readonly Challenge[]) {
  return challenges
    .filter(c => c.startDate <= date && date <= c.endDate)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.sortOrder - b.sortOrder);
}

export type DayChecklist = {
  rows: { item: ChecklistItem; state: DailyCheck["state"] }[];
  success: number; failure: number; unrecorded: number; total: number;
};

/** Items live on the date (shared archive semantics) plus any item recorded that day. */
export function checklistOn(date: string, data: DietData): DayChecklist {
  const states = new Map(data.checks.filter(c => c.date === date).map(c => [c.itemId, c.state]));
  const rows = data.items
    .filter(item => (states.get(item.id) ?? "MISSING") !== "MISSING" || dietActiveOn(item, date, data.archivePeriods ?? [], data.checks))
    .sort((a, b) => IMPORTANCE_ORDER.indexOf(a.importance) - IMPORTANCE_ORDER.indexOf(b.importance) || a.sortOrder - b.sortOrder)
    .map(item => ({ item, state: states.get(item.id) ?? ("MISSING" as const) }));
  const count = (state: DailyCheck["state"]) => rows.filter(r => r.state === state).length;
  return { rows, success: count("SUCCESS"), failure: count("FAILURE"), unrecorded: count("UNRECORDED"), total: rows.length };
}
