import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupAccounts,
  donutSegments,
  seoul,
  iso,
  provenance,
  type Account,
} from "./model";
import { tabTarget } from "../globalTabs";
const account = (
  id: string,
  role: Account["role"],
  archived = false,
): Account => ({
  id,
  role,
  provider: "KAKAO",
  displayName: id,
  suffix: null,
  maskedReference: null,
  archived,
  version: 0,
  emoji: null,
  imageData: null,
  fundingAccountId: null,
});
test("structure distinguishes liquid purpose savings, installment, gateway, cash and archived accounts", () => {
  const grouped = groupAccounts([
    account("h", "INCOME_HUB"),
    account("s", "SPENDING"),
    account("f", "FIXED_SPENDING"),
    account("c", "CASH"),
    account("g", "SAVINGS_GATEWAY"),
    ...Array.from({ length: 8 }, (_, i) => account("p" + i, "PURPOSE_SAVINGS")),
    account("i", "PURPOSE_INSTALLMENT"),
    account("d", "SAVINGS"),
    account("old", "SPENDING", true),
  ]);
  assert.equal(grouped.purpose.length, 8);
  assert.equal(grouped.installment.length, 1);
  assert.equal(grouped.spending.length, 3);
  assert.equal(grouped.direct.length, 1);
  assert.equal(grouped.gateways.length, 1);
});
test("donut represents positive net consumption without negative arcs or division by zero", () => {
  assert.deepEqual(donutSegments({ a: 0, b: -100 }), []);
  const s = donutSegments({ a: 300, b: 100, c: -20 });
  assert.deepEqual(
    s.map((x) => x.percent),
    [75, 25],
  );
  assert.equal(s[1].offset, 75);
});
test("financial input and month boundaries always use Korea time", () => {
  assert.equal(seoul("2026-09-30T15:00:00Z"), "2026-10-01T00:00");
  assert.equal(iso("2026-10-01T00:00"), "2026-09-30T15:00:00.000Z");
});
test("balance evidence is labelled without claiming a verified balance for zero origin", () => {
  assert.match(
    provenance({ amount: 0, provenance: "CALCULATED", asOf: null }),
    /미확인/,
  );
  assert.match(
    provenance({ amount: 1, provenance: "NOTIFICATION", asOf: null }),
    /알림/,
  );
});
test("MONEY shell preserves category/month drilldown but never content or credentials", () => {
  const target = tabTarget(
    "/money/transactions?month=2026-09&category=fixture&token=private&memo=private",
  );
  assert.equal(target?.system, "MONEY SYS");
  assert.equal(
    target?.route,
    "/money/transactions?category=fixture&month=2026-09",
  );
  assert.equal(tabTarget("/checklist")?.system, "CHECKLIST SYS");
  assert.equal(tabTarget("/money/unknown"), null);
});
