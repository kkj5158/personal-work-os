import test from "node:test";
import assert from "node:assert/strict";
import {
  toggleSelection,
  rangeSelection,
  draftRule,
  type ReviewItem,
} from "./meaning";
import { affectedBy, MoneyCache } from "./cache";
test("filters include future candidates only in all-selected state; isolation remains explicit", () => {
  assert.deepEqual(toggleSelection(null, ["a", "b", "c"], "b"), ["a", "c"]);
  assert.deepEqual(toggleSelection(["a"], ["a", "b", "c"], "b"), ["a", "b"]);
  assert.deepEqual(toggleSelection([], ["a"], "a"), ["a"]);
});
test("shift range selection preserves disjoint explicit checks in either direction", () => {
  assert.deepEqual(rangeSelection(["z"], ["a", "b", "c", "d"], "d", "b"), [
    "z",
    "b",
    "c",
    "d",
  ]);
  assert.deepEqual(rangeSelection(["b"], ["a", "b"], null, "a"), ["b", "a"]);
});
test("review rule draft is an unsaved deterministic proposal with no financial outputs", () => {
  const rule = draftRule({
    title: "Lunch",
    merchant: "Cafe",
    categoryId: "food",
    type: "EXPENSE",
    memo: null,
    amount: 12345,
  } as ReviewItem);
  assert.equal(rule.id, undefined);
  assert.equal(rule.origin, "MANUAL");
  assert.equal("amount" in rule, false);
  assert.deepEqual(rule.conditions, [
    { field: "type", operator: "EXACT", value: "EXPENSE" },
    { field: "merchant", operator: "EXACT", value: "Cafe" },
  ]);
});
test("tracking and historical rule application invalidate meaning without flushing financial views", () => {
  for (const mutation of ["tracking", "ruleHistory"] as const) {
    assert.equal(affectedBy(mutation, "/bookkeeping?kind=INCOME"), true);
    for (const path of [
      "/overview",
      "/flow",
      "/accounts",
      "/transactions",
      "/loans",
    ])
      assert.equal(affectedBy(mutation, path), false, path);
  }
  assert.equal(affectedBy("ruleHistory", "/review/queue"), true);
  assert.equal(affectedBy("classificationRule", "/bookkeeping"), false);
  assert.equal(affectedBy("category", "/classification-rules"), true);
});
test("new references share owner/session caching and bounded expiry", async () => {
  let calls = 0,
    now = 0;
  const cache = new MoneyCache(
    async () => ++calls,
    () => now,
  );
  cache.setScope("A");
  await cache.load("/tracking");
  await cache.load("/tracking");
  assert.equal(calls, 1);
  now = 120000;
  await cache.load("/tracking");
  assert.equal(calls, 2);
  cache.setScope("B");
  await cache.load("/tracking");
  assert.equal(calls, 3);
});
