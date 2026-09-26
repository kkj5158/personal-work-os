import { test } from "node:test";
import assert from "node:assert/strict";
import { dietDayView, parseDietDay } from "./dietDay";

const payload = (extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, date: "2026-09-26",
  measurements: { morningWeight: 98, morningGlucose: 90, bedtimeBreathKetone: 5, morningMeasuredAt: "2026-09-26T07:10:00" },
  checklist: { total: 3, success: 1, failure: 1, unrecorded: 0, items: [{ title: "야식 참기", importance: "CORE", state: "SUCCESS" }, { title: "탄수 50g", importance: "CORE", state: "FAILURE" }, { title: "물", importance: "OPTIONAL", state: "MISSING" }] },
  note: "메모", focus: [{ title: "지금", role: "CURRENT_FOCUS", startDate: "2026-09-22", endDate: "2026-09-27" }, { title: "최종", role: "FINAL_GOAL", startDate: "2026-08-01", endDate: "2027-03-01" }], ...extra });

test("structured view: measurement table follows the slot contract, no bedtime weight", () => {
  const view = dietDayView(parseDietDay(payload({ currentWeight: { value: 98, date: "2026-09-26" } }))!);
  assert.deepEqual(view.measurements.map(r => [r.label, r.morning, r.bedtime]), [["체중 기록", "98", "해당 없음"], ["혈당", "90", "—"], ["혈중 케톤", "—", "—"], ["호흡 케톤", "—", "5"], ["측정 시각", "07:10", "—"]]);
  assert.deepEqual(view.currentWeight, { value: "98", note: "이 날 기록" });
});

test("focus roles are separate rows; checklist is a table with canonical labels", () => {
  const view = dietDayView(parseDietDay(payload())!);
  assert.deepEqual(view.focus.map(f => [f.label, f.entries.map(e => e.title)]), [["CURRENT FOCUS", ["지금"]], ["NEXT FOCUS", []], ["FINAL GOAL", ["최종"]]]);
  assert.deepEqual(view.checklist.map(r => [r.importance, r.title, r.label]), [["CORE", "야식 참기", "성공"], ["CORE", "탄수 50g", "실패"], ["OPTIONAL", "물", "미입력"]]);
  assert.equal(view.checklistSummary, "성공 1 / 3 · 실패 1");
});

test("blocks projected before currentWeight existed still render; earlier weight is labelled by date", () => {
  assert.equal(dietDayView(parseDietDay(payload())!).currentWeight, null);
  assert.deepEqual(dietDayView(parseDietDay(payload({ currentWeight: { value: 97.5, date: "2026-09-20" } }))!).currentWeight, { value: "97.5", note: "09/20 기록" });
  assert.equal(parseDietDay("{not json"), null);
});
