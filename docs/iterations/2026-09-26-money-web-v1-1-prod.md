# MONEY SYS Web V1.1 — PROD closeout

Completed 2026-09-26. The seven-view MONEY workspace is deployed to PROD. Transaction facts, bookkeeping meaning, and Overview statistics remain separate. Android transport was unchanged.

## Exact release

| Item | Verified value |
| --- | --- |
| Feature / DEV application revision | `4573c190a408fce3b8312aac275897d7517b6df4` |
| PROD promotion | `e74b907fb89d08307d1b08d12cbfdee2fe79045d` |
| Identical application tree | `500cfe09730c2a3c2153ac5aa445ca89c2097de9` |
| Backend deployment | `07c39d55-13ab-435f-a6ee-2e7879583a6e` |
| Frontend deployment | `22fb432f-3621-4ab2-bed4-35771882091a` |

Both Railway deployment details identify the exact PROD promotion commit and their respective `/backend` and `/frontend` roots. Both are successful. Promotion also includes the already-integrated Diet and Checklist changes from the refreshed DEV baseline; their affected tests were checked before release. This closeout is a subsequent documentation-only DEV update, not another application release.

## Delivered behavior

- Overview, Transactions, 가계부, Accounts, Loans, Review Required, and Settings have direct navigation. Normal editing uses a docked right panel with visible list context, selected rows, save/cancel, dirty-state checks, and in-place refresh.
- Overview defaults to the current month and supports week/month/calendar quarter/rolling six months/rolling year/custom ranges and arrows. Income, consumption, refunds, excluded records, and savings-boundary net movement have explicit tests. Internal hops never inflate income or consumption.
- Transactions have normalized title/memo and clear direction. Provenance stays immutable and is fetched only from collapsed system details.
- Bookkeeping stores sparse field overrides and otherwise inherits live transaction values. Reset removes the override; editing bookkeeping never edits its source transaction.
- Accounts support presentation, alias, role, balance provenance, and inclusion controls. Loans are separate, versioned manual liabilities. Review supports approval/edit, defer, and rejection; rules support title/memo defaults.
- An after-commit wakeup immediately re-evaluates complete evidence. Owner serialization, ambiguity handling, source exclusivity, and durable delayed recovery remain in place. A late competing source is reviewed instead of creating a duplicate transaction.

## Migrations

Only `V58__money_web_v1_1.sql` was added. It adds normalized title/account inclusion fields, sparse bookkeeping overrides, separate loans, review deferral, and rule defaults. No applied migration was edited and no Flyway repair was run.

| Version | Canonical owner / migration | Flyway checksum |
| --- | --- | ---: |
| V50 | MONEY core ledger | 875946474 |
| V51 | Checklist canonical | 507804356 |
| V52 | Absent; not allocated | — |
| V53 | Diet slot measured time | -1875531654 |
| V54 | MONEY processing schedule | -1835034771 |
| V55 | MONEY V1 product | -158618944 |
| V56 | MONEY Bridge credentials | 1570346913 |
| V57 | Diet daily notes and note sync | -596421770 |
| V58 | MONEY Web V1.1 | 1638899968 |

DEV normal startup validated 57 migrations, reported public schema version 58 and no pending migration, and returned HTTP 200 from `/api/money/accounts`. PROD preflight found version 57, no failed/duplicate versions, and unchanged canonical checksums. PROD startup validated all 57 migration files and applied exactly V58 at 04:33:42 UTC. Post-deployment history confirmed V58 success/checksum, zero failed rows, and zero duplicate versions. Startup validation establishes no checksum mismatch.

## Validation

