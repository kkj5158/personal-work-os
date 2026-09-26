// Shared DIET Statistics parity fixture. diet-sys-mobile keeps an identical copy
// (src/diet/stats/statistics.fixture.ts) and asserts the same expected values, so
// Web and Mobile statistics cannot drift apart silently. Keep both copies in sync.
import type { DietData } from "./types";

export const STATS_AS_OF = "2026-09-26";

export const STATS_FIXTURE: DietData = {
  days: [
    { date: "2026-08-15", morningWeight: 101 },
    { date: "2026-09-01", morningWeight: 100, morningGlucose: 90, bedtimeGlucose: 110 },
    { date: "2026-09-10", morningWeight: 99, targetWeight: 98 },
    { date: "2026-09-20", morningWeight: 97.5, morningBloodKetone: 0.8, bedtimeBreathKetone: 5 },
    { date: "2026-09-24", morningWeight: 98, morningGlucose: 85 },
    { date: "2026-09-25", targetWeight: 96 },
  ],
  items: [
    { id: "a", title: "야식 참기", importance: "CORE", keyPoint: "", sortOrder: 1, weeklyReference: 5, monthlyReference: 20, active: true, startDate: "2026-09-01" },
    { id: "b", title: "물 마시기", importance: "OPTIONAL", keyPoint: "", sortOrder: 0, weeklyReference: null, monthlyReference: null, active: true, startDate: "2026-09-20" },
  ],
  checks: [
    { date: "2026-09-21", itemId: "a", state: "SUCCESS", memo: "" },
    { date: "2026-09-22", itemId: "a", state: "FAILURE", memo: "" },
    { date: "2026-09-23", itemId: "a", state: "UNRECORDED", memo: "" },
    { date: "2026-09-24", itemId: "a", state: "SUCCESS", memo: "" },
    { date: "2026-09-24", itemId: "b", state: "SUCCESS", memo: "" },
  ],
  challenges: [
    { id: "c1", title: "9월 집중", role: "CURRENT_FOCUS", homeSortOrder: 0, type: "WEIGHT", status: "ACTIVE", startDate: "2026-09-10", endDate: "2026-10-10", color: "#2875dc", keyPoint: "", notes: [], sortOrder: 0, startWeight: 99, targetWeight: 95, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null },
  ],
  goals: [
    { id: "g-final", kind: "FINAL", targetDate: "2026-12-31", targetWeight: 90, baselineDate: "2026-09-01", baselineWeight: 100, core: "", memoItems: [] },
    { id: "g-week", kind: "WEEKLY", targetDate: "2026-09-27", targetWeight: 97, core: "", memoItems: [] },
  ],
  milestones: [{ id: "m1", challengeId: "c1", date: "2026-09-30", value: 96, title: "중간 점검", memoItems: [] }],
  settings: {
    weightLines: [{ id: "l1", name: "개인", value: 95, visible: true }],
    metabolic: { glucose: { lines: [{ id: "gl", name: "기준", value: 100, visible: true }], bands: [{ id: "gb", name: "범위", min: 70, max: 100, visible: true, color: "#dce9f6" }] } },
  },
  archivePeriods: [],
};
