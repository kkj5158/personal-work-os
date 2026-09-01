// Attendance follow-up refinement §17 — the canonical ActivityCategory
// selection policy (buildRootOptions/buildChildOptions/resolveCategoryLabel)
// that the Planned Work Block editor now reuses, exercised against the
// exact real-DEV-data scenario reported in the task: 개발/업무 roots,
// Project Orbit/아웃라이어_업무/아웃라이어_준비/과거 기록 children with
// 과거 기록 inactive. Same standalone-script convention as the other
// worklog *.test.ts files.
import assert from "node:assert/strict";
import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ActivityCategory } from "@/lib/api/types";

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

const { buildRootOptions, buildChildOptions, getDefaultChildCategoryId, resolveCategoryLabel } = await import("./activityCategory.ts");

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

function cat(overrides: Partial<ActivityCategory> & Pick<ActivityCategory, "id" | "name">): ActivityCategory {
  return { parentId: null, sortOrder: 0, isActive: true, isDefault: false, ...overrides };
}

// Exact real-DEV scenario from the task report.
const DEV_ROOT = "dev-root";
const WORK_ROOT = "work-root";
const CATEGORIES: ActivityCategory[] = [
  cat({ id: DEV_ROOT, name: "개발", sortOrder: 0 }),
  cat({ id: WORK_ROOT, name: "업무", sortOrder: 1 }),
  cat({ id: "orbit", name: "Project Orbit", parentId: DEV_ROOT, sortOrder: 0, isDefault: true }),
  cat({ id: "outlier-work", name: "아웃라이어_업무", parentId: WORK_ROOT, sortOrder: 0 }),
  cat({ id: "outlier-prep", name: "아웃라이어_준비", parentId: WORK_ROOT, sortOrder: 1, isDefault: true }),
  cat({ id: "past-record", name: "과거 기록", parentId: WORK_ROOT, sortOrder: 2, isActive: false }),
];

test("root options are sorted by sortOrder: 개발 before 업무", () => {
  const roots = buildRootOptions(CATEGORIES);
  assert.deepEqual(roots.map((r) => r.label), ["개발", "업무"]);
});

test("업무's active children are offered in sortOrder, excluding the inactive 과거 기록", () => {
  const children = buildChildOptions(CATEGORIES, WORK_ROOT);
  assert.deepEqual(children.map((c) => c.label), ["아웃라이어_업무", "아웃라이어_준비"]);
});

test("과거 기록 never appears in any new-selection list", () => {
  const children = buildChildOptions(CATEGORIES, WORK_ROOT);
  assert.equal(children.some((c) => c.id === "past-record"), false);
});

test("an inactive root would exclude all of its children from ever being reachable as new selections", () => {
  const inactiveRoot: ActivityCategory[] = [
    cat({ id: "r1", name: "비활성 대분류", isActive: false }),
    cat({ id: "c1", name: "자식", parentId: "r1", isActive: true }),
  ];
  // The child itself is technically "active", but since buildRootOptions
  // excludes its inactive parent, the UI has no path to ever select it new —
  // the two-step parent-then-child selector structurally enforces this.
  assert.equal(buildRootOptions(inactiveRoot).length, 0);
});

test("getDefaultChildCategoryId resolves 업무's default child (아웃라이어_준비)", () => {
  assert.equal(getDefaultChildCategoryId(WORK_ROOT, CATEGORIES), "outlier-prep");
});

test("resolveCategoryLabel shows an active child as 'Parent > Child'", () => {
  assert.equal(resolveCategoryLabel("outlier-work", CATEGORIES), "업무 > 아웃라이어_업무");
});

test("resolveCategoryLabel still resolves 과거 기록 by name for a historical reference, marked inactive", () => {
  assert.equal(resolveCategoryLabel("past-record", CATEGORIES), "과거 기록 (비활성)");
});

test("resolveCategoryLabel shows an active root with no parent as its bare name", () => {
  assert.equal(resolveCategoryLabel(DEV_ROOT, CATEGORIES), "개발");
});

test("resolveCategoryLabel never throws on an unknown/deleted id", () => {
  assert.equal(resolveCategoryLabel("does-not-exist", CATEGORIES), "알 수 없는 카테고리");
});
