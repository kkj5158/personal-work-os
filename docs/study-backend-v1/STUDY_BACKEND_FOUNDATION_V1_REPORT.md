# STUDY Backend Foundation V1 — Implementation Report

Started: 2026-11-09. Closeout: 2026-11-10, Asia/Seoul. This report distinguishes code, tests, runtime and release facts.

**IMPLEMENTED / TARGETED TESTS PASS / ISOLATED DEV VERIFIED. HOSTED DEV RELEASE AND OWNER ACCEPTANCE BLOCKED. NO PROD DEPLOYMENT BY THIS TASK.** V1 is not represented as fully accepted while the hosted gates below remain open.

## Scope and implementation

Implemented a real authenticated Spring Boot/JPA backend behind the existing STUDY frontend. The five primary tabs, renderer registry, dedicated wide online/handwritten workspaces and unrelated POS navigation remain. `?demo=1` continues to select isolated authored public samples; real workspaces start empty and never import demo state.

- Owner-scoped PostgreSQL persistence, additive Flyway V104, referential/version constraints, server UTC timestamps, KST weeks, workspace concurrency and scoped idempotent operation receipts.
- Material metadata with retained versions, private original PDF storage, streamed authenticated downloads, a separate study object namespace and truthful storage-disabled behavior.
- Manual dynamic question/answer-key imports, immutable workbook versions, actual PDF-byte validation, explicit answer review and atomic matching pair publication.
- Debounced persistent online drafts, empty-answer removal, false boolean handling, immutable online/handwritten submissions and union-based progress/history. Real handwritten files remain durable and revisit-able. No grading is fabricated.
- Pending Coach feedback, manual proposal cards, approve/reject, effective/expiry scope, policy versions, rollback as a new version and saved automation preference with disconnected execution status.
- Loading, saving, unauthorized, empty, network failure/conflict and retry states in the server adapter. Failed operations are not announced as durable saves.

No AI generation, OCR, extraction/indexer, automatic PDF rendering, AI grading, Sunday job or email delivery was implemented. A working persistence backend is not an operating AI Learning Agent.

## Architecture and migration

The modular monolith is preserved. `study` contains JPA repositories/entities, validation, transaction/application service, HTTP controller, errors, response limits and the private file lifecycle. Existing auth, user provider, API client and S3 SDK infrastructure are reused. The only shared storage change is an explicit namespace constructor; default Shared Desk behavior remains unchanged and has affected regression coverage.

V104 adds four tables: `study_workspaces`, `study_workbooks`, `study_records`, `study_assets`. Typed records persist material metadata versions, drafts, attempts, policies/proposals, feedback, review events, preferences and operation receipts. Workbook foreign keys include owner identity. RLS denies browser table access, protecting private keys from direct database API bypass. No existing migration, application data, auth setting or unrelated schema is rewritten.

Workbook/public question payloads and private answer keys are stored separately. Files are stored privately as actual object bytes, not database blobs. Published workbook versions and attached originals cannot be changed through the application. The original canonical frontend contract required a narrow extension: server mode, asynchronous mutations, connection/revision metadata and authenticated document references. The UI hierarchy and question/response identity remain intact.

## Sources and environment audit

Read the attached `POS_STUDY_BACKEND_FOUNDATION_V1_CODEX_PROMPT.md`, repository/global AGENTS and applicable agent Git/validation/release/DEV rules, laptop browser policy, current STUDY source/port, backend auth/JPA/Flyway and existing storage integration. Read the three specified frontend handoff files from Kafka_AI_WorkSpace and verified their repository equivalents.

Canonical TEAM KAFKA policy was accessible: document `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU`, modified 2026-10-25T02:05:15.433Z; relevant execution/scope/verification sections were read. This does not claim delivery to ChatGPT Work or change any Project settings. Reference document instructions did not expand implementation or release authorization.

The dirty primary checkout was old `main` at bcf12c5, with existing local settings/package-lock edits and an untracked AGENTS file. It was preserved. Work began from `origin/dev` e9fe87f in `feat/study/backend-foundation-v1`, an isolated worktree. Concurrent Shared Desk backup changes were merged normally from refreshed `origin/dev`; their infrastructure and pending work were not claimed as this task's delivery.

Initial hosted DEV API/Web were 558e44a; initial PROD API/Web were observed at e0c71f4 with successful deployments 926c8c24-1487-41d3-9c33-cc5d01e95d3e / 6f3354a9-51ad-44fb-ae77-f38ca3d739f6. A concurrent Shared Desk track subsequently changed DEV runtime and added backup/restore resources. Re-read current metadata before any release. This task has no PROD deployment authorization.

## Verification already observed

