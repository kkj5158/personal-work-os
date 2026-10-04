import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewCapabilities, reviewDecision } from "./reviewCapabilities";
import type { AiItem } from "./ai";
import type { Category } from "./model";
import { amountPresets, validateAmountRange } from "./bookkeepingRange";

const categories = [{ id: "root", name: "식비", kind: "EXPENSE", parentId: null, archived: false }, { id: "old", name: "보관", kind: "EXPENSE", parentId: null, archived: true }, { id: "income", name: "수입", kind: "INCOME", parentId: null, archived: false }] as Category[];
const posted = { id: "t", kind: "TRANSACTION", state: "PENDING", type: "EXPENSE", reason: "CATEGORY_UNCONFIRMED", reviewType: "CLASSIFICATION", version: 2, transactionVersion: 2, overrideVersion: 3, projectionVersion: 4, proposal: { categoryId: "root", basis: "EXPLICIT_RULE", reason: "규칙" } } as AiItem;
test("only posted unconfirmed classification has direct one-click confirmation", () => {
  assert.equal(reviewCapabilities(posted, categories).validProposal, true);
  const raw = reviewCapabilities({ ...posted, kind: "RAW" }, categories);
  assert.equal(raw.classify, false); assert.equal(raw.validProposal, false); assert.equal(raw.financialEditor, true);
  for (const reason of ["REFUND_LINK_REQUIRED", "LOAN_SPLIT_REQUIRED", "UNKNOWN"]) assert.equal(reviewCapabilities({ ...posted, reason }, categories).classify, false);
  assert.equal(reviewCapabilities({ ...posted, excluded: true }, categories).classify, false);
  assert.equal(reviewCapabilities({ ...posted, state: "COMPLETED" }, categories).classify, false);
  assert.equal(reviewCapabilities({ ...posted, version: NaN }, categories).classify, false);
});
test("proposal absence and invalid proposals still allow a posted category picker", () => {
  for (const categoryId of [null, "missing", "old", "income", "group:virtual"]) {
    const cap = reviewCapabilities({ ...posted, proposal: { ...posted.proposal, categoryId } }, categories);
    assert.equal(cap.validProposal, false); assert.equal(cap.classify, true);
  }
});
test("unknown sources cannot mutate, and linked transfer events never expose ordinary undo", () => {
  const unknown = reviewCapabilities({ ...posted, kind: "UNKNOWN" } as unknown as AiItem, categories);
  assert.equal(unknown.known, false); assert.equal(unknown.defer, false); assert.equal(unknown.nonTransaction, false);
  assert.equal(reviewCapabilities({ ...posted, reviewType: "TRANSFER", state: "COMPLETED", canUndo: true, eventId: "e" }, categories).undo, false);
  assert.equal(reviewCapabilities({ ...posted, state: "COMPLETED", canUndo: true, eventId: "e" }, categories).undo, true);
});
test("decision requests bind all versions and sparse classification only", () => {
  const request = reviewDecision(posted, "CONFIRM", "root");
  assert.deepEqual(request.overrides, { categoryId: "root" });
  assert.equal(request.id, "t"); assert.equal(request.transactionVersion, 2); assert.equal(request.overrideVersion, 3); assert.equal(request.projectionVersion, 4);
  assert.deepEqual(reviewDecision(posted, "DEFER").overrides, {});
});
test("amount presets cover exact integer boundaries without overlap", () => {
  const matches = (amount: number) => amountPresets.slice(1).filter(r => amount >= Number(r.min) && (!r.max || amount <= Number(r.max))).map(r => r.id);
  assert.deepEqual(matches(0), ["small"]); assert.deepEqual(matches(9999), ["small"]); assert.deepEqual(matches(10000), ["medium"]); assert.deepEqual(matches(49999), ["medium"]); assert.deepEqual(matches(50000), ["large"]);
  assert.equal(validateAmountRange("0", "0"), ""); assert.equal(validateAmountRange("", "10000"), "");
  for (const [min, max] of [["10001", "10000"], ["-1", ""], ["1.5", ""], ["1e4", ""], ["9007199254740992", ""]]) assert.notEqual(validateAmountRange(min, max), "");
});
