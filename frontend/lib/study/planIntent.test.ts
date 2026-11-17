import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readPlanIntent,
  savePlanIntent,
  planIntentKey,
  type PlanIntent,
} from "./planIntent";
const intent: PlanIntent = {
  date: "2026-11-23",
  days: 7,
  materialIds: ["b", "a"],
  operationId: "12345678-1234-1234-1234-123456789abc",
};
test("operation identity survives reload, normalizes source order and stays owner scoped", () => {
  const values = new Map<string, string>(),
    storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
  savePlanIntent(storage, "one", intent);
  const read = readPlanIntent(storage, "one")!;
  assert.equal(read.operationId, intent.operationId);
  assert.deepEqual(read.materialIds, ["a", "b"]);
  assert.equal(read.date, intent.date);
  assert.equal(readPlanIntent(storage, "other"), undefined);
  assert.ok(values.has(planIntentKey("one")));
  savePlanIntent(storage, "one", read);
  assert.equal(readPlanIntent(storage, "one")!.operationId, intent.operationId);
});
test("malformed intent and failed persistence fail explicitly", () => {
  assert.throws(() => readPlanIntent({ getItem: () => "{" }, "one"));
  assert.throws(() =>
    readPlanIntent(
      { getItem: () => JSON.stringify({ ...intent, operationId: "bad" }) },
      "one",
    ),
  );
  assert.throws(
    () =>
      savePlanIntent(
        {
          setItem: () => {
            throw Error("storage unavailable");
          },
        },
        "one",
        intent,
      ),
    /storage unavailable/,
  );
});
