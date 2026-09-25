# Central Integration / QA Runtime V1

Workers implement features, run focused tests/builds, and hand off a committed revision. Integration/QA owns the short shared DEV validation window: migration audit, ports, runtime, API/browser checks and cleanup. This is local Windows development tooling, not a deployed application or a PROD release gate.

## Commands

From the repository root (Node 24+, JDK 21, Git and network access):

```powershell
npm ci
npm --prefix frontend ci
npm run qa:browser:install
npm run qa:test
npm run qa:focused -- money
npm run qa:integration -- money --worktree D:/path/to/completed-worktree --revision <full-SHA> --handoff D:/path/to/handoff.json
```

The harness source/dependencies belong to the checkout where the command runs. `--worktree` selects the application checkout without switching its branch. It must have its own frontend dependencies. `--revision` verifies HEAD; it never silently checks out another revision. The run records both tool and application revisions. Supply an existing worktree for a different revision. No external runtime reuse is supported in V1.

`focused` runs the selected suite. Only this mode accepts `--allow-dirty` for harness development; the artifact explicitly records dirty state and cannot establish a committed release gate. `integration` requires a clean target containing freshly fetched `origin/dev`, an exact Flyway history match, and the selected suite. A handoff is optional for validating the current integration tree. A handoff never expands a pilot PASS into acceptance of unimplemented Worker scenarios.

Optional flags: `--system money`, `--backend-port 18080`, `--frontend-port 13000`, `--env-source <.env-or-workspace.xml>`, `--timeout 900000` (total milliseconds; maximum one hour). Defaults allocate free loopback ports from 18080–18109 and 13000–13029. Occupied explicit ports block; no process is killed to reclaim a port. Allocation is rechecked before start and bind collisions fail safely.

## Environment and data

The existing `.env.example` convention and IntelliJ `BackendApplication` environment are reused. Auto-load order: primary checkout `.idea/workspace.xml`, primary `.env`, target `.env`, exported required DEV variables. An explicit `--env-source` replaces file discovery. Only `DEV_DB_URL`, `DEV_DB_USERNAME`, `DEV_DB_PASSWORD`, `APP_DEV_USER_ID` are extracted; only SET facts enter results. Missing values produce `ENVIRONMENT SOURCE INACCESSIBLE` with the missing mechanism/keys.

The backend is explicitly DEV and loopback-only. The existing DEV user provider supplies the session identity; no login bypass is added to product code. Browser/frontend processes receive no DB credentials and explicitly use the DEV auth path. Production public Supabase settings are cleared for the pilot. Never paste credentials into a handoff, CLI argument, report or chat.

Hikari maximum pool size is 2 and minimum idle is 0. A separate, sequential JDBC connection estimates available DB capacity and reads Flyway history. The estimate is advisory and cannot account for every Supabase pooler limit; insufficient observed capacity blocks. No schema or fixture is created by the pilot. A named backend connection allows a post-shutdown query to verify zero owned DB sessions.

## Lifecycle and ownership

One root Node runner owns build/audit tasks, the direct `java -jar` backend and a Playwright test runner. Playwright's supported `webServer` lifecycle starts the foreground Next CLI and owns its teardown. Frontend validation always builds a fresh production bundle with the owned API URL, then uses `next start`. The backend becomes ready only on an HTTP 2xx API probe; early child exit and readiness timeout fail the run. Playwright waits for HTTP before tests and refuses existing servers.

Each run has an ID, PID, checkout/revision, ports, process IDs, timestamps, state and result. A shared Git-common-directory `pos-central-qa.lock` serializes central runs across repository worktrees, including the DB audit. It does not coordinate unrelated repositories or Workers that ignore this contract. Other worktrees' migration filenames are inventoried read-only. Use the existing repository coordination policy for manual schema operations.

Cleanup on pass/failure/timeout/SIGINT stops only live children retained in this run's process handles. On Windows, `taskkill /PID <owned-root> /T /F` terminates an owned process tree, never a PID inferred from a port or stale file. Windows lacks POSIX graceful signals; backend exit plus the DB-session query proves pool release. Playwright handles its normal webServer shutdown. Temporary Next build files are removed; only the exact include paths added by that build are reverted in `tsconfig.json`, and concurrent changes are preserved as a cleanup failure. Unknown occupied ports are preserved and reported.

A stale lock is deliberately not stolen automatically. Inspect its owner, result, process state and ports before manually removing that exact lock. An OS kill/power loss cannot run JavaScript cleanup: inspect/reconcile owned resources, do not blindly kill a stored PID. V1 supports Windows only because process-tree cleanup has been tested there. No Start-Process, shell start, scheduled task, service or hidden detached launcher is used. Gradle's ordinary `--no-daemon` single-use build JVM stops after the build.