| Check | Observed outcome / boundary |
| --- | --- |
| STUDY PostgreSQL/JPA | 8 tests passed on owned loopback PostgreSQL, including owner isolation, response/version rules, durable protocol metadata, publication and policies |
| Migration | Dedicated PostgreSQL test passed atomic rollback, preserved pre-existing sentinel data, Flyway migrate/validate/repeat and four RLS tables |
| Byte validation | 2 tests passed valid PNG/JPEG, truncation/spoof/digest rejection and active PDF rejection |
| Auth and affected storage | Hosted JWT-chain rejection tests plus existing security profile and storage policy/adapter tests passed |
| Server adapter | 2 tests passed autosave serialization, false/empty behavior, deliberate review and identical uncertain-network retry |
| Existing STUDY/shell frontend | 26 tests passed; existing React act warnings from the handwritten test are recorded, not browser failures |
| TypeScript / scoped lint / build | Passed during implementation; final-candidate rerun recorded below |
| Full fresh application migration | Owned local runtime applied the full repository migrations through V104 and passed Hibernate schema validation |
| Actual DEV object provider | Four synthetic PDFs uploaded, finalized, re-read and hash-checked: source, question, answer and handwritten. Answer PDF rejected before review; real matching pair published. No mocked provider claim |
| Official browser | Five tabs, desktop solver, mobile solver/handwritten, durable draft after refresh, pending feedback after refresh, explicit answer reveal, historical file link, hybrid required completion 2/2 and no extension inflation |
| Mobile / console | At 390px: body 375px, no dialogs or horizontal overflow; console 0 errors/0 warnings in the owned local run |

The actual-provider and browser run at clean revision 7e2d30c0d31500179e90f69e6940a17ba866d778 used its own local business database, existing DEV storage and conventional loopback dev identity. It did not connect to the shared business database. It is not evidence of owner relogin or hosted authenticated browser upload. Provider CORS was not changed. Final-candidate/source differences and hosted checks must be stated below.

## Failed checks and corrections

Early integration runs found and corrected a test datasource initialization issue and direct field access on a Spring transaction proxy. A local runtime readiness probe initially used the existing dev-denied health URL; the harness now probes an allowed STUDY endpoint without changing auth. The initial parallel frontend test invocation reported one file-level harness failure while its assertions passed; serialized targeted reruns passed. Full frontend regression outcomes and any unrelated failures are retained in evidence.

Screenshot evidence covers actual locally running implementation with synthetic learning content. File-byte durability was verified through the real provider API protocol, while local browser file PUT is not claimed: existing provider CORS permits the hosted DEV origin only. The optional provider-cleanup test is opt-in and intentionally skipped in ordinary unit runs.

## Final revision, release and cleanup

Implementation/application candidate: **51ffe5b98060416e78e990c66463a1bf652bc6f1** on `feat/study/backend-foundation-v1`. Draft PR: https://github.com/kkj5158/personal-work-os/pull/8 . Source is pushed and reviewable. It has not been merged into dev while the other release owns the critical section. Later closeout commits contain documentation/evidence only; application tree identity is recorded in evidence.

Final backend targeted run: **34 passed, 0 failed, one optional provider-cleanup test skipped**, revision 51ffe5b98060416e78e990c66463a1bf652bc6f1. Application/test code was committed; only documentation/evidence edits were pending, so the runner correctly records dirty=true. The final guards reject out-of-range/wrapped version, revision and size claims; valid workbook/file behavior is unchanged. Final frontend targeted run: **28 passed**, scoped lint and the production build/TypeScript passed at 3fe6796. Full fresh Flyway/JPA startup, real DEV provider and official desktop/mobile browser verification passed at b927a0b. The final frontend-only change makes real-workspace copy generic and hides the legacy demo-only material chooser; solver, handwritten and Coach evidence screens are unchanged. The final sparse manual workbook correctly displayed Tuesday 2026-11-10; draft and pending feedback survived refresh. Final healthy browser console had zero errors/warnings.

Final real-provider run: `study-runtime-00274fa0-4fed-4589-a089-a919054bbee1`, clean b927a0b, own loopback PostgreSQL and four actual private PDF objects. Prior successful run `study-runtime-c2c78dac-829f-4fbc-b1e7-8c7ad3134307` was clean 7e2d30c. Earlier screenshots/results remain historical. The final screenshots use b927a0b. See `evidence/VERIFICATION_SUMMARY.json`, `TEST_COMMANDS.md` and sanitized logs for exact scopes.

Whole frontend generic discovery: **708 tests, 693 passed, 15 failed**. Six standalone scripts pass using their documented native transform-types runner. All remaining nine substantive failures reproduced on an exported, unmodified origin/dev baseline (29 tests: 20 passed, 9 failed). No STUDY fix was expanded into unrelated Calendar/Notes/Workpad repairs.

Whole backend default attempt: **1502 tests, 942 passed, 4 failed, 556 skipped** without the environment required by legacy integration suites. A rerun against our owned local DB passed all **90 Sleep PostgreSQL tests**; the remaining BackendApplicationTests failure is the unchanged DietMeasurementQaApplication test fixture's `qaUser` / `devCurrentUserProvider` collision on the test classpath. The actual main-only production jar starts and validates successfully. Upstream 79d11ad also changes the Diet QA fixture; recheck this old-head failure after the required merge. The full project is not claimed green.

