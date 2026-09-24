# MONEY SYS Batch 2 closeout

Backend implementation and DEV validation complete. Integration target: `dev`.

- Base: `280d304e6ccb59d02a8fc29e902db24c97bc8479` (Checklist/Diet migration reconciliation).
- Implementation commit: `a9bdb068eb5337918e6dceff128424533c8581a3`.
- Migration: `V54__money_processing_schedule.sql`; V51 remains Checklist, V53 remains Diet. No Flyway repair by MONEY.
- Parsers: `shinhan-push`, `ibk-push`, `woori-push`, `kakao-push`, all `1.0.0`.
- Matcher: `1.0.0`; exact account resolution, symmetric unique pairing, explicit single-raw route, auxiliary provenance.
- Trigger: durable raw-row due time, five-second scheduler, two-minute matching wait, per-owner transactional advisory lock.
- Policy/limits: [Batch 2 contract](money-sys-batch2.md).

Validation:

- Final shared-DEV run: 46 tests passed (34 MONEY and 12 security/error-handler tests), no failures/errors/skips; bootJar passed. Earlier isolated-schema validation also passed.
- Read-only real audit: all 18 raws parse; ten transfer proposals match the exact expected source groups and preserve 18 sources / 20 logical sides. No real ledger posting or raw mutation.
- Isolated HTTP: account setup, fresh notification 201, identical retry 200/stable UUID, unknown/unmatched review, Kakao transfer and AUXILIARY linking confirmed. Restart resumed a pending cross-bank pair exactly once; final two transactions have four independent sources (three PRIMARY, one AUXILIARY).
- Reconciled baseline: Flyway validated 52 migrations, normal DEV startup and HTTP 200 passed before MONEY applied V54.
- MONEY shared DEV: Flyway validated 53 migration files, applied V54 successfully, normal startup/API 200 passed. Synthetic ingest 201/retry 200 moved automatically to REVIEW_REQUIRED/UNRECOGNIZED_SHAPE. Exact synthetic row/attempts removed afterward.
- Migration collision was detected before MONEY changed shared schema. Checklist/Diet owns and merged reconciliation; MONEY renumbered its unapplied migration to V54.

The initial conflicting V51 and shared 15-session capacity failures were resolved before shared MONEY validation. No history repair by MONEY; validation used pools of at most two. All MONEY validation servers are stopped; both isolated schemas are removed. The audit's 18 raw rows remain RECEIVED, processing_version=0, processing_due_at=NULL. Existing main-checkout backend was left running untouched; restart it from updated dev to load the new scheduler. No PROD deployment.

Real-device limitation remains unchanged: four metadata-only callbacks failed HTTP400 and were not persisted. No ingest relaxation, filtering, or parser rule was added for them.

Batch 3 starting point after completion: register actual owner accounts through existing account APIs; scope an owner review/correction and deliberate-reprocessing workflow using immutable raw/attempt/source evidence, then the approved MONEY UI policy. Do not automatically post/reprocess the historical audit or begin Android production work. Confirm external income/expense formats separately; the current fallback is deliberately narrow.
