# MONEY SYS Batch 2 closeout

Implementation complete; final shared DEV validation/integration in progress.

- Base: `280d304e6ccb59d02a8fc29e902db24c97bc8479` (Checklist/Diet migration reconciliation).
- Migration: `V54__money_processing_schedule.sql`; V51 remains Checklist, V53 remains Diet. No Flyway repair by MONEY.
- Parsers: `shinhan-push`, `ibk-push`, `woori-push`, `kakao-push`, all `1.0.0`.
- Matcher: `1.0.0`; exact account resolution, symmetric unique pairing, explicit single-raw route, auxiliary provenance.
- Trigger: durable raw-row due time, five-second scheduler, two-minute matching wait, per-owner transactional advisory lock.
- Policy/limits: [Batch 2 contract](money-sys-batch2.md).

Validation completed so far:

- 45 focused tests passed (33 MONEY and 12 security/error-handler tests), no failures/skips, in isolated PostgreSQL schema; bootJar passed.
- Additional product-deposit/ambiguity checks passed in the subsequent 14-test pure parser/matcher run.
- Read-only real audit: all 18 raws parse; ten transfer proposals preserve 18 sources / 20 logical sides. No real ledger posting or raw mutation.
- Isolated HTTP: account setup, fresh notification 201, identical retry 200/stable UUID, unknown review, Kakao transfer and AUXILIARY linking confirmed.
- Migration collision was detected before MONEY changed shared schema. Checklist/Diet owns and merged reconciliation; MONEY renumbered its unapplied migration to V54.

Pending: database session capacity for normal DEV Flyway/startup, final shared-schema tests, HTTP worker restart/pair completion, integration and cleanup.

Real-device limitation remains unchanged: four metadata-only callbacks failed HTTP400 and were not persisted. No ingest relaxation, filtering, or parser rule was added for them.

Batch 3 starting point after completion: register actual owner accounts through existing account APIs; scope an owner review/correction and deliberate-reprocessing workflow using immutable raw/attempt/source evidence, then the approved MONEY UI policy. Do not automatically post/reprocess the historical audit or begin Android production work. Confirm external income/expense formats separately; the current fallback is deliberately narrow.
