# MONEY Trust Pass — closeout (2026-10-01)

Scope: owner real-use stack 129, P0 data correctness and P1 repetitive Review/bookkeeping UX.
Contract: [money-trust-pass.md](../contracts/money-trust-pass.md). No Flyway migration.
Branch `feat/money/trust-pass`; verified revision `a682c300d8bf4289a3e0744fe52bedf7d6e256ad`
(includes `origin/dev` with MONEY Mobile V65 and Calendar V66). Deployment status is recorded at the end.

## Root causes found

| # | Problem | Root cause |
|---|---|---|
| 1 | Owned transfers recorded as EXPENSE + INCOME | When both sides lacked automatic evidence they both entered Review; the panel confirmed one notification at a time and defaulted OUT→EXPENSE, IN→INCOME. Nothing offered to pair them. The automatic matcher itself never posted such a split. |
| 2 | Ads / non-transactions in Review | Every unparsed notification from an allow-listed bank package became `REVIEW_REQUIRED` and was counted in the main badge. |
| 3 | Balances could never disagree with the bank | The displayed balance re-anchors on the latest bank-reported balance, so a missing or duplicated fact was invisible. Only a manual-checkpoint diagnostic existed. |
| 4 | Same-minute ordering | Balance deltas compared minute-precision ledger time with a notification anchor, so a second fact in the same bank minute could be treated as "before" the anchor. |
| 5 | Lost balance evidence | Sources confirmed in Review were stored without their parse attempt; their bank balance was never used. |
| 6 | Opening balance could not be edited or unset | Only "create once" existed. |
| 7 | Archived accounts | A historical fact on an archived account could not be edited (server rejected it and the form showed an empty required account). Archived accounts were listed everywhere. |
| 8 | Mixed category dictionaries | The transaction/Review form listed income and expense categories together. |
| 9 | Dropped clicks | A 가계부 row clicked during a list refresh was silently ignored. |
| 10 | Date time-bomb in a test | `MoneyWebPostgresTest` assumed September 2026 is the current period. |

## Fixes implemented

**Financial reliability** — non-transaction gate with restorable ignore; Review lanes (decision / format /
ignored); unique transfer-pair suggestions for unposted notifications and posted facts; server guard that two
opposite raw sources can only be one TRANSFER; dismissal audit; reconciliation endpoint and audited
"accept bank balance" adjustment; per-account observation-time ordering; confirmed sources keep their parse
attempt. Automatic matcher thresholds unchanged.

**Review** — lane tabs with counts, plain-language reasons and stage list, pair confirmation/dismissal,
bulk ignore, restore, next-row selection after a decision, keyboard row movement, system codes only under
System Information.

**가계부** — serialized autosave with retry/reload, inline title/memo/category editing
(Enter/Tab/Shift+Tab/Escape), docked panel column, deferred open during refresh.

**Accounts / balance lifecycle** — reconciliation table and reconcile panel, archived accounts hidden by
default with a toggle, opening balance register/edit/unset, archived history editable, archived accounts not
offered for new facts.

**Performance** — Review queue stays at three queries (facets merged; noise lookup batched and only for
format rows); no global invalidation added; reconciliation is its own on-demand resource.

## Validation evidence

| Check | Result |
|---|---|
| Backend MONEY suite (`com.kafka.backend.money.*`), isolated local PostgreSQL 18, merged revision | 112 tests, 0 failures, 1 opt-in skip |
| Same suite, shared DEV isolated schema, merged revision | 112 tests, 0 failures, 1 opt-in skip |
| New backend regressions | `MoneyTrustPassPostgresTest` 6/6, `MoneyNoiseFilterTest` 3/3 |
| Frontend MONEY unit tests | 48 pass (8 new: autosave 4, review stages / hint resolver / cache family 4) |
| ESLint (`app/money`, `lib/money`) | clean |
| Production build (`next build`, includes type check) | pass |
| QA harness self-tests | 20/20 |
| **Managed acceptance `money-trust`, integration mode, isolated database** — run `2026-10-01T10-13-19-465Z-21ed075f` | **46/46 PASS** (15 Bridge, 8 Phase 2, 10 Phase 3, 6 Category, 7 Trust); Flyway `VALIDATED_READ_ONLY_NO_PENDING`; API PASS; cleanup PASS |
| Managed `money-trust-focused`, shared DEV | 7/7 PASS (run `2026-10-01T07-59-18-997Z-4200ba9f`) |
| Managed `money-category-focused`, shared DEV | 6/6 PASS (run `2026-10-01T08-55-03-603Z-beddda43`) |

Financial semantics verified by test:

* TRANSFER — pair confirmation yields one TRANSFER with two sources; income and consumption KPIs unchanged;
  linking a posted pair removes exactly the pair amount from both KPIs; ambiguous or >10 min pairs are not suggested.
* REFUND, LOAN_PAYMENT — unchanged code paths; existing `MoneyFinancialPostgresTest` (15) and Phase 2/3 browser
  scenarios pass (refund offsets consumption, unknown split stays unresolved, principal only reduces liability).
* INITIAL_BALANCE — remove/replace keeps account and later facts, audit snapshot written, KPIs unaffected.
* BALANCE_ADJUSTMENT — accepting the bank balance records ledger 65,000 / verified 60,000 / amount −5,000;
  income, consumption and savings KPIs identical before and after.
* Reconciliation — notification → parse → post → balance → Accounts: MATCHED for two same-minute facts,
  MISMATCH when the bank reports an unexplained difference, ANCHORED after the audited adjustment.

Browser evidence (synthetic data only): [docs/assets/money-sys/evidence/trust-pass/](../assets/money-sys/evidence/trust-pass/).

## Shared-DEV QA environment note

Full-suite runs against shared DEV failed at a different untouched step each time (seed API timeout,
connection reset, stale loan version, schema-drop lock timeout, pooler `max clients`), while the same scenarios
passed in focused runs. Other sessions were using the same database and owner lock. The acceptance gate was
therefore run once against a private throwaway PostgreSQL cluster (loopback, repository migrations V1–V66,
pool 8) and passed on the first attempt. Two real spec defects found on the way were fixed (page-dependent
fixtures in the combined run; a network gate installed during a debounced request).

Cleanup: every QA schema created by this work was dropped through the guarded fixture, including two left
by early runs and two left by failed managed cleanups. One orphaned DB session named after this session's own
dead run was terminated. `qa_money_mobile_*` belongs to another session and was not touched.

## Remaining risks

* Review-count semantics changed: the badge counts decisions only; format diagnostics have their own tab count.
* Existing Review items are not reclassified. Items already confirmed separately appear as
  "내 계좌 간 이체로 보임" only while both facts are within 10 minutes and unique.
* The non-transaction gate is rule-based. An unknown financial format without an amount token would be ignored
  (restorable from "무시된 알림"); all verified bank shapes are covered by tests.
* Reconciliation needs an anchor. Without an opening balance or a second bank observation the status is
  "비교 기준 없음".
* Reconciliation resolves bank balances only for active accounts and loads observations per request; fine at
  personal volume, not tuned for very large histories.
* Managed `money-performance` / `money-phase3-performance` suites were not run or updated for the autosave UI.
* The Loans card can still send a stale version when re-opened before its list refresh (pre-existing).

## Intentionally deferred

Accounts redesign, Loans repayment-plan model, Overview/Statistics redesign, ledger/posting architecture,
AI-assisted classification and import, category-management redesign. Proposals are in the session report.

## Deployment

See the section appended after promotion.
