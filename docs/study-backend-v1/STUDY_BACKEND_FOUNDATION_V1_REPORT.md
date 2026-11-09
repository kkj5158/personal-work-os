# STUDY Backend Foundation V1 — Implementation Report

Date: 2026-11-09, Asia/Seoul. This report distinguishes code, tests, runtime and release facts. Final verification/release receipts below will be updated before delivery.

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

PENDING FINAL READBACK. The final closeout will record implementation/tested commit, exact commands and counts, hosted DEV deployment or blocker, unrun checks, object/process cleanup, retained worktree reason and verified Drive delivery. PROD deployment remains NOT PERFORMED by this task.

## Follow-up and limits

See `STUDY_BACKEND_API_CONTRACT.md` for actual endpoints and manual PDF metadata, and `STUDY_V2_ENGINE_HANDOFF.md` for the next engine phases. Current file screening is not a malware scanner. Snapshot paging and worker claim/verification transactions should be designed before large automated workloads. Reconciliation is explicit, not a new STUDY scheduled job. Shared provider access alone does not certify a complete STUDY production backup/restore policy.

## Execution metrics

- Agent/model: Codex / exact runtime model identifier unavailable.
- Task: POS STUDY Backend Foundation V1.
- Elapsed time: to be finalized from recorded start/closeout times.
- Token usage: unavailable; not estimated.
- Full QA runs: final whole-suite outcomes recorded in evidence; targeted reruns distinguished.
- Retry/blocked events: implementation corrections and any final gates stated above.
- Main bottleneck: exact-runtime/browser/storage integration and broad legacy frontend tests.
- Suggested workflow improvement: keep a reusable synthetic STUDY API/provider/browser runner and an approved hosted QA login path.