## Migration gate

Every run refreshes `origin/dev`, inventories local/other-worktree migrations, reads shared DEV `flyway_schema_history` and invokes the project's actual Flyway `validate()` through a QA-only Java/Gradle init task. The audit connections enforce read-only transactions. Pending migrations and checksum/history errors block. Nothing calls migrate, repair, clean, renumber or edits applied files.

Focused Web V1 validation may run with future applied migrations using Flyway's standard future-migration tolerance; the artifact explicitly lists those versions. Integration mode blocks that state. Reconcile latest dev and the responsible Worker before rerunning. Unapplied feature migrations must be separately reviewed, numbered and applied under the repository migration policy. Backend startup disables Flyway after the read-only audit so an audit/start race cannot accidentally migrate shared DEV. Hibernate schema validation remains enabled.

## Suites and handoff

Copy `handoff.example.json` outside tracked source or into `.qa/handoffs/`. Fill system/track, feature branch, full commit/base-dev SHAs, scope, migrations, API changes, passed tests, runtime/fixture requirements, browser scenario IDs, risks and cleanup requirements. No transcripts or credentials. The current target must equal `commitSha`, and `baseDevSha` must be its ancestor. Unknown scenarios or fixture/runtime requirements block until a reviewed adapter implements them; JSON never executes arbitrary setup commands.

MONEY Web V1 pilot IDs:

- `money.routes`: Home, Transactions, Money Flow, Review Required, Settings load with real API responses.
- `money.filters-reload`: transaction search, empty result, reload and persisted category data rendered from the API.
- `money.account-dialog`: open, type and cancel an unsaved account form; reload confirms no saved draft.

API smoke reads accounts, categories, transactions and connection status. Console errors, uncaught page errors and HTTP 5xx fail browser tests. These scenarios make no application writes. MONEY processing and absence-backfill schedulers are disabled, and scheduler acceptance is explicitly NOT_RUN. Batch 4 Android Bridge behavior, ingestion and scheduler scenarios are not certified by this pilot.

For another system, add `qa/suites/<system>/adapter.mjs` (system, readiness API, route, scenario IDs, API checks, background-validation statement) and `*.spec.mjs` tests using `qa/helpers/browser.mjs`. The shared API helper and `FixtureScope` support persistence scenarios with immediate, ID-scoped cleanup registration; the adapter must implement the fixture/setup contract first. Never delete shared rows by broad date/user/domain criteria. API readiness and the frontend route are adapter inputs. Product configuration defaults are not changed by tooling.

MONEY Batch 4 Worker: finish and commit your own branch; provide the JSON plus exact browser/scheduler/Bridge scenarios and cleanup requirements. Integration/QA reviews and adds the required suite adapter changes, obtains the eligible target worktree with latest dev, reconciles Flyway, and invokes the integration command above. Do not omit Batch 4 scenarios to get a Web V1 pilot PASS. Your product merge/deployment remains the MONEY track's responsibility.

## Evidence and failure states

Private evidence lives under `.qa/runs/<id>/`: `state.json`, `result.json`, `result.md`, redacted process logs, `frontend-owner.json`, `browser.json`, and failure screenshots/traces. Artifacts include exact gates, invoked checks, API/browser results, future migration versions, runtime errors and cleanup independently. Traces/screenshots may contain private DEV product data; keep them local/ignored and share only reviewed evidence. No request bodies or DB credentials are intentionally logged.

States: PASS, FAIL_PRODUCT, FAIL_RUNTIME, BLOCKED_POLICY, BLOCKED_RESOURCE, BLOCKED_CONTEXT. A tool/platform rejection outside the child process must be recorded by the invoking Agent as `MANAGED QA RUNTIME POLICY BLOCK` with the exact rejected operation; a runner cannot observe a command the platform never starts. Do not retry via a hidden launcher. Application failures are not policy failures.

Automated harness tests exercise occupied ports, startup failures, readiness timeout, abort, owned descendant cleanup, lock ownership, stale target handoff, missing environment, streamed-secret redaction, artifact generation, owned-fixture cleanup, real Playwright browser failure/console/page errors/screenshots/traces, frontend startup failure and external-server refusal. SIGINT cleanup is tested through the actual Node signal handler (Windows uses IPC to deliver the event because POSIX signal delivery is unavailable).

References: [Playwright webServer lifecycle](https://playwright.dev/docs/test-webserver), repository `agent/GIT_WORKFLOW.md`, `agent/VALIDATION_POLICY.md`, and Drive `02_GLOBAL_AGENT_EXECUTION_POLICY` / central QA report 001.
