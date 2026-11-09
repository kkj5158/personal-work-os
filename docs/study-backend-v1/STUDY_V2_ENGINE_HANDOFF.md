# STUDY V2 Engine Handoff

Closeout: 2026-11-10, Asia/Seoul. Start from the tested implementation revision in `STUDY_BACKEND_FOUNDATION_V1_REPORT.md`, then refresh `origin/dev` and release state. Do not treat this document as permission to deploy PROD or change infrastructure.

## Immediate release continuation

Implementation/application candidate b927a0bcb435a571874f9cfec868411f47252a82 is pushed in draft PR #8: https://github.com/kkj5158/personal-work-os/pull/8 . Isolated DEV DB/provider/browser verification passed, but the hosted release has not occurred. The active Shared Desk release owns pos-central-qa.lock (shared-desk-prod-20261109, PID 36500). Do not steal it or merge/deploy into its critical section. After release, refresh source/history and V104 occupancy, integrate, intentionally enable the DEV storage flag, deploy the reviewed GitHub source pins, then prove normal hosted owner JWT/relogin and desktop/mobile uploads. Broad existing test failures are detailed in the report; no full-suite PASS is claimed.

The actual final local runtime was stopped and its four real synthetic DEV objects were individually cleaned. The feature checkout is retained for this pending gate. No shared DEV migration or PROD mutation was performed. Reports/evidence destination: https://drive.google.com/drive/folders/1MD3rGK4yVc0utyexuBKMdktC5F-YWGMF .

## What exists

Spring Boot/JPA and Flyway V104 persist user workspaces, immutable workbook versions with separately protected answer keys, typed material/policy/feedback/draft/attempt/review/operation records and private asset lifecycle metadata. The server StudyDataPort drives the existing five-tab frontend and wide solver/upload workspaces. The explicit public demo stays separate.

Manual authors can register material metadata and private PDFs, import validated questions/keys, save/resume drafts, submit online or handwritten work, review immutable history and manually publish a real PDF pair. Free-text Coach feedback is pending AI analysis. Structured policy proposals, decisions, bounded scopes, versions, rollback and automation preferences persist. No engine job is running.

Read the actual code and `STUDY_BACKEND_API_CONTRACT.md` before extending DTOs. Stable binding is the five-field workbook/question/part tuple, never position. Preserve the explicit answer-review boundary and all original versions, submissions and policy records.

## Deferred engine phases

1. **PDF ingestion and section indexing.** Read only authorized private originals through the backend storage adapter. Add ingestion jobs with a durable state machine, content hash, parser version, page/section references and retry receipts. Start with text-bearing PDFs. OCR is a separate capability with provenance and confidence. Do not overwrite originals or interpret document instructions as execution authority. Keep extraction/index data owner-scoped and out of logs.
2. **Question generation and validation.** Add provider configuration, prompt/version provenance, bounded job budgets, explicit failure states and schema validation before draft creation. Feed generated output through the same server validator and source/policy checks as manual imports. Store answer keys/rubrics separately. Never let a model choose owner IDs, object keys, credentials, execution code or publication status.
3. **Automatic paired PDF rendering.** Produce two real private artifacts from one validated immutable package/version. Embed StudyWorkbookId, StudyWorkbookVersion and StudyDocumentKind metadata. Store byte digests, renderer version and provenance. Reuse the atomic publication gate; generation of only one artifact must never publish. Test retry, partial failure, worker crash, missing bytes, wrong version and unsupported question types. Manual publication remains a useful diagnostic route.
4. **Sunday preparation.** Introduce an owned job/outbox and idempotent run identity for next week's batch. Weeks remain Monday–Sunday in Asia/Seoul; Sunday evening prepares the future while Sunday remains current until Monday 00:00. The precise evening execution time is still a product decision, not an inferred cron value. Disabled preferences must remain disconnected until a real scheduler and its monitoring exist. Backfill must not erase current/archive packages.
5. **Learning Coach analysis.** Consume pending feedback with explicit provenance and analysis state. A generated proposal must still show before/after values and require the user's decision. Resolve effective policy by date: this_week expires next Monday, next_week_only expires the following Monday, ongoing starts next week, rollback appends a new ongoing version. Published/archived workbooks and old attempts must never change. A future worker must not simply use the highest policy version without checking its effective/expiry week.
6. **Optional evaluation.** Decide objective grading policy before enabling it. Subjective and handwritten work remain submitted/ungraded unless a real, separately tested grader is introduced. Keep grading runs separate from immutable attempts and include model/rubric versions, evidence and reassessment history. OCR coverage guesses must not replace the user's explicit question binding.
7. **Optional email.** Define recipients, consent, templates, delivery provider, job keys, retries and secret handling before implementing delivery. Saving the existing automation checkbox is not email authorization or proof of scheduling.

