# MONEY Batch 4 — Central Integration/QA handoff

**Worker implementation and non-browser validation complete. Browser gate pending
Central Integration/QA. No merge or PROD deployment is authorized until that gate
passes.** This checkpoint is not Batch 4 PROD completion or a MONEY product defect.

## Revisions and retained artifacts

- POS branch: `codex/money-sys-batch4`, implementation commit
  `72758161def015f87c801cba22ba02a2995246f4`; subsequent changes are documentation.
- POS worktree: `D:/DEV_SPACE/personal-work-os-worktrees/money-sys-batch4`.
- Base DEV: `529a89dc43ef8318477ee19d395e607cd881ebc3`.
- PROD remains `9e9e3ab0b3c9e08c3bdbdb3ff80a7bc45b6aeb02` (Batch 3).
- Android: `D:/DEV_SPACE/money-sys-mobile`, branch `codex/money-sys-batch4`;
  final commit `b49c96a1ac0050791976650705318a2db6a1f01c`, application code
  `269a6ca9a360cbf13308e5bdbd10ef8cb9683e94`. No Android Git remote is configured;
  local commits are retained. Remote destination remains unresolved.
- Ready frontend build: POS worktree `frontend/.next`, built for DEV and
  `NEXT_PUBLIC_API_BASE_URL=http://localhost:18156`.
- Backend JAR: `backend/build/libs/backend-0.0.1-SNAPSHOT.jar`.
- Production APK: `D:/DEV_SPACE/money-sys-mobile/app/build/outputs/apk/production/app-production.apk`.
  SHA-256: `ED6FC12E7E55F72627E6B476B433BE5E0F9062C7D131CF9C5E11A50DD877C46B`.
- Debug APK: `D:/DEV_SPACE/money-sys-mobile/app/build/outputs/apk/debug/app-debug.apk`.
  SHA-256: `2791247AD3A58B472C316739DAA9EFE7D1E1BFF320A82489852A7397824DDBB9`.

The non-debuggable production APK is installed on the Galaxy Z Flip6/Android 16,
PROD selected and Bridge OFF, without PROD enrollment. It uses the existing local
POC debug signing key for in-place updates; it is not a Play Store release/key
management solution. Do not uninstall the app to change variants: use `adb install
-r` with the same signer. Keep the local signing key private and stable.

## Changed scope and security contract

The existing MONEY ingest/parser/matcher/ledger pipeline remains canonical.
Only Bridge enrollment/authentication, structural connection status, and Android
transport were added. See [Bridge contract](money-sys-batch4-bridge.md).

Authenticated Web owners issue five-minute single-use enrollment codes at
`POST /api/money/bridge/enrollments`. Android exchanges one at
`POST /api/money/bridge/exchange` for a 30-day owner/install credential. Digests
only are stored server-side. Existing Supabase Web authentication is preserved.
Bridge credentials authorize only POST to `/api/money/notifications`; they cannot
read financial data or manage devices. Owner/install identity is server resolved.
GET `/api/money/bridge/devices` and DELETE `/api/money/bridge/devices/{id}` are
owner-scoped Web operations. Re-enrollment rotates the credential; revocation
blocks subsequent authenticated requests. Enrollment replies use no-store.

V56 `money_bridge_credentials` is already applied successfully to shared DEV.
Normal final startup validated 55 migrations, current version 56, no pending
migration. Preserve its applied contents. Earlier mapping remains V51 Checklist,
V52 absent, V53 Diet, V54 MONEY processing, V55 MONEY product. Do not renumber V56
or run repair. Refresh origin/dev and shared history before integration; stop on
an applied-version collision. PROD has not received V56 in this Worker task.

Android retains the installed four-bank allowlist and NotificationListenerService.
Keystore AES-GCM encrypts credentials and durable SQLite outbound bodies.
WorkManager performs network-constrained delivery/backoff/recovery; stable keys
and bodies survive retries. Auth/permanent failures stop, transient failures
retry. Bodies are erased after successful delivery. PROD uses the fixed public
HTTPS endpoint with system trust; debug-only DEV uses localhost TLS/USB reverse.
Bridge defaults OFF. Diagnostics are structural; only enrollment input is secure
against screenshots. Empty aggregate filtering requires all documented reliable
metadata conditions; uncertain callbacks remain eligible.

