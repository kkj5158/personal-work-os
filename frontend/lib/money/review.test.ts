import test from "node:test";
import assert from "node:assert/strict";
import { reviewStages, resolveAccountHint, reviewReasons, type ReviewItem } from "./meaning";

const base: ReviewItem = {
  id: "r1", kind: "RAW", reason: "UNMATCHED_OR_EXTERNAL_UNPROVEN", lane: "DECISION", state: "PENDING",
  occurredAt: "2026-09-24T08:10:00Z", title: "출금 10,000원", merchant: "com.kakaobank.channel", amount: 10000,
  accountId: null, categoryId: null, memo: null, type: null, version: 3, overrideVersion: 0, projectionVersion: 0,
  candidate: { provider: "KAKAO", amount: 10000, direction: "OUT", occurredAt: "2026-09-24T08:10:00Z", sourceAccountHint: "입출금통장(8557)" },
  transferPartnerId: "r2", transferCandidates: 1,
};
test("internal codes are translated into plain pipeline stages", () => {
  const stages = reviewStages(base);
  assert.deepEqual(stages.map((s) => s.label), ["거래 알림 판별", "금액 추출", "입출금 방향", "계좌 매칭", "이체 매칭", "최종 검토 사유"]);
  assert.equal(stages[4].status, "warn");
  assert.match(stages[4].detail, /반대 방향 알림 1건/);
  assert.equal(stages[5].detail, reviewReasons.UNMATCHED_OR_EXTERNAL_UNPROVEN);
  const ambiguous = reviewStages({ ...base, reason: "AMBIGUOUS_TRANSFER_PAIR", transferPartnerId: null, transferCandidates: 2 });
  assert.equal(ambiguous[4].status, "fail");
});
test("format-lane items explain that no financial fact could be read", () => {
  const stages = reviewStages({ ...base, lane: "FORMAT", reason: "UNRECOGNIZED_SHAPE", candidate: null, transferPartnerId: null, noiseSuspected: true });
  assert.equal(stages[0].status, "fail");
  assert.match(stages[0].detail, /거래가 아닌/);
  assert.equal(stages[3].status, "na");
});
test("hint resolution requires provider and exact suffix or masked reference, like the server", () => {
  const accounts = [
    { id: "k", provider: "KAKAO", displayName: "입출금통장", suffix: "8557", maskedReference: null, archived: false },
    { id: "i", provider: "IBK", displayName: "생활비", suffix: null, maskedReference: "975-******-01-014", archived: false },
    { id: "x", provider: "SHINHAN", displayName: "입출금통장", suffix: "8557", maskedReference: null, archived: false },
    { id: "old", provider: "WOORI", displayName: "보관", suffix: "1111", maskedReference: null, archived: true },
  ];
  assert.equal(resolveAccountHint(accounts, "KAKAO", "입출금통장(8557)"), "k");
  assert.equal(resolveAccountHint(accounts, "IBK", "975-******-01-014"), "i");
  assert.equal(resolveAccountHint(accounts, "IBK", "975-******-01-99"), null);
  assert.equal(resolveAccountHint(accounts, "WOORI", "보관(1111)"), null, "archived accounts are not auto-selected");
  assert.equal(resolveAccountHint(accounts, undefined, "입출금통장(8557)"), null, "no cross-provider guess");
});
test("reconciliation follows ledger mutations but not bookkeeping meaning edits", async () => {
  const { affectedBy } = await import("./cache");
  for (const kind of ["transaction", "account", "review", "reviewItem"] as const) assert.equal(affectedBy(kind, "/reconciliation"), true, kind);
  for (const kind of ["book", "reviewMeaning", "category", "tracking"] as const) assert.equal(affectedBy(kind, "/reconciliation"), false, kind);
});
