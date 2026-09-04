// Checklist UI/UX restructure — pure logic tests. Standalone assert-based
// script, same convention as the other worklog *.test.ts files: no test
// runner installed, run directly via
// `node app/worklog/checklistLogic.test.ts` (Node 22.6+).
import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChecklistCategoryDto, ChecklistMatrixColumnDto, ChecklistMatrixResponseDto, ChecklistResult } from "@/lib/api/types";

const frontendRoot = pathToFileURL(path.resolve(import.meta.dirname, "../..") + "/").href;
const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(specifier.slice(2) + ".ts", ${JSON.stringify(frontendRoot)}).href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.[a-zA-Z0-9]+$/.test(specifier)) {
    return nextResolve(specifier + ".ts", context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const {
  groupIntoWeeks,
  sortItemsCanonically,
  groupByPriority,
  textToBullets,
  bulletsToText,
  computeWeekProgressForItem,
  isApplicable,
  filterColumns,
  DEFAULT_CHECKLIST_FILTERS,
  reconstructFullSiblingOrder,
  isDateLabel,
  formatShortDateLabel,
  computeVisibleTickIndices,
  nextChecklistResult,
} = await import("./checklistLogic.ts");

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// --- groupIntoWeeks (§27: Month = weekly groups, Monday-Sunday, partial
// first/last groups allowed — never one flat 30/31-row table) ---

test("groupIntoWeeks: August 2026 (starts Saturday) has a partial first group and a partial last group", () => {
  const from = new Date(2026, 7, 1);
  const to = new Date(2026, 7, 31);
  const groups = groupIntoWeeks(from, to);
  // Aug 1 2026 is a Saturday -> first group is just 8/1-8/2 (bounded to the month).
  assert.equal(groups[0].from.getTime(), from.getTime());
  assert.equal(groups[0].to.getDate(), 2);
  assert.equal(groups.at(-1)!.to.getTime(), to.getTime());
});

test("groupIntoWeeks: every group (except possibly the first/last) spans exactly 7 days", () => {
  const from = new Date(2026, 8, 1); // Sept 2026 starts on a Tuesday
  const to = new Date(2026, 8, 30);
  const groups = groupIntoWeeks(from, to);
  for (let i = 1; i < groups.length - 1; i++) {
    const days = Math.round((groups[i].to.getTime() - groups[i].from.getTime()) / 86400000) + 1;
    assert.equal(days, 7);
  }
});

test("groupIntoWeeks: groups never overlap and cover the whole range with no gaps", () => {
  const from = new Date(2026, 1, 1);
  const to = new Date(2026, 1, 28);
  const groups = groupIntoWeeks(from, to);
  for (let i = 1; i < groups.length; i++) {
    const prevEnd = groups[i - 1].to.getTime();
    const curStart = groups[i].from.getTime();
    assert.equal(curStart - prevEnd, 86400000);
  }
});

// --- sortItemsCanonically (§34/§40: category.position then item.position,
// never achievement rate) ---

test("sortItemsCanonically: orders by category position, then item position within it", () => {
  const categories: ChecklistCategoryDto[] = [
    { id: "cat-y", name: "Y", position: 0 },
    { id: "cat-x", name: "X", position: 1 },
  ];
  const items = [
    { id: "x0", categoryId: "cat-x", position: 0 },
    { id: "y1", categoryId: "cat-y", position: 1 },
    { id: "y0", categoryId: "cat-y", position: 0 },
  ];
  const sorted = sortItemsCanonically(items, categories);
  assert.deepEqual(sorted.map((i: { id: string }) => i.id), ["y0", "y1", "x0"]);
});

test("sortItemsCanonically: uncategorized (null categoryId) sorts last", () => {
  const categories: ChecklistCategoryDto[] = [{ id: "cat-a", name: "A", position: 0 }];
  const items = [
    { id: "none0", categoryId: null, position: 0 },
    { id: "a0", categoryId: "cat-a", position: 0 },
  ];
  const sorted = sortItemsCanonically(items, categories);
  assert.deepEqual(sorted.map((i: { id: string }) => i.id), ["a0", "none0"]);
});

// --- reconstructFullSiblingOrder (P1 fix: the Settings item-management
// modal only shows a filtered subset of a category's siblings, but the
// backend validates a reorder payload against the FULL non-deleted sibling
// set — see ChecklistItemService.reorder) ---

test("reconstructFullSiblingOrder: category with only active items reduces to a plain reorder", () => {
  const full = ["a", "b", "c"];
  const visibleReordered = ["c", "a", "b"];
  assert.deepEqual(reconstructFullSiblingOrder(full, visibleReordered), ["c", "a", "b"]);
});

test("reconstructFullSiblingOrder: mixed active/inactive — moving the first visible active item toward the end preserves inactive slots and includes every id exactly once", () => {
  // canonical: A(active) B(inactive) C(active) D(active) E(inactive)
  const full = ["A", "B", "C", "D", "E"];
  // visible (active-only) order before drag: A, C, D — user drags A to the end.
  const visibleReordered = ["C", "D", "A"];
  const result = reconstructFullSiblingOrder(full, visibleReordered);
  assert.deepEqual(result, ["C", "B", "D", "A", "E"]);
  // every id present exactly once
  assert.deepEqual([...result].sort(), ["A", "B", "C", "D", "E"]);
  // inactive members keep their original relative order
  assert.ok(result.indexOf("B") < result.indexOf("E"));
  // visible active order matches the user's drag result
  assert.deepEqual(
    result.filter((id: string) => visibleReordered.includes(id)),
    ["C", "D", "A"],
  );
});

test("reconstructFullSiblingOrder: moving the last visible active item toward the beginning", () => {
  // canonical: A(active) B(inactive) C(active) D(active) E(inactive)
  const full = ["A", "B", "C", "D", "E"];
  // visible order before drag: A, C, D — user drags D to the front.
  const visibleReordered = ["D", "A", "C"];
  const result = reconstructFullSiblingOrder(full, visibleReordered);
  assert.deepEqual(result, ["D", "B", "A", "C", "E"]);
  assert.deepEqual([...result].sort(), ["A", "B", "C", "D", "E"]);
});

test("reconstructFullSiblingOrder: inactive items interleaved between active items keep their canonical slots untouched", () => {
  // canonical: A(active) B(inactive) C(inactive) D(active)
  const full = ["A", "B", "C", "D"];
  const visibleReordered = ["D", "A"]; // swap the two active items
  const result = reconstructFullSiblingOrder(full, visibleReordered);
  assert.deepEqual(result, ["D", "B", "C", "A"]);
});

// --- groupByPriority (§12: CORE/SECONDARY is the primary Day grouping) ---

test("groupByPriority: partitions into core/secondary preserving relative order", () => {
  const items = [
    { id: "1", priority: "CORE" as const },
    { id: "2", priority: "SECONDARY" as const },
    { id: "3", priority: "CORE" as const },
  ];
  const { core, secondary } = groupByPriority(items);
  assert.deepEqual(core.map((i) => i.id), ["1", "3"]);
  assert.deepEqual(secondary.map((i) => i.id), ["2"]);
});

// --- textToBullets / bulletsToText (§18: newline-joined persisted text) ---

test("textToBullets: null memo yields no bullets", () => {
  assert.deepEqual(textToBullets(null), []);
});

test("textToBullets/bulletsToText round-trip multiple bullets", () => {
  const text = "하체 40분 진행\n스쿼트 중량 증가";
  assert.deepEqual(textToBullets(text), ["하체 40분 진행", "스쿼트 중량 증가"]);
  assert.equal(bulletsToText(textToBullets(text)), text);
});

test("bulletsToText: every bullet blank -> null (never an empty string)", () => {
  assert.equal(bulletsToText(["", "  "]), null);
});

test("bulletsToText: a single meaningful bullet persists as-is", () => {
  assert.equal(bulletsToText(["하체 40분 진행"]), "하체 40분 진행");
});

// --- computeWeekProgressForItem (§15: 이번 주 X/Y, shown only when the item
// was applicable at least once that week) ---

function matrixRow(date: string, applicable: boolean, cells: { itemId: string; entryId: string; result: ChecklistResult }[]) {
  return { date, status: "WORK" as const, applicable, cells };
}

test("computeWeekProgressForItem: counts achieved/applicable across applicable rows only", () => {
  const matrix: ChecklistMatrixResponseDto = {
    columns: [],
    rows: [
      matrixRow("2026-09-01", true, [{ itemId: "item-1", entryId: "e1", result: "PASS" }]),
      matrixRow("2026-09-02", true, [{ itemId: "item-1", entryId: "e2", result: "UNSET" }]),
      matrixRow("2026-09-03", false, [{ itemId: "item-1", entryId: "e3", result: "PASS" }]), // non-applicable day excluded
    ],
  };
  const progress = computeWeekProgressForItem("item-1", matrix);
  assert.deepEqual(progress, { achieved: 1, applicable: 2 });
});

test("computeWeekProgressForItem: null when the item was never applicable that week", () => {
  const matrix: ChecklistMatrixResponseDto = { columns: [], rows: [matrixRow("2026-09-01", true, [])] };
  assert.equal(computeWeekProgressForItem("item-1", matrix), null);
});

test("computeWeekProgressForItem: null when the matrix itself hasn't loaded yet", () => {
  assert.equal(computeWeekProgressForItem("item-1", null), null);
});

// --- isApplicable (§19: applicability comes only from the backend matrix,
// never re-derived from the attendance status label) ---

test("isApplicable: false when the row itself is not applicable, even if a cell exists", () => {
  const row = matrixRow("2026-09-01", false, [{ itemId: "item-1", entryId: "e1", result: "UNSET" }]);
  assert.equal(isApplicable(row, "item-1"), false);
});

test("isApplicable: false when the row is applicable but has no cell for this item (not active yet that day)", () => {
  const row = matrixRow("2026-09-01", true, []);
  assert.equal(isApplicable(row, "item-1"), false);
});

test("isApplicable: true when the row is applicable and a cell exists for this item", () => {
  const row = matrixRow("2026-09-01", true, [{ itemId: "item-1", entryId: "e1", result: "UNSET" }]);
  assert.equal(isApplicable(row, "item-1"), true);
});

// --- nextChecklistResult (PASS/FAIL/UNSET transitions, shared by Day/Week/Month) ---

test("nextChecklistResult: UNSET -> PASS on the PASS action", () => {
  assert.equal(nextChecklistResult("UNSET", "PASS"), "PASS");
});

test("nextChecklistResult: UNSET -> FAIL on the FAIL action", () => {
  assert.equal(nextChecklistResult("UNSET", "FAIL"), "FAIL");
});

test("nextChecklistResult: PASS -> FAIL when the FAIL action is pressed", () => {
  assert.equal(nextChecklistResult("PASS", "FAIL"), "FAIL");
});

test("nextChecklistResult: FAIL -> PASS when the PASS action is pressed", () => {
  assert.equal(nextChecklistResult("FAIL", "PASS"), "PASS");
});

test("nextChecklistResult: pressing the currently-selected action clears it back to UNSET", () => {
  assert.equal(nextChecklistResult("PASS", "PASS"), "UNSET");
  assert.equal(nextChecklistResult("FAIL", "FAIL"), "UNSET");
});

test("isApplicable: false for an undefined row (no WorkRecord that date)", () => {
  assert.equal(isApplicable(undefined, "item-1"), false);
});

// --- filterColumns ---

function column(overrides: Partial<ChecklistMatrixColumnDto>): ChecklistMatrixColumnDto {
  return { itemId: "item-1", categoryId: null, position: 0, name: "Item", emoji: "✅", priority: "SECONDARY", deleted: false, active: true, ...overrides };
}

test("filterColumns: coreOnly excludes SECONDARY columns", () => {
  const columns = [column({ itemId: "a", priority: "CORE" }), column({ itemId: "b", priority: "SECONDARY" })];
  const result = filterColumns(columns, { ...DEFAULT_CHECKLIST_FILTERS, coreOnly: true });
  assert.deepEqual(result.map((c: ChecklistMatrixColumnDto) => c.itemId), ["a"]);
});

test("filterColumns: deleted columns excluded by default, included when includeDeleted is set", () => {
  const columns = [column({ itemId: "a", deleted: true }), column({ itemId: "b", deleted: false })];
  assert.deepEqual(
    filterColumns(columns, DEFAULT_CHECKLIST_FILTERS).map((c: ChecklistMatrixColumnDto) => c.itemId),
    ["b"],
  );
  assert.deepEqual(
    filterColumns(columns, { ...DEFAULT_CHECKLIST_FILTERS, includeDeleted: true }).map((c: ChecklistMatrixColumnDto) => c.itemId),
    ["a", "b"],
  );
});

test("filterColumns: categoryIds restricts to the selected categories, 'none' means uncategorized", () => {
  const columns = [column({ itemId: "a", categoryId: "cat-x" }), column({ itemId: "b", categoryId: null })];
  const result = filterColumns(columns, { ...DEFAULT_CHECKLIST_FILTERS, categoryIds: ["none"] });
  assert.deepEqual(result.map((c: ChecklistMatrixColumnDto) => c.itemId), ["b"]);
});

// --- Analytics X-axis tick density (월 view daily-label overlap fix) ---

test("isDateLabel: true for a plain yyyy-MM-dd calendar date", () => {
  assert.equal(isDateLabel("2026-08-01"), true);
});

test("isDateLabel: false for a yyyy-MM YearMonth label (MONTHLY resolution)", () => {
  assert.equal(isDateLabel("2026-08"), false);
});

test("formatShortDateLabel: strips the year and leading zeros -> M/D", () => {
  assert.equal(formatShortDateLabel("2026-08-01"), "8/1");
  assert.equal(formatShortDateLabel("2026-08-31"), "8/31");
  assert.equal(formatShortDateLabel("2026-01-05"), "1/5");
});

test("computeVisibleTickIndices: n <= maxTicks shows every index (a 주 view's 7 points stay fully labeled)", () => {
  assert.deepEqual([...computeVisibleTickIndices(7, 8)].sort((a: number, b: number) => a - b), [0, 1, 2, 3, 4, 5, 6]);
});

test("computeVisibleTickIndices: a 31-day 월 view thins down to within the 6-8 target range", () => {
  const indices = computeVisibleTickIndices(31, 8);
  assert.ok(indices.size >= 6 && indices.size <= 8, `expected 6-8 ticks, got ${indices.size}`);
});

test("computeVisibleTickIndices: always includes the first and last index, even when the step doesn't land exactly on the last one", () => {
  for (const n of [28, 29, 30, 31]) {
    const indices = computeVisibleTickIndices(n, 8);
    assert.ok(indices.has(0), `n=${n} missing first index`);
    assert.ok(indices.has(n - 1), `n=${n} missing last index`);
  }
});

test("computeVisibleTickIndices: never exceeds maxTicks regardless of how large n is", () => {
  for (const n of [31, 90, 365]) {
    const indices = computeVisibleTickIndices(n, 8);
    assert.ok(indices.size <= 8, `n=${n} produced ${indices.size} ticks`);
  }
});

test("computeVisibleTickIndices: n === 0 yields no ticks", () => {
  assert.equal(computeVisibleTickIndices(0, 8).size, 0);
});
