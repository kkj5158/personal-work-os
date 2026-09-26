import { test } from "node:test";
import assert from "node:assert/strict";
import { presetPeriod, shiftPeriod } from "./period";
import { tabTarget } from "../globalTabs";
test("period presets use calendar weeks/months/quarters and rolling six/twelve months", () => {
  assert.deepEqual(presetPeriod("week", "2026-09-26"), {
    preset: "week",
    from: "2026-09-21",
    to: "2026-09-27",
  });
  assert.deepEqual(presetPeriod("month", "2024-02-29"), {
    preset: "month",
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(presetPeriod("quarter", "2026-09-26"), {
    preset: "quarter",
    from: "2026-07-01",
    to: "2026-09-30",
  });
  assert.deepEqual(presetPeriod("half", "2026-09-26"), {
    preset: "half",
    from: "2026-03-27",
    to: "2026-09-26",
  });
  assert.deepEqual(presetPeriod("year", "2026-09-26"), {
    preset: "year",
    from: "2025-09-27",
    to: "2026-09-26",
  });
});
test("arrows shift each selected unit and preserve inclusive custom spans", () => {
  assert.deepEqual(shiftPeriod(presetPeriod("quarter", "2026-09-26"), 1), {
    preset: "quarter",
    from: "2026-10-01",
    to: "2026-12-31",
  });
  assert.deepEqual(shiftPeriod(presetPeriod("month", "2024-03-31"), -1), {
    preset: "month",
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(
    shiftPeriod({ preset: "custom", from: "2026-09-20", to: "2026-09-26" }, -1),
    { preset: "custom", from: "2026-09-13", to: "2026-09-19" },
  );
});
test("all seven MONEY pages are registered in shell navigation", () => {
  for (const route of [
    "",
    "transactions",
    "bookkeeping",
    "accounts",
    "loans",
    "review",
    "settings",
  ])
    assert.equal(
      tabTarget("/money" + (route ? "/" + route : ""))?.system,
      "MONEY SYS",
    );
  assert.equal(tabTarget("/money/bookkeeping")?.title, "MONEY SYS · 가계부");
  assert.equal(tabTarget("/money/unknown"), null);
});
