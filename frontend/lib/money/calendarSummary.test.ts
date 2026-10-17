import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarChartGroups, calendarChartSectors, calendarSummaryGroups, calendarSummaryShare, type SummaryGroup } from "./calendarSummary";
import type { Category } from "./model";

const categories: Category[] = [
  { id: "a", name: "급여", color: "#123456", archived: false, version: 1, kind: "INCOME" },
  { id: "a1", name: "기본급", parentId: "a", color: "#654321", archived: false, version: 1, kind: "INCOME" },
  { id: "a2", name: "성과급", parentId: "a", color: "", archived: true, version: 1, kind: "INCOME" },
  { id: "b", name: "기타 수입", color: "", archived: false, version: 1, kind: "INCOME" },
];
const row = (categoryId: string | null, counterpartyText: string | null, amount: number, count = 1) => ({ categoryId, counterpartyText, amount, count });

test("income sources and category rankings independently reconcile from the same buckets", () => {
  const result = calendarSummaryGroups([row("a1", "회사 A", 100, 2), row("a2", "회사 B", 40), row("a", "회사 A", 10), row("b", "회사 A", 50), row(null, null, 20)], categories, true);
  assert.equal(result.total, 220);
  assert.equal(result.count, 6);
  assert.deepEqual(result.ranking.map(r => [r.id, r.amount, r.count]), [["a", 150, 4], ["b", 50, 1], ["uncategorized", 20, 1]]);
  assert.deepEqual(result.sources.map(r => [r.label, r.amount, r.count]), [["회사 A", 160, 4], ["회사 B", 40, 1], ["수입원 미상", 20, 1]]);
  assert.equal(result.ranking[0].color, "#123456");
  assert.deepEqual(result.ranking[0].children.map(c => [c.label, c.amount]), [["기본급", 100], ["성과급", 40], ["소분류 없음", 10]]);
  assert.equal(result.ranking[0].children[0].sources[0].label, "회사 A");
  assert.equal(result.ranking.reduce((sum, r) => sum + r.amount, 0), result.sources.reduce((sum, r) => sum + r.amount, 0));
});

test("expense hierarchy retains refunds, parent-direct amounts, unclassified and unknown historical IDs", () => {
  const result = calendarSummaryGroups([row("a1", "상점 A", 120), row("a1", "상점 A", -20), row("a", null, 10), row("b", null, -40), row(null, null, 5), row("removed", null, 2)], categories, false);
  assert.equal(result.total, 77);
  assert.deepEqual(result.ranking.map(r => [r.id, r.amount]), [["a", 110], ["uncategorized", 5], ["removed", 2], ["b", -40]]);
  assert.equal(result.ranking[0].count, 3);
  assert.equal(result.ranking.find(r => r.id === "removed")?.label, "이전 분류");
  assert.equal(calendarChartSectors(result.ranking, 77).available, false);
  assert.equal(calendarSummaryShare(-40, 77), "-51.9%");
});

test("equal amounts sort deterministically and colors remain stable after filtering and ordering", () => {
  const items = [row("b", "B", 10), row("a", "A", 10)];
  const first = calendarSummaryGroups(items, categories, true), second = calendarSummaryGroups([...items].reverse(), categories, true);
  assert.deepEqual(first, second);
  assert.deepEqual(first.ranking.map(r => r.id), ["a", "b"]);
  assert.equal(first.ranking[1].color, calendarSummaryGroups([items[0]], categories, true).ranking[0].color);
  assert.equal(first.sources.find(r => r.label === "B")?.color, calendarSummaryGroups([items[0]], categories, true).sources[0].color);
});

test("only chart tail is combined; all categories and transactions remain in the full ranking", () => {
  const items = Array.from({ length: 12 }, (_, i) => row(`cat-${i}`, `source-${i}`, 120 - i * 5, i + 1));
  const { ranking, total, count } = calendarSummaryGroups(items, categories, false), groups = calendarChartGroups(ranking);
  assert.equal(ranking.length, 12);
  assert.equal(groups.length, 8);
  assert.equal(groups[7].label, "기타");
  assert.equal(groups[7].members?.length, 5);
  assert.equal(groups.reduce((sum, r) => sum + r.amount, 0), total);
  assert.equal(groups.reduce((sum, r) => sum + r.count, 0), count);
  const sectors = calendarChartSectors(groups, total);
  assert.equal(sectors.available, true);
  assert.ok(Math.abs(sectors.sectors.reduce((sum, r) => sum + r.share, 0) - 1) < 1e-10);
  assert.equal(calendarSummaryShare(groups[0].amount, total), "10.8%");
});

test("negative tail cannot disappear into a positive 기타 segment", () => {
  const groups: SummaryGroup[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), label: String(i), amount: i === 9 ? -5 : 10, count: 1, color: "#123456" }));
  const chart = calendarChartGroups(groups);
  assert.equal(chart.length, 10);
  assert.equal(calendarChartSectors(chart, 85).available, false);
});

test("net refunds within a positive category use the existing net total and preserve transaction counts", () => {
  const result = calendarSummaryGroups([row("a1", "상점", 100), row("a1", "상점", -20)], categories, false);
  const chart = calendarChartSectors(result.ranking, 80);
  assert.equal(result.ranking[0].amount, 80);
  assert.equal(result.ranking[0].count, 2);
  assert.equal(chart.available, true);
  assert.equal(chart.sectors[0].share, 1);
});

test("empty, zero, negative and mismatched totals never produce misleading or nonfinite sectors", () => {
  const groups = calendarSummaryGroups([row("a", null, 100), row("b", null, -100)], categories, false).ranking;
  for (const total of [null, 0, -10, 30]) {
    const chart = calendarChartSectors(groups, total);
    assert.equal(chart.available, false);
    assert.ok(chart.sectors.every(r => r.share === 0 && Number.isFinite(r.start)));
  }
  assert.deepEqual(calendarSummaryGroups([], categories, false), { ranking: [], sources: [], total: 0, count: 0 });
  assert.equal(calendarChartSectors([], 0).available, false);
  assert.equal(calendarChartSectors([{ ...groups[0], amount: 100 }], 99).available, false);
  assert.equal(calendarSummaryShare(0, 0), "—");
  assert.equal(calendarSummaryShare(10, -10), "—");
});
