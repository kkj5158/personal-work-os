import { test } from "node:test";
import assert from "node:assert/strict";
import { weightAnalytics } from "./weightAnalytics";
import type { DietData, WeightGoal } from "./types";

const goal = (id: string, kind: WeightGoal["kind"], targetDate: string, targetWeight: number): WeightGoal => ({ id, kind, targetDate, targetWeight, core: "흐름 유지", memoItems: [] });
const data: DietData = { days: [{ date: "2026-09-01", morningWeight: 100, targetWeight: 99 }, { date: "2026-09-07", morningWeight: 98, targetWeight: 97 }], items: [], checks: [], challenges: [], milestones: [], goals: [goal("w1", "WEEKLY", "2026-09-01", 96), goal("w2", "WEEKLY", "2026-09-07", 90), goal("m", "MONTHLY", "2026-09-07", 88), goal("s", "SHORT_TERM", "2026-09-07", 97)], settings: {} };

test("daily targets remain separate from weekly/monthly goals on identical dates", () => {
  const chart = weightAnalytics(data, "2026-09-01", "2026-09-07");
  assert.equal(chart.series.find(s => s.name === "일 목표 체중")!.values[6], 97);
  assert.equal(chart.series.find(s => s.name === "주 목표 추이")!.values[6], 90);
  assert.equal(chart.series.find(s => s.name === "월 목표 추이")!.values[6], 88);
});

test("short ranges clip crossing trend segments and moving averages read earlier days", () => {
  const chart = weightAnalytics(data, "2026-09-03", "2026-09-05");
  assert.deepEqual(chart.series.find(s => s.name === "주 목표 추이")!.values, [94, null, 92]);
  assert.deepEqual(chart.series.find(s => s.name === "7일 이동평균")!.values, [100, 100, 100]);
  assert.equal(chart.lines.filter(l => l.goalKind).length, 3);
});

test("goals without recorded weights retain reference lines outside their target dates", () => {
  const chart = weightAnalytics({ ...data, days: [] }, "2026-08-01", "2026-08-07");
  const short = chart.lines.find(l => l.goalKind === "SHORT_TERM")!;
  assert.equal(short.name, "단기 목표 · 97kg · 흐름 유지");
  assert.equal(short.color, "#2875dc");
  assert.equal(short.visible, true);
  assert.equal(chart.dates.length, 7);
});
