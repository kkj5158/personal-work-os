# MONEY SYS Batch 3 — DEV validated, PROD promotion in progress

Product code: `38f97da633b03ca94f456c290aa43d523a1c08bd` (category creation sends `archived: false`). The feature includes latest `origin/dev` baseline `f60d509`. No further product defect was found during functional browser validation.

## Verified DEV gates

- Normal foreground backend on loopback 18155: startup/API HTTP 200; MONEY scheduler loaded and automatic raw-to-transfer pipeline exercised.
- V55__money_v1_product.sql applied through normal startup. Read-only Flyway validate: PASS, 54 migrations, current 55, pending 0. No repair or history edits.
- Backend: 57 tests passed, one opt-in historical audit skipped, zero failures; bootJar passed.
- Frontend: 24 focused tests passed previously; after the category fix, 7 MONEY tests, focused lint, TypeScript and optimized build passed. Browser used that build (BUILD_ID 23NAKAZZjuKpg2QKdN2eO).
- Live API: 182 checks including scheduler polling passed. Raw idempotency, confirmation/reprocess, link/unlink, refunds/cap, optimistic conflicts, balances, rules, aggregates and image persistence covered.
- Functional browser PASS against manually started port 3015 and task-owned backend. The frontend was not restarted or replaced.
- Home: zero-account onboarding, empty chart, income/consumption/savings cards, category drilldown and review queue.
- Transactions: income, expense, transfer, partial linked refund, detail, memo/category correction, rule application, search/filter and exclusion with retained audit row.
- Money Flow: consumption/savings branches, gateway relationship, separate purpose savings/installment groups, compact cards, account navigation and monthly flows. Test chain showed 20,000 savings rather than double-counting its 30,000 gateway funding.
- Account Detail: monthly inflow/outflow, transaction list, calculated vs manually verified balance, checkpoint with no extra ledger row.
- Review: raw detail, safe explicit reprocess, confirmation with preserved source, unresolved notification retained.
- Settings: accounts/roles/funding/edit/archive, emoji/default icon, valid PNG upload/crop, categories/defaults, merchant rule creation/edit and connection status. A deliberately invalid image fixture showed an error; valid image succeeded.
- Browser console: zero error entries. Dashboard and full Money Flow layout visually inspected.

## DEV MONEY reset

Initial reset removed 19 raw notification test rows; the other eight MONEY tables were empty. After API QA, synthetic records were cleared. After browser QA the final cleanup removed: 3 corrections, 1 transaction source, 3 parse attempts, 6 transactions, 1 balance checkpoint, 1 rule, 10 categories, 6 accounts and 2 raw notifications.

All nine MONEY tables are now empty. Each reset used an exact table allowlist in one transaction, verified Flyway history unchanged and unchanged row counts in 64 unrelated public tables. No PROD reset was performed. No historical real-device notifications were backfilled.

## PROD read-only preflight

Verified the Supabase personal-work-os-prod project: V50 money core (875946474), V51 Checklist (507804356), V53 Diet (-1875531654), V54 MONEY processing (-1835034771), all successful. V52 absent; failed rows 0; duplicate versions 0. Existing five MONEY tables each contain 0 rows. V55 is the expected pending migration. Promotion has not yet been recorded as complete.

## Canon and limits

V51 Checklist; V52 absent; V53 Diet; V54 MONEY engine; V55 MONEY Web V1. Applied migrations were not edited. Product contract: [Batch 3](money-sys-batch3.md).

Android authenticated PROD transport remains explicitly deferred to a separate mobile track. The installed POC remains DEV/USB-only. No Batch 4 or V1+ work.

The user-owned frontend on 3015 is preserved. Its active dependency requires retaining this worktree until it stops; no unrelated process was terminated. Task-owned backend/validation resources will be released after runtime validation.

Drive: [MONEY index](https://docs.google.com/document/d/14NMwc0Nw84HYUBl49RgzdEepT8m1s7K8gdzTsS1jXZU/edit), [Batch 3 closeout](https://docs.google.com/document/d/1PxMm1QZ_6cVQtGvWtkCwuQNfnpMtLK-KKV-nc4hvb_E/edit).
