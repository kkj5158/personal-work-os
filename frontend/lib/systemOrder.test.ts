import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_IDS, moveSystem, normalizeSystemOrder } from "./systemOrder";
test("custom order normalizes duplicates and retired systems, appending new systems", () => {
  assert.deepEqual(normalizeSystemOrder(["notes", "work", "notes", "retired"], ["work", "notes", "new"]), ["notes", "work", "new"]);
  assert.deepEqual(normalizeSystemOrder([]), SYSTEM_IDS);
  assert.deepEqual(moveSystem(["work", "notes", "diet"], "diet", "work"), ["diet", "work", "notes"]);
});
