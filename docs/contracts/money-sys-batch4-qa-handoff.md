# MONEY Batch 4 — Integration and release handoff

**Central QA PASS. PROD deployment and phone acceptance remain pending.**
Do not claim Batch 4 completion or start Mobile MVP automatically.

## Verified candidate

- Feature: `codex/money-sys-batch4`.
- Strictly tested application/tool revision: `a2c83b515169e25576480db9f7b145193d68713b`.
- Base DEV: `2461edd38837e2e1ab34341b484bfd6207df51b4`, normal integration of owner-cleared Diet source `4071896` and frontend `fa5de41`.
- V56 MONEY `money_bridge_credentials`: source `7275816`, checksum `1570346913`.
- V57 Diet `diet_daily_notes_and_note_sync`: source `4071896`, checksum `-596421770`.
- Both are successful in shared DEV and unchanged from canonical Git sources. Flyway validated 56 migrations, no pending/future versions. V51 Checklist / V52 absent / V53 Diet / V54–V56 MONEY remain canonical.
- No applied history was edited, repaired, renumbered or recreated. Subsequent documentation-only commits preserve the tested application tree.

## Central QA evidence

Run `2026-09-25T21-14-50-807Z-3a76ffd4` returned **PASS**, clean target and exact candidate. Ignored local evidence: `.qa/runs/2026-09-25T21-14-50-807Z-3a76ffd4/result.json`. JSON handoff: `.qa/handoffs/money-batch4.json`.

All 15 Bridge scenarios passed: Settings area; code creation; display/hide/expiry/hidden-page clearing; single-use exchange; device status; identity binding; idempotency; UI revocation; rotation; invalid/revoked rejection; owner isolation; existing Web authentication; nearby routes; canonical ingest; actual scheduler. All three existing MONEY route/filter/account-dialog scenarios passed. API reads returned HTTP 200. One synthetic nonfinancial raw source, two idempotent retries, changed-body conflict rejection, Review Required and zero ledger entries were verified.

The live run found one response defect: default access-denied handling dispatched to /error and turned a valid Bridge token's forbidden scope into 401. The Bridge chain now sets 403 directly. Scope restrictions are unchanged. MockMvc and live checks passed.

- Worker backend: 64 passed, one historical audit skipped; bootJar passed.
- After the fix: 19 focused Bridge/PostgreSQL/PROD JWT/profile tests passed.
- Frontend: eight focused tests, lint/TypeScript and combined optimized build passed.
- QA harness: 20 passed.
- Diet prerequisite: 21 focused backend and five frontend tests, lint, TypeScript and optimized build passed.

## Managed lifecycle and cleanup

Use the canonical `npm run qa:integration -- money --worktree <path> --revision <SHA> --handoff <JSON>` command with `system: money`, `track: money-batch4` and all 18 adapter IDs. See `qa/README.md`. Do not manually start servers or use detached launchers.

Central QA loads authorized DEV configuration without displaying values, owns loopback runtimes and a two-connection pool, validates shared history read-only, then creates an owned isolated MONEY schema. Actual PROD security tests supplement the DEV browser identity. MONEY scheduler/ingest use the isolated schema; Hibernate validates public entities. Sensitive runs disable screenshots/traces. No real notification bodies or credentials are in evidence.

Cleanup PASS: all owned runtimes stopped, ports released, owned schema removed after ownership/zero-ledger checks with RESTRICT, zero owned DB connections. Shared data/history and unrelated processes were preserved. The earlier empty Worker schema and synthetic phone fixtures are removed. Frontend dependencies are checkout-local, not a junction. The temporary Diet integration worktree/branch was removed; original Diet worktree preserved.

## PROD scope gate

Read-only PROD preflight found successful V51/V53/V54/V55; V56 and V57 are absent. PROD remains Batch 3 `9e9e3ab0b3c9e08c3bdbdb3ff80a7bc45b6aeb02`. Both services and authenticated MONEY Settings were available. No PROD data/schema changes have been made in this resume.

The verified combined tree includes Diet Daily Note/NOTE SYS code and V57 (new diet_daily_notes table and opt-in settings, default OFF). The resume instruction expects only MONEY migrations pending before PROD; Diet was explicitly cleared for DEV integration. Confirm combined PROD scope before deployment. Do not omit/rewrite V57 or deploy an unverified split tree.

After scope resolution, refresh dev/prod, promote the verified application tree normally, verify both deployed revisions, Flyway, health, authenticated Web reads and Bridge enrollment. Do not clean PROD MONEY.

## Android and short real-device acceptance

Android repo: `D:/DEV_SPACE/money-sys-mobile`, branch `codex/money-sys-batch4`, final `b49c96a1ac0050791976650705318a2db6a1f01c`, implementation `269a6ca`. No Android source/config changes during resume; no rebuild/reinstall. No Android remote is configured; preserve local history and signing key.

Production APK: `D:/DEV_SPACE/money-sys-mobile/app/build/outputs/apk/production/app-production.apk`.
SHA-256: `ED6FC12E7E55F72627E6B476B433BE5E0F9062C7D131CF9C5E11A50DD877C46B`.
Minimum Android8/API26, compile/target35. Prior validation: 51 JVM tests; debug/production builds and lint pass (zero errors, 18 warnings each); Flip6 Android16 debug four checks pass, production three applicable checks pass and DEV fixture skipped.

Production APK is installed, PROD selected, Bridge OFF, no PROD enrollment. It is non-debuggable but uses the existing local POC signer for owner updates, not a dedicated store key. Instrumentation APK and USB reverse were removed. Public TLS401 is not authenticated PROD proof.

After deployment, owner opens authenticated MONEY Web Settings → Connection, issues a private one-use code, enrolls the phone, confirms Notification Access, selects supported banks and enables Bridge. Financial transport must be normal Internet → HTTPS → Railway PROD; never USB reverse/local TLS. The owner performs real bank actions, never the agent.

For Shinhan, IBK, Woori and KakaoBank verify callback, queued/sent, authenticated ingest, one logical raw source, parser result, account resolution or Review Required, matcher/ledger where applicable and visible Web result. Reconcile expected transfer sides and duplicate/missing counts structurally without names, account identifiers or bodies. All four PROD results/counts remain pending/unknown, not zero.

Close Batch 4 after this short acceptance and Drive closeout. Hand off directly to Mobile MVP; a prolonged observation period is not a prerequisite. Do not implement Mobile MVP automatically.

## Known limits and retention

Credentials need renewal after 30 days. Android redaction, force-stop, pre-unlock reboot and OEM controls can prevent/delay capture. WorkManager is eventual delivery; injected offline/queue-reopen tests do not prove long-term OEM reliability. A bank allowlist cannot distinguish security/OTP alerts. Queue cap1000 fails visibly; structural history cap200. Store signing and Android remote hosting remain operational limits.

Retain MONEY worktree/branch/artifacts for active release/acceptance, then clean them after ownership checks. Preserve main-checkout user changes and unrelated tracks. Drive authority: `Kafka_AI_WorkSpace/10_POS/09_MONEY_SYS/40_CLOSEOUT__MONEY_SYS_BATCH4_PROD_BRIDGE`.
