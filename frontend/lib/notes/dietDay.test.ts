import { test } from "node:test";
import assert from "node:assert/strict";
import { dietDayView, parseDietDay } from "./dietDay";

const payload = (extra: Record<string, unknown> = {}) => JSON.stringify({ v: 1, date: "2026-09-26",
  measurements: { morningWeight: 98, morningGlucose: 90, bedtimeBreathKetone: 5, morningMeasuredAt: "2026-09-26T07:10:00" },
  checklist: { total: 3, success: 1, failure: 1, unrecorded: 0, items: [{ title: "야식 참기", importance: "CORE", state: "SUCCESS" }, { title: "탄수 50g", importance: "CORE", state: "FAILURE" }, { title: "물", importance: "OPTIONAL", state: "MISSING" }] },
  note: "메모", focus: [{ title: "지금", role: "CURRENT_FOCUS", startDate: "2026-09-22", endDate: "2026-09-27" }, { title: "최종", role: "FINAL_GOAL", startDate: "2026-08-01", endDate: "2027-03-01" }], ...extra });

test("structured view: measurement table follows the slot contract, no bedtime weight", () => {
  const view = dietDayView(parseDietDay(payload({ currentWeight: { value: 98, date: "2026-09-26" } }))!);
  assert.deepEqual(view.measurements.map(r => [r.slot, r.label, r.weight.value, r.glucose.value, r.bloodKetone.value, r.breathKetone.value, r.measuredAt?.label ?? "—"]), [["MORNING", "아침", "98", "90", "—", "—", "07:10"], ["BEFORE_SLEEP", "취침 전", "해당 없음", "—", "—", "5", "—"]]);
  assert.equal(view.measurements[0].bloodKetone.state, "missing");
  assert.equal(view.measurements[1].weight.state, "unsupported");
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
  assert.deepEqual(dietDayView(parseDietDay(payload({ currentWeight: { value: 97.5, date: "2026-09-20" } }))!).currentWeight, { value: "97.5", note: "2026-09-20 기록" });
  assert.equal(parseDietDay("{not json"), null);
});

test("historical current weight never fills a missing measurement or unsupported bedtime weight", () => {
  const view = dietDayView(parseDietDay(payload({ measurements: { bedtimeWeight: 123, morningGlucose: 0, bedtimeBloodKetone: 0 }, currentWeight: { value: 97.5, date: "2025-09-20" } }))!);
  assert.deepEqual(view.measurements[0].weight, { value: "—", state: "missing" });
  assert.deepEqual(view.measurements[1].weight, { value: "해당 없음", state: "unsupported" });
  assert.deepEqual(view.measurements[0].glucose, { value: "0", state: "recorded" });
  assert.deepEqual(view.measurements[1].bloodKetone, { value: "0", state: "recorded" });
  assert.equal(view.currentWeight?.note, "2025-09-20 기록");
});

test("slot timestamps remain independent and preserve the original timestamp without timezone conversion", () => {
  const morning = "2026-09-26T07:10:31.123";
  const bedtime = "2026-09-27T00:20:59";
  const view = dietDayView(parseDietDay(payload({ measurements: { morningMeasuredAt: morning, bedtimeMeasuredAt: bedtime } }))!);
  assert.deepEqual(view.measurements.map(row => row.measuredAt), [{ dateTime: morning, label: "07:10" }, { dateTime: bedtime, label: "2026-09-27 00:20" }]);
  assert.equal(view.measurements[0].weight.state, "missing", "a slot timestamp is not a measurement value");
  assert.equal(dietDayView(parseDietDay(payload({ measurements: {} }))!).measurements[0].measuredAt, null);
});

test("read-only view preserves every checklist state, classification, canonical order and focus context", () => {
  const source = payload({ checklist: { total: 4, success: 1, failure: 1, unrecorded: 1, items: [
    { title: "A", importance: "CORE", state: "FAILURE" },
    { title: "B", importance: "SECONDARY", state: "UNRECORDED" },
    { title: "C", importance: "OPTIONAL", state: "MISSING" },
    { title: "D", importance: "OPTIONAL", state: "SUCCESS" },
  ] }, focus: [
    { title: "다음", role: "NEXT_FOCUS", startDate: "2026-09-01", endDate: "2026-10-01", keyPoint: "핵심", status: "PAUSED" },
    { title: "지금", role: "CURRENT_FOCUS", startDate: "2026-09-02", endDate: "2026-09-30" },
  ], note: "개인 DIET 메모\n[[원문]] ![미디어](media:keep)" });
  const day = parseDietDay(source)!;
  const before = JSON.stringify(day);
  const view = dietDayView(day);
  assert.deepEqual(view.checklist.map(row => [row.title, row.importance, row.state, row.label]), [["A", "CORE", "FAILURE", "실패"], ["B", "SECONDARY", "UNRECORDED", "기록 못함"], ["C", "OPTIONAL", "MISSING", "미입력"], ["D", "OPTIONAL", "SUCCESS", "성공"]]);
  assert.equal(view.checklistSummary, "성공 1 / 4 · 실패 1 · 기록 못함 1");
  assert.deepEqual(view.focus[1].entries, [day.focus[0]]);
  assert.equal(view.focus[2].entries.length, 0);
  assert.equal(JSON.stringify(day), before, "derived presentation must not rewrite canonical payload content");
  assert.equal(day.note, "개인 DIET 메모\n[[원문]] ![미디어](media:keep)");
  assert.equal(JSON.stringify(parseDietDay(source)), before);
});