- Backend: 76 tests executed; 75 passed, 0 failed/errors, 1 historical real-device audit skipped by its opt-in condition. Tests ran in an owned isolated schema, followed by `bootJar`.
- Frontend: 11 MONEY tests passed, TypeScript passed, scoped ESLint passed, production build passed.
- Managed QA harness: 20 tests passed. Additional affected Diet frontend tests (9), Checklist frontend tests (14), and Diet note projection backend test passed.
- Worker Central QA: `2026-09-26T04-24-20-999Z-ddebe307` — 28/28 passed on exact commit `4573c19`.
- Integrated DEV Central QA: `2026-09-26T04-28-05-747Z-6d0c2adb` — 28/28 passed on the same exact DEV commit, including 15 Bridge scenarios and 13 Web scenarios. Flyway read-only validation, API checks, real scheduler, browser console checks, and cleanup passed.
- Browser checks cover all routes, periods/arrows/custom range, KPI semantics, direction, panel edit/close/dirty guards, bookkeeping inheritance/override/reset, account controls, loans, rules, review, immediate posting, and lazy provenance.

## Performance evidence

Same synthetic 200-transaction / 8-account benchmark, three samples each; these are local runtime measurements against DEV PostgreSQL, not a PROD SLA.

| Operation | Before SQL count | After SQL count | Before duration | After duration |
| --- | ---: | ---: | --- | --- |
| Transaction list | 102 | 2 | 7.21–7.30 s | 142–145 ms |
| Account balances | 33 | 4 | 2.57–2.94 s | 283–291 ms |

Final integrated browser run: transaction API 283 ms, balances 492 ms, Overview 844 ms, rendered list 1,166 ms, panel opening 87 ms, zero eager provenance requests. Posting measured 2,011 ms from the final ingest request to observed posting (214 ms ingest request, 1,797 ms after acceptance). The preceding run measured 2,711 ms end to end. Each produced one logical transfer, two independent raw sources, and zero duplicate rows after retry. The longer recovery window is retained; no two-minute wait remains for complete unique evidence.

## PROD smoke and preservation

- Backend public health HTTP 200; frontend HTTP 200.
- Existing authenticated Web session rendered all seven MONEY screens and their API-backed data without console errors. The alert-role node was Next's route announcer, not an application failure.
- The 12 existing transaction rows rendered. Opening and closing a transaction panel preserved the visible list and selection; no PROD edit was saved.
- Authenticated Settings device status loaded the existing enrolled Bridge and its accepted-delivery status. No enrollment code was issued, credential rotated, or device revoked.
- Unauthenticated MONEY API access returned 401. Invalid `mb1_` Bridge authorization on canonical notification ingest returned 401 before data creation.
- Read-only structural fingerprints matched before/after for all 16 raw events, 12 ledger rows, 7 accounts, and 14 provenance links. Newly added columns were excluded from the comparison. No real notification bodies or complete account identifiers are included in this report.
- No PROD reset, fixture seed, financial record deletion, raw rewrite, or historical reinterpretation was performed. Successful authenticated ingest/owner isolation is covered in isolated QA; no synthetic financial notification was sent to PROD.

## Limits and cleanup

Historical assets use dated evidence only where supportable; otherwise the UI labels the latest available calculated basis and unverified accounts. Loans are current manually maintained principal, not historical amortization. Split bookkeeping is reserved for future work. Ambiguous or delayed evidence can remain pending/review-required. New external arrivals use the explicit Web refresh action; save refreshes in place. The timing samples are observations, not a guaranteed latency bound.

Both final QA runs removed their owned schemas, processes, and connections. The separate normal DEV startup session was stopped after verification; read-only checks found zero `money-web-v58` connections and zero remaining Web QA schemas. Unrelated runtimes and main-checkout user changes were preserved. Local diagnostic evidence is retained under `.qa/evidence/money-web-v1-1/` in the main checkout (ignored, not committed). Temporary task/release worktrees and branches are cleaned after this closeout is integrated; Git history is the durable code record.

MONEY INDEX and the new Web V1.1 PROD Drive closeout are synchronized with this release. The current product policy is not weakened or rewritten. No Mobile MVP or Android redesign was started.

- [MONEY INDEX](https://docs.google.com/document/d/14NMwc0Nw84HYUBl49RgzdEepT8m1s7K8gdzTsS1jXZU/edit)
- [60_CLOSEOUT__MONEY_SYS_WEB_V1_1_PROD_20260926](https://docs.google.com/document/d/1E9-NWFf6z0S4HNPSCdAJgEfWBkduDyq5sZuu0dPpqUA/edit)
