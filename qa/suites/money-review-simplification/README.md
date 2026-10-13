# Review Required simplification QA

This suite separates component behavior, financial command integration and actual
browser geometry. It never starts a browser or loads shared database credentials.

## Component regression

From `frontend`:

```powershell
node --import tsx --test app/money/MoneyNotificationReview.test.tsx lib/money/reviewWorkflow.test.ts lib/money/cache.test.ts
```

The actual Review component and memory cache are mounted in JSDOM with an explicit
API double. The tests verify merchant hierarchy, exact action vocabulary, direct
preview/execute scope, failed previews, duplicate-click prevention, original-request
recovery, pagination/refresh selection, clearing selection on filters/tabs, compact
bulk preview, partial success, supported Undo, currency presentation and repeated
outcome reads. They do not certify backend registration, financial integrity or CSS
geometry. No skipped test counts as passed.

## Real financial API integration

Integration owns the loopback PostgreSQL process and Spring/frontend runtime. Use
fresh full canonical migrations inside an otherwise empty schema named
`qa_money_web_<20 lowercase hex characters>` with schema comment
`pos-central-qa-money-web-owned`. The runtime needs a synthetic owner and disabled
ingestion, classification, recommendation and AI workers/providers. Preserve the
existing full Flyway history in shared DEV/PROD; this fixture does not touch it.

The Java fixture explicitly accepts only `127.0.0.1:55440..55449`, checks the actual
server address/port and schema ownership marker, then checks an empty seed target.
It uses the actual IBK parser to create supported expense evidence; timestamps on
parse attempts are deliberately older than the ordinary settlement wait window.
Missing candidate currency exercises the domestic default. A separate foreign
notification preserves explicitly stored `raw_payload.currency=USD`.

With the owned environment in the process and a main-runtime classpath file:

```powershell
java -cp $taskClasspath qa/suites/money-review-simplification/ReviewSimplificationFixture.java seed
java -cp $taskClasspath qa/suites/money-review-simplification/ReviewSimplificationFixture.java snapshot
```

Save the seed JSON privately in the managed `.qa/runs/<run-id>` directory. Set
`QA_RUN_DIR`, `QA_API_URL` (exact loopback HTTP origin), and `QA_CLASSPATH_FILE`, then:

```powershell
node qa/suites/money-review-simplification/api-probe.mjs <absolute-seed-json-path>
```

The probe processes only `api-*` fixture records. UI fixtures remain available for
connected browser QA. It checks ordinary KRW category-free registration, identical
request replay, read-only outcome recovery, blocking unknown owned accounts and
explicit foreign currency, protection against financial source exclusion, partial
version conflict, deferral tab membership and supported Undo. Before/after audit
compares original payload/text hashes, parse counts, exact ledger/source additions
and zero added external lookup/paid recommendation usage. Timings are endpoint
durations, not a production performance benchmark. Artifact: `review-api-probe.json`.

`bump <exact-fixture-UUID>` is a deliberate synthetic pending-row version conflict
helper; it cannot target shared data. `snapshot` runs in a read-only transaction.
No helper creates/drops schemas, starts/stops servers or changes Flyway history.
The caller owns lifecycle and cleanup.

## Verified TEAM KAFKA Chrome checks

Use only the connected, identity-verified existing TEAM KAFKA profile under the
owner's AGENTS.md policy. Existing Playwright adapters launch separate browser
profiles and must not be invoked for this release.

| Gate | Isolated fixture / expected behavior |
|---|---|
| Desktop merchant hierarchy | Actual merchant bold above muted notification; compact rows; unknown merchant fallback; exact three primary buttons; no right financial confirmation panel/category editor |
| Single move | `direct-move` disappears only after success; exactly one KRW uncategorized transaction/source in Bookkeeping; amount/account unchanged |
| Single defer / Undo | `direct-defer` enters 보류; processing history retains source; supported Undo restores pending |
| Single nontransaction / Undo | `direct-nontransaction` disappears; no ledger created; original payload/text hashes preserved; supported Undo restores pending |
| Blocked financial facts | `blocked-owned` and `foreign` remain pending with concrete reason; no fabricated financial facts |
| Duplicate click | Throttle only the owned local response or use a slow owned request; second click sends no new execute request; exactly one ledger source |
| Response loss | For `response-loss`, commit the owned API command then deliberately lose its response through a run-owned proxy; row stays recoverable; original request ID GET retrieves result; no new execute command |
| Current page / filter selection | Filter `(광고) 검증 일괄 안내` has 52 IDs; page has 50; next page preserves selection; all-filter scope has exactly 52; changed filter clears prior IDs |
| Bulk scope / partial failure | Preview and final execution bind same ID/version snapshot; use one exact synthetic version bump after preview; successes disappear, conflict remains selected; result counts are explicit |
| Narrow viewport | 390px and 768px layouts: table scroll region, toolbar, row controls and compact preview remain reachable; keyboard focus works; no page-wide horizontal overflow |
| Stable context | Filters and page scroll survive direct completion; no complete page reload; no duplicate API waterfall or external AI calls |

Record screenshots and actual browser action/result evidence privately. Component
tests alone cannot pass these gates. PROD checks must remain read-only and never
seed synthetic financial records or process existing user queues.

## Existing pending backlog and migration audit

Read actual owner PENDING rows page by page via `/ai/workbench` using current
filters, count `moveToBookkeepingEligible` and group remaining
`moveToBookkeepingBlockReason`/`reason`. GET reassessment does not confirm records.
Record original total, eligible move count and remaining reasons; distinguish the
owner's historical approximately 68 from the newly measured total. Do not call
preview/execute simply to obtain a supposedly read-only backlog report, because
preview persists audit events. Nonfinancial processing requires explicit user action.

`qa/runtime/DatabaseAudit.java` enforces JDBC read-only plus PostgreSQL read-only
Flyway connections and calls only `info()` / `validate()`. Run it in Integration's
serialized shared-DB audit window. `qa/money-targeted-tests.mjs` automatically loads
shared DEV credentials; avoid it for these mutation regressions. The existing
`qa/money-backend-owned-runtime.mjs` uses synthetic loopback PostgreSQL 55442 and
fresh XML; serialize it with transfer regression 55441 and the local UI runtime.
