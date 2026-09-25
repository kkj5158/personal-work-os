# MONEY SYS Batch 3 checkpoint — BROWSER RUNTIME POLICY BLOCK

**Not complete. Not merged into dev. Not deployed to PROD.**

## Revision and scope

- Branch: `codex/money-sys-batch3`.
- Initial product implementation: `1df1a0b9af8294b13d46494045dbe879641437d1`; live-validation category payload fix: `38f97da633b03ca94f456c290aa43d523a1c08bd`.
- Refreshed `origin/dev` remains `f60d509` and is already included. No later integration conflict.
- No Batch 3 dev merge or PROD deployment commit exists yet.
- Android authenticated PROD transport is explicitly deferred. It is not a MONEY Web V1 completion gate. Installed Android POC remains USB/DEV-only.
- Product scope and APIs: [Batch 3 contract](money-sys-batch3.md). No V1+ or mobile expansion.

## Completed DEV gates

| Gate | Verified result |
| --- | --- |
| Normal backend startup | PASS, direct foreground Java in task-owned session 14448, PID 31376, loopback port 18155 |
| Environment | Existing authorized inherited DEV variables consumed by application-dev.yml; no secrets printed or copied |
| V55 migration | PASS, normal Flyway startup applied V55__money_v1_product.sql; checksum -158618944 |
| Flyway validate | PASS, 54 migrations, current V55, pending 0; no checksum mismatch reported |
| Canonical sequence | V51 Checklist, V52 absent, V53 Diet, V54 MONEY processing, V55 MONEY product |
| Backend HTTP/API | PASS, HTTP 200; DEV /actuator/health returns 403 under existing API-only DEV security, not changed |
| MONEY scheduler | Bean loaded; actual scheduled parse/review and automatic transfer posting verified |
| Live product smoke | PASS, 182 HTTP checks including polling; account CRUD/roles/funding/emoji/archive/version conflicts, categories/rules, manual income/expense/transfer, refunds/cap, search/filter, memo/category corrections, exclusion, checkpoints, account/dashboard aggregates, transfer link/unlink, raw idempotency, unresolved review, confirmation, safe reprocess/exclusion |
| Automatic engine | Sanitized Kakao raw waited the normal two-minute matching horizon and became one canonical transfer with source preserved |
| Extra integration checks | Raster image persistence and browser-origin CORS PASS |
| Backend tests/build | Prior unchanged-code result: 57 passed, 1 opt-in historical audit skipped; bootJar passed again |
| Frontend tests/build | Prior 24 focused tests passed; after category fix, 7 MONEY tests, focused lint, TypeScript and optimized build passed again |
| Functional browser | NOT RUN against live Batch 3; runtime execution blocked |
| PROD | Not modified or deployed; promotion remains gated on browser validation |

The live smoke found a real request-shape defect: category creation omitted the primitive `archived` property and received HTTP 400 / Malformed request. The UI now sends `archived: false`; the corrected live request, tests, lint and build passed. No backend/parser/matcher change was needed.

## DEV MONEY reset and prepared browser state

Initial authorized reset cleared 19 rows from `money_raw_notifications`. These eight tables were already empty: `money_parse_attempts`, `money_transactions`, `money_transaction_sources`, `money_accounts`, `money_categories`, `money_category_rules`, `money_balance_checkpoints`, `money_corrections`.

Synthetic validation fixtures were cleared afterward: 7 corrections, 2 transaction sources, 5 parse attempts, 12 transactions, 1 balance checkpoint, 0 category rules, 10 categories, 6 accounts, and 4 raw notifications. An earlier failed smoke attempt also cleared only its 6 synthetic accounts and 9 default categories.

All nine MONEY tables are empty at this checkpoint; account and transaction APIs confirm zero rows. Every reset used an exact MONEY table allowlist in one transaction, retained schema, compared Flyway history, and verified unchanged row counts in 64 unrelated public tables. No Flyway repair/history editing or PROD cleanup. The old 18 audited notifications were not backfilled.

The clean initial state is ready for the browser onboarding test. Sanitized API fixture logic and receipts remain in ignored task-local `backend/build/batch3/`; no real notification content is committed.

## Browser-runtime mechanisms inspected

1. `frontend/package.json`: `dev` / `start` launch Next directly; `build` / `lint` are one-shot; `test:notes` / `test:daily-hub` run Node/tsx/JSDOM tests.
2. Feature and main repositories: no Playwright, Cypress, WebDriver or other E2E config. The lockfile's Playwright entry is Next's optional peer declaration, not a configured E2E suite.
3. No managed `webServer`, start-server-and-test, or equivalent test lifecycle.
4. Existing calendar/attendance QA helpers are API checks or fixture scripts. IDE/local launch configs start ordinary runtimes; they do not provide a one-shot browser lifecycle.
5. No local Node frontend listener or compatible task/shared frontend on 3015. No stale/unrelated frontend was reused.
6. AGENTS, OPERATING_POLICY, GIT_WORKFLOW, VALIDATION_POLICY, and Drive 02_GLOBAL_AGENT_EXECUTION_POLICY reviewed. The global policy requires inspecting legitimate managed fallbacks before a manual handoff; it does not override platform approval.

Rejected commands: earlier detached PowerShell Start-Process backend attempts; then the direct foreground command `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3015` with DEV frontend environment. Automatic approval returned only `blocked by policy`. The direct foreground backend was allowed and is running. No equivalent launcher, wrapper trick, new managed runner, hidden process, service or policy weakening was attempted. This is not a MONEY product defect.

## Single remaining manual action

Start the already-built frontend in a normal PowerShell terminal and leave it running:

```powershell
Set-Location 'D:\DEV_SPACE\personal-work-os-worktrees\money-sys-batch3\frontend'
$env:NEXT_PUBLIC_APP_ENV='dev'
$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:18155'
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3015
```

The backend remains in the owned foreground session per the explicit instruction to retain it until runtime/browser validation is finished. Pool maximum 2, minimum idle 0. No other track's process was stopped. The unmerged branch/worktree are retained. Once browser validation completes, stop owned runtimes and release connections as required by the global execution policy.

## Remaining gates

Run the actual UI flows for Home/drilldown, Transactions CRUD/filter/refund/correction, Money Flow groups/card navigation, Account Detail/checkpoint, Review detail/confirm/reprocess/ambiguity, and Settings account/assets/category/rule management, including zero-account onboarding and console checks. Fix actual defects and repeat affected checks; clear only synthetic MONEY data afterward. Then refresh dev, integrate/push, inspect PROD migration/data read-only, promote the same verified tree, and perform minimum PROD verification. Do not merge or deploy before browser PASS.

Drive: [MONEY index](https://docs.google.com/document/d/14NMwc0Nw84HYUBl49RgzdEepT8m1s7K8gdzTsS1jXZU/edit) and [Batch 3 checkpoint](https://docs.google.com/document/d/1PxMm1QZ_6cVQtGvWtkCwuQNfnpMtLK-KKV-nc4hvb_E/edit). Status remains BROWSER RUNTIME POLICY BLOCK.
