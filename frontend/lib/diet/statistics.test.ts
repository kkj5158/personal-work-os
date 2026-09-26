import { test } from "node:test";
import assert from "node:assert/strict";
import { STATS_AS_OF as AS_OF, STATS_FIXTURE as data } from "./statistics.fixture";
import { checklistBuckets, checklistItemRows, metabolicStatistics, statisticsRange, weightSummary } from "./statistics";
import { weightAnalytics } from "./weightAnalytics";

// Expected values are derived by hand from the Web Progress semantics; the same
// vectors are asserted in diet-sys-mobile (src/diet/stats/statistics.test.ts).
const close = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const range = (p: Parameters<typeof statisticsRange>[1], o = {}) => { const r = statisticsRange(data, p, o, AS_OF); return [r.start, r.end]; };

test("period presets resolve exactly like the Web Statistics toolbar", () => {
  assert.deepEqual(range("7d"), ["2026-09-20", "2026-09-26"]);
  assert.deepEqual(range("4w"), ["2026-08-30", "2026-09-26"]);
  assert.deepEqual(range("month"), ["2026-09-01", "2026-09-26"]);
  assert.deepEqual(range("challenge", { challengeId: "c1" }), ["2026-09-10", "2026-10-10"]);
  assert.deepEqual(range("challenge"), ["2026-09-26", "2026-09-26"]);
  assert.deepEqual(range("all"), ["2026-08-15", "2026-12-31"]);
  assert.deepEqual(range("custom", { customStart: "2026-09-05", customEnd: "2026-09-12" }), ["2026-09-05", "2026-09-12"]);
  assert.equal(statisticsRange(data, "custom", { customStart: "2026-09-12", customEnd: "2026-09-05" }, AS_OF).dates.length, 0);
});

test("weight summary: latest ≤ range end, first→last change, minimum, distance to FINAL", () => {
  assert.deepEqual(weightSummary(data, "2026-08-30", "2026-09-26", AS_OF), { latest: 98, difference: -2, minimum: 97.5, toFinal: 8 });
  assert.deepEqual(weightSummary(data, "2026-09-10", "2026-10-10", AS_OF), { latest: 98, difference: -1, minimum: 97.5, toFinal: 8 });
  assert.deepEqual(weightSummary(data, "2026-09-20", "2026-09-26", AS_OF), { latest: 98, difference: 0.5, minimum: 97.5, toFinal: 8 });
  assert.deepEqual(weightSummary(data, "2026-09-11", "2026-09-19", AS_OF), { latest: 99, difference: null, minimum: null, toFinal: 9 });
});

test("metabolic statistics keep morning/bedtime and blood/breath separate", () => {
  const glucose = metabolicStatistics(data, "glucose", "2026-09-01", "2026-09-26");
  assert.equal(glucose.unit, "mg/dL"); close(glucose.overall, 95); close(glucose.morning, 87.5); close(glucose.bedtime, 110); assert.equal(glucose.count, 3);
  assert.equal(glucose.morningSeries[0], 90); assert.equal(glucose.bedtimeSeries[0], 110); assert.equal(glucose.dates.length, 26);
  assert.equal(glucose.lines.length, 1); assert.equal(glucose.bands.length, 1);
  const blood = metabolicStatistics(data, "blood", "2026-09-01", "2026-09-26");
  close(blood.morning, 0.8); assert.equal(blood.bedtime, null); assert.equal(blood.count, 1);
  const breath = metabolicStatistics(data, "breath", "2026-09-01", "2026-09-26");
  assert.equal(breath.morning, null); close(breath.bedtime, 5); assert.equal(breath.count, 1);
});

test("checklist rows: sort order, range/week/month stats, 기록 못함 excluded from the rate", () => {
  const rows = checklistItemRows(data, "ALL", "2026-08-30", "2026-09-26", true, AS_OF);
  assert.deepEqual(rows.map(r => r.item.id), ["b", "a"]);
  const a = rows[1];
  assert.deepEqual([a.range.success, a.range.failure, a.range.unrecorded, a.range.eligible, a.range.missing], [2, 1, 1, 26, 22]);
  close(a.range.rate, 8); close(a.week.rate, 40); assert.equal(a.month.success, 2);
  close(rows[0].range.rate, 100 / 7);
  assert.deepEqual(checklistItemRows(data, "CORE", "2026-08-30", "2026-09-26", true, AS_OF).map(r => r.item.id), ["a"]);
  close(checklistItemRows(data, "CORE", "2026-08-30", "2026-09-26", false, AS_OF)[0].range.rate, 200 / 3);
});

test("checklist buckets clip to the range and expose the item reference", () => {
  assert.deepEqual(checklistBuckets(data, "a", "2026-08-30", "2026-09-26", "week", true, AS_OF), { buckets: ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"], values: [0, 0, 0, 0, 2], reference: 5 });
  assert.deepEqual(checklistBuckets(data, "a", "2026-08-30", "2026-09-26", "month", true, AS_OF), { buckets: ["2026-08-01", "2026-09-01"], values: [0, 2], reference: 20 });
});

test("weight chart series: actual, 7-day mean, daily target, goal lines, trajectories, milestones", () => {
  const chart = weightAnalytics(data, "2026-09-20", "2026-09-26", AS_OF);
  const series = (name: string) => chart.series.find(s => s.name.startsWith(name))!.values;
  assert.deepEqual(series("실제 체중"), [97.5, null, null, null, 98, null, null]);
  assert.deepEqual(series("7일 이동평균"), [97.5, 97.5, 97.5, 97.5, 97.75, 97.75, 97.75]);
  const target = series("일 목표 체중");
  close(target[0], 98 - 2 * 10 / 15); assert.deepEqual(target.slice(1), [null, null, null, null, 96, null]);
  close(series("최종 목표 계획")[0], 100 - 10 * 19 / 121);
  assert.equal(chart.series.some(s => s.name.startsWith("주 목표 계획")), false);
  assert.deepEqual(chart.lines.map(l => [l.id, l.value]), [["goal-WEEKLY", 97], ["goal-FINAL", 90], ["l1", 95]]);
  assert.deepEqual(chart.markers.map(m => [m.date, m.value]), [["2026-09-30", 96]]);
  const hidden = weightAnalytics({ ...data, settings: { ...data.settings, hiddenGoalLines: ["FINAL"] } }, "2026-09-20", "2026-09-26", AS_OF);
  assert.equal(hidden.lines.find(l => l.id === "goal-FINAL")!.visible, false);
  assert.equal(hidden.series.some(s => s.name.startsWith("최종 목표 계획")), false);
});