## Completed validation

| Area | Result |
| --- | --- |
| Backend final MONEY + common security tests | 64 passed; 1 historical opt-in audit skipped; 0 failed |
| Backend bootJar | Passed |
| Shared DEV normal startup / Flyway | 55 validated, current V56, no pending; API HTTP 200 |
| Android JVM/Robolectric | 51 passed |
| Android assembleDebug / assembleProduction | Passed; production signature verified, non-debuggable |
| Android lintDebug / lintProduction | Each 0 errors, 18 warnings |
| Hardware debug instrumentation | 4 passed on actual Flip6/Android 16 |
| Hardware production instrumentation | 3 applicable checks passed; DEV fixture skipped |
| Frontend focused tests | 8 passed |
| Frontend lint / TypeScript / optimized build | Passed |
| Functional browser gate | Pending Central Integration/QA |
| Authenticated PROD / four-bank real financial proof | Pending deployment, enrollment and owner device actions |

Hardware checks cover actual Keystore/context integrity, public PROD TLS with
anonymous ingest rejected (401), Activity startup/screenshot policy, and synthetic
authenticated DEV exchange → ingest → duplicate retry → revoke/reject. Three DEV
runs each produced exactly one raw source and one duplicate response. Scheduler
processed each as REVIEW_REQUIRED, with zero ledger entries. All three owned
sources/parse attempts and revoked test credentials were subsequently removed.
No real captured notification body was inspected or committed by these tests.

Offline/recovery is tested with injected IOException and persistent queue reopen;
this is not proof of physical airplane-mode, actual OS process-kill or long-term
OEM battery behavior. Public PROD TLS 401 is not authenticated PROD delivery.
Four-bank PROD duplicate/missing counts remain unknown until the real test.

Backend evidence: `backend/build/batch4/final-tests.log`, test-results/test XML,
and `dev-https-final.log`. Android evidence: `.local-dev/batch4-final-build.log`
and app test/lint reports. Build/log directories are ignored, local QA artifacts.

## Runtime requirements for Central QA

The Worker has stopped its backends on 18156 and 8443 and released their pools.
No frontend3016 was started. Central QA owns the next runtime lifecycle. Do not
restart or replace another track's runtime. Inspect port ownership before use.

Use canonical authorized DEV environment setup; required existing variables are
`DEV_DB_URL`, `DEV_DB_USERNAME`, `DEV_DB_PASSWORD`, `APP_DEV_USER_ID`. Values must
not be printed, copied to handoff files, or requested through chat. Use JDK21;
the validated local JDK is `C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot`.
Keep Flyway enabled. For browser validation set:

```text
SPRING_PROFILES_ACTIVE=dev
SERVER_ADDRESS=127.0.0.1
SERVER_PORT=18156
APP_DEV_ALLOWED_ORIGINS=http://localhost:3016,http://127.0.0.1:3016
SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=2
SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=0
```

Run the built JAR directly in the central owned session. Do not expose the DEV
profile publicly. The frontend build needs a central supported runtime at 3016
with the same API 18156; changing its public environment requires rebuilding.
This Worker found package scripts dev/build/start/lint and unrelated test scripts,
but no Playwright/Cypress/managed webServer runner. Automatic approval review
rejected the direct foreground Next start on 3016. Central QA must use its approved
lifecycle; no detached launch workaround or repeated user-start request is part
of this handoff. The old Batch3 frontend/revision cannot satisfy this gate.

For optional repeat phone DEV testing use the debug APK and loopback TLS 8443 with
the existing ignored `.local-dev/dev-local.p12` and locally protected password.
Reuse only canonical safe TLS/environment setup; do not use the historical
detached launcher or its migration-disable option. The phone test needs USB reverse
only for DEV. Remove it before PROD proof. Hardware test commands are documented
in Android README. The isolated `money_batch4_validation` schema was removed;
recreate an owned isolated test schema before rerunning DB integration tests,
never point those fixture tests at shared public schema by mistake.