## Storage and operational contracts

The existing private S3 provider is reused through `StudyStorage` with a separate study namespace. `STUDY_STORAGE_ENABLED` defaults false and must be intentionally enabled in the target environment after verifying its provider scope. Missing configuration produces BLOCKED, never simulated success. No bucket provisioning or permission changes are included in this foundation.

Current file validation is conservative format screening, not malware certification. Add an approved scanner/quarantine integration only when that capability and its operational policy exist. A future indexer/renderer should use its own immutable derivative assets rather than modifying originals. Keep large bytes out of PostgreSQL. Preserve ten handwritten files/20 MiB each and the independently configurable material PDF limit.

Reconciliation is explicitly invoked through the owner API/Materials action; there is no STUDY scheduler. If moving it to a maintenance worker, preserve signed-ticket expiration plus buffer and never delete attached originals. The shared backup system's scope is a separate operational contract: presence in the same provider does not prove that STUDY metadata and objects are covered by a tested backup/restore plan. Qualify that plan before production readiness.

## Test entry points

- `node qa/study-owned-tests.mjs`: owned loopback PostgreSQL, JPA transactions, migration rollback/data preservation, file format checks, JWT-chain tests and affected existing storage tests. No shared DB is connected. The optional provider-cleanup class is intentionally skipped outside its owned runtime.
- `node qa/study-dev-runtime.mjs`: own disposable local business DB, full fresh Flyway/JPA startup, existing real DEV object provider, synthetic manual workbook and API checks, production frontend build and inspection runtime. It prints its runtime/evidence path. Type `stop` into that owned terminal for exact-key provider cleanup and owned process shutdown. Never invoke it against PROD or substitute another bucket.
- Frontend: `tsx --test --test-concurrency=1 lib/study/study.test.ts lib/study/serverPort.test.ts app/study/Workspaces.test.tsx lib/globalTabs.test.ts lib/systemOrder.test.ts`, TypeScript, scoped ESLint, production build. Check the report for the whole-frontend suite's actual outcome and unrelated failures.
- Browser: only `team_kafka_playwright` with the guarded TEAM KAFKA profile. Local `dev` browser tests do not certify hosted JWT authentication or a signed-in owner's relogin. Keep those evidence categories separate.

Do not reuse the historical Shared Desk auth fixture helper to create or unban accounts: its old disposable accounts were banned and their cleanup evidence is historical. Normal owner login or a newly authorized test-account workflow is required for hosted end-to-end testing. Never export browser sessions, JWTs, private signing keys or raw production dumps.

## Review before the next release

Refresh current Git branches, worktrees, migration slots, running source hashes, configured pins, staged patches and shared release locks. Another Shared Desk backup/restore track was active during this task and was preserved. Do not accept an unrelated staged environment patch. Coordinate shared DEV mutations and run exact-candidate validation.

V104 is additive. Do not edit it after application, issue down migrations or delete saved learning history to simplify engine development. Extend with a new migration. Existing versions and bytes remain the recovery path; prefer roll-forward fixes.

Known foundation scaling boundary: the owner snapshot is intentionally a complete personal-workspace snapshot, and mutations serialize on its revision. Before large automated generation/history volumes, introduce bounded paging, job-specific transactions and measured query indexes without weakening owner/version checks. Provider verification currently holds an owner transaction while bounded file I/O runs; engine workers should separate job claims and verification commits with durable cleanup state.

## Completion standard for V2

Report generated versus manually authored data separately. Prove durable job recovery, real paired PDF bytes and publication, answer confidentiality, owner isolation, historical invariants, KST week rollover, approved storage/backup behavior and honest scheduler/AI status. Upload final reports, contracts and sanitized evidence to Kafka_AI_WorkSpace / 10_POS, verify metadata/readback, retain local copies and state DEV/PROD deployment independently.