**Hosted DEV release gate:** the shared critical section remains held by other release work. It was first held by Shared Desk (`shared-desk-prod-20261109`, PID 36500); ORBIT then owned it (`orbit-release-9f768bc9-5378-421d-9b6d-8b1a611aac2e`, PID 33716, acquired 2026-11-09T15:18:14.596Z), and the latest observed owner is again Shared Desk (`shared-desk-prod-20261109`, PID 6284, acquired 2026-11-09T15:23:09.015Z). Shared Desk and ORBIT work are preserved. This task did not remove/steal the lock, stage pins/variables, run a shared DB migration, deploy DEV or accept an environment patch. It also did not deploy or mutate PROD. This is release serialization, not an automatic approval rejection.

Observed hosted DEV at 2026-11-09T15:08:01Z: API ae0de7c6-ecff-47a0-a21a-b63a0b63d613 / source 7c77e08f434615d6a2610fe116af3c14e4eb9d9d; Web f1c79731-b193-462c-b060-40c1527723db / source 558e44aab25ede324bcd811505fced776ea22c8c. Both successful, neither is the STUDY backend candidate. Configuration pins and DB application history were not inferred from those runtime hashes. Shared DEV V104 application was not performed or certified by this task.

**Next concrete release action:** after the current owner releases the lock, refresh/merge latest dev and reconcile the V104 slot/history read-only; integrate PR #8 and rerun affected checks on that integrated revision; enable only the DEV API's STUDY_STORAGE_ENABLED against the verified DEV provider; deploy the exact reviewed candidate with existing scoped GitHub pin workflow; verify Flyway and normal owner JWT login/relogin, desktop/mobile native upload, private download, draft resume and shared navigation. Remote dev advanced to 79d11ad (ORBIT APIs) during closeout and is not included in this tested feature head. Do not deploy the old head over newer shared functionality; validate the combined candidate. Do not include an unrelated staged patch. PROD still requires separate authorization.

**Explicitly unrun:** hosted owner login/relogin and native browser byte upload; real timed ten-minute PUT expiry; actual maximum-size 20/100 MiB provider load; shared DEV migration/data-preservation audit and whole shared DEV regression while the foreign release lock is held. Automated structural limits and SDK ticket timing are not mislabeled as those real external checks.

Owned local browser tabs were closed, owned backend/frontend/PostgreSQL processes were stopped, their ports released, and all four synthetic objects per successful run received exact staging/final deletion acknowledgments (eight keys per run). Other tabs/processes/resources and the foreign release lock were preserved. Local synthetic DB directories are excluded from the evidence archive and remain local. An attempted native PowerShell recursive cleanup of those run-owned directories was rejected by automatic approval review as `blocked by policy`, with no more specific reason returned. No alternate deletion method or permission bypass was attempted; this does not reverse the successful server/port and exact-key DEV object cleanup. The feature worktree/branch is retained specifically for the pending hosted release and PR; the original dirty primary checkout is preserved.

Delivery destination: Kafka_AI_WorkSpace / 10_POS / https://drive.google.com/drive/folders/1MD3rGK4yVc0utyexuBKMdktC5F-YWGMF . Reports are uploaded individually with a dated sanitized evidence archive; final observed metadata/checksums and file links are recorded in DRIVE_DELIVERY.json. Uploading these artifacts does not certify the unrun release gates.

## Follow-up and limits

See `STUDY_BACKEND_API_CONTRACT.md` for actual endpoints and manual PDF metadata, and `STUDY_V2_ENGINE_HANDOFF.md` for the next engine phases. Current file screening is not a malware scanner. Snapshot paging and worker claim/verification transactions should be designed before large automated workloads. Reconciliation is explicit, not a new STUDY scheduled job. Shared provider access alone does not certify a complete STUDY production backup/restore policy.

## Execution metrics

- Agent/model: Codex / exact runtime model identifier unavailable.
- Task: POS STUDY Backend Foundation V1.
- Elapsed time: exact initial turn start was not recorded; unavailable, not estimated. Verification timestamps are retained.
- Token usage: unavailable; not estimated.
- Full QA runs: one whole-frontend discovery and one default whole-backend attempt; neither is a passing Central Full QA. Targeted, baseline and configured reruns are separately recorded.
- Retry/blocked events: implementation corrections and any final gates stated above.
- Main bottleneck: exact-runtime/browser/storage integration and broad legacy frontend tests.
- Suggested workflow improvement: keep a reusable synthetic STUDY API/provider/browser runner and an approved hosted QA login path.

PDF parser dependency: Apache PDFBox 3.0.8, using its [official Loader migration guidance](https://pdfbox.apache.org/3.0/migration.html) and [published release](https://pdfbox.apache.org/download.html). No application PDF renderer was added.