## Required browser gate and release sequence

1. Confirm the central frontend serves this exact feature tree and talks to its
   matching backend. Open MONEY Settings → Connection; device empty/list/error
   states render without exposing financial bodies or credential material.
2. Issue an enrollment code. Verify visible copy/input flow, no-store response,
   code removal when the page is hidden and after expiry. Exchange once with the
   DEV phone; confirm reuse/expired code rejection, then device appears on refresh.
3. Submit a sanitized nonfinancial diagnostic source; inspect accepted/duplicate
   counts and last receipt. Confirm Review Required without a ledger transaction.
4. Revoke through the UI confirmation. Verify subsequent Bridge ingest is 401,
   phone auth failure is visible and automatic attempts stop. Re-enroll the same
   installation, verify token rotation and manual recovery without duplicate raws.
5. Confirm owner isolation/ingest-only scope remains correct and existing MONEY
   accounts, transactions, review and settings routes still render. Do not create
   unnecessary financial fixtures. Check browser console for actual new defects.
6. Fix actual defects and rerun affected tests/builds/browser checks. Refresh latest
   dev and migration history; only after the browser gate passes merge to dev and
   promote the same verified revision under the current production workflow.
7. Verify PROD startup/Flyway V56, health, existing Web authentication and MONEY
   routes. Perform minimum safe sanitized authenticated transport validation,
   keeping all diagnostic financial ledger entries at zero and cleaning owned
   test sources/credentials afterward.

## Remaining real-device acceptance

After release, the owner enrolls the installed production APK from authenticated
PROD Web, grants notification access, selects bank apps and enables the Bridge.
No USB reverse, developer certificate or local server may carry PROD requests.
The owner performs the small real bank transactions; agents do not operate banking
transfers. Configure real accounts through the product rather than source code.

For each of Shinhan, IBK, Woori and KakaoBank record capture, raw exactly-once
identity, parser state, account resolution, pairing/ledger or Review Required,
Web visibility, duplicates and missing sources. Reconcile expected transfer sides
without putting names, full account identifiers or notification bodies in reports.
Observe a physical network interruption/reconnect and restart with pending work.
Only then can Batch4 be closed and a separate real-usage observation phase begin.
Mobile MVP and spending-habit work remain out of scope.

## Risks, cleanup and ownership

- Credentials expire after 30 days and require manual renewal. Revocation does not
  cancel already-authenticated in-flight requests.
- Android redaction, force-stop, pre-unlock reboot and OEM battery policy can
  prevent/delay callbacks. WorkManager is eventual delivery, not a realtime SLA.
- Allowlisting bank packages cannot distinguish transaction alerts from that
  bank's security/OTP notifications. Android restrictions are respected.
- Queue cap 1000, visible capture-error counter on overflow/storage failure;
  no silent eviction. Successful structural history is capped 200.
- Dedicated release signing/Android remote destination remain operational limits;
  the existing local signer and local Git history must be preserved.
- Worker-owned synthetic DB rows, revoked test credentials and empty isolated
  schema are removed. Flyway history is unchanged by cleanup. Both owned backend
  processes are stopped; instrumentation APK uninstalled; USB reverse 8443 removed.
- Feature worktree/branch, frontend build, APKs and Android repo remain because
  they are the active Central QA handoff. Do not remove them before integration.
  Frontend node_modules is a junction to the main checkout: preserve its target.
- Unrelated main-checkout changes, Checklist/Diet worktrees and Batch3 runtime
  ownership were preserved. Central QA inherits final merge/release cleanup only
  after validating ownership and preserving other tracks' work.

Drive checkpoint: `40_CLOSEOUT__MONEY_SYS_BATCH4_PROD_BRIDGE` under
`Kafka_AI_WorkSpace/10_POS/09_MONEY_SYS`. Its status and the MONEY index remain
Worker ready / Central Integration/QA pending until the remaining evidence exists.
