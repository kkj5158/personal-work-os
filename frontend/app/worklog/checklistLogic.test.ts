// Checklist UI/UX restructure — pure logic tests. Standalone assert-based
// script, same convention as the other worklog *.test.ts files: no test
// runner installed, run directly via
// `node app/worklog/checklistLogic.test.ts` (Node 22.6+).
import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChecklistCategoryDto, ChecklistMatrixColumnDto, ChecklistMatrixResponseDto } from "@/lib/api/types";

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

function matrixRow(date: string, applicable: boolean, cells: { itemId: string; entryId: string; achieved: boolean }[]) {
  return { date, status: "WORK" as const, applicable, cells };
}

test("computeWeekProgressForItem: counts achieved/applicable across applicable rows only", () => {
  const matrix: ChecklistMatrixResponseDto = {
    columns: [],
    rows: [
      matrixRow("2026-09-01", true, [{ itemId: "item-1", entryId: "e1", achieved: true }]),
      matrixRow("2026-09-02", true, [{ itemId: "item-1", entryId: "e2", achieved: false }]),
      matrixRow("2026-09-03", false, [{ itemId: "item-1", entryId: "e3", achieved: true }]), // non-applicable day excluded
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
  const row = matrixRow("2026-09-01", false, [{ itemId: "item-1", entryId: "e1", achieved: false }]);
  assert.equal(isApplicable(row, "item-1"), false);
});

test("isApplicable: false when the row is applicable but has no cell for this item (not active yet that day)", () => {
  const row = matrixRow("2026-09-01", true, []);
  assert.equal(isApplicable(row, "item-1"), false);
});

test("isApplicable: true when the row is applicable and a cell exists for this item", () => {
  const row = matrixRow("2026-09-01", true, [{ itemId: "item-1", entryId: "e1", achieved: false }]);
  assert.equal(isApplicable(row, "item-1"), true);
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
