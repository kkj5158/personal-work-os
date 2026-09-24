# MONEY SYS V1 — Batch 1

This is the historical foundation contract. [Batch 2](money-sys-batch2.md)
extends its parser, matching, time and processing boundaries; the original ingest
and owner-scoping contracts remain in force.

## Implementation plan (2026-09-24, before schema changes)

Read Drive INDEX, CANON, FIXTURES, and BATCH1 HANDOFF in that order. Repository
and shared DEV Flyway history both end at V49; the other existing worktree has
no newer migration. Recheck before applying V50.

Use the existing domain package / record DTO / transactional JdbcTemplate /
JSONB pattern used by Authoring and Workflow, CurrentUserProvider ownership,
ApiExceptionHandler errors, auth.users foreign keys, composite owner foreign
keys and RLS. Production /api/** already requires a verified Supabase JWT;
DEV intentionally uses the existing fixed user. No security profile changes.

1. Add one forward migration for accounts, immutable raw events, append-only
   parse attempts, transactions and transaction source links.
2. Add owner-scoped account configuration, idempotent generic notification
   ingest and bounded read APIs. Preserve the complete JSON request.
3. Add versioned parser/candidate and transfer matcher contracts; processing
   is explicitly invoked by server code, never automatic bank classification.
4. Support ledger persistence through a service and read APIs, with multiple
   primary/auxiliary source links and same-owner constraints.
5. Test the real sanitized fixture shapes through a test-only parser harness,
   lifecycle failures, PostgreSQL persistence, race-safe ingest and JWT routing.
6. Apply to DEV, start the backend, integrate into dev, and write Drive closeout.

No Android, frontend, production parser/matcher rules, account seeding,
categories, balances, financial planning or production deployment in this batch.

## Implemented storage and ownership

V50 adds `money_accounts`, `money_raw_notifications`, `money_parse_attempts`,
`money_transactions`, and `money_transaction_sources`. UUID keys, `user_id`,
TIMESTAMPTZ, JSONB, auth.users FKs and RLS follow POS conventions. API owner is
always CurrentUserProvider, never request data. Cross-record composite FKs
enforce equal owners even if a future caller misses an application check.

Savings/installment accounts use `role=SAVINGS`; no separate subsystem or global
account seed. Provider is an extensible uppercase identifier. Only a masked
reference and up to four suffix digits are accepted as account reference fields;
neither is assumed unique. Accounts archive/unarchive rather than delete, and
updates require `expectedVersion`. Balances and categories are deferred.

Transactions have positive NUMERIC(19,2) amounts, explicit currency and time,
INCOME (null → owned), EXPENSE (owned → null), TRANSFER (distinct owned → owned).
`recordTransaction` is a server-only persistence method. A primary source is
required. Sources may reference a particular immutable parse attempt and carry
JSON evidence; PRIMARY/AUXILIARY identifies its role. One raw event can support
only one canonical transaction. One transaction can have many raw events.
This replaces a premature two-row `money_transfer_match` table without losing
single-notification, two-sided or auxiliary provenance. Archived accounts retain
their ledger and may receive delayed historical records.

## HTTP contract

All routes are under `/api/money`, protected by the existing production JWT
filter. DEV retains its fixed-user/no-login convention; do not expose DEV as a
mobile ingestion service. There are no client-supplied owner fields.

| Method | Route | Behavior |
| --- | --- | --- |
| GET / POST | `/accounts` | List / register account (201) |
| GET / PUT | `/accounts/{id}` | Read / update account and expectedVersion |
| PUT | `/accounts/{id}/archive` | `{expectedVersion, archived}` |
| POST | `/notifications` | 201 created or 200 already received |
| GET | `/notifications` | Optional state, limit (default 50, max 200), offset |
| GET | `/notifications/{id}` | Original capture plus current processing state |
| GET | `/notifications/{id}/parse-attempts` | Parse history |
| GET | `/transactions` | Ledger with provenance; limit/offset |
| GET | `/transactions/{id}` | Ledger record with provenance |

Account POST fields: `provider`, `displayName`, `role`, optional
`maskedReference`, `suffix`. PUT uses `{expectedVersion, account: {...}}`.
Errors follow POS `{message}`: 400 invalid, 404 absent/foreign owner, 409 stale
account version, reused idempotency key with different content, or already-posted
raw source. No account/notification/ledger deletion endpoint is supplied.

Notification example (synthetic transport, not a discovered bank package):

```json
{
  "sourcePackage": "fixture.shinhan",
  "notificationKey": "capture-001",
  "deviceId": "development-phone",
  "postedAt": "2026-09-24T05:14:00Z",
  "title": "입금",
  "text": "2,000원 <OWNER> 급여통장(1228)\n09.24 14:14 잔액 12,000원",
  "rawPayload": {"androidExtras": {}},
  "idempotencyKey": "stable-delivery-key"
}
```

Only `postedAt` (ISO-8601 instant) and at least one nonblank `title`, `text`, or
`bigText` are required. `sourcePackage`, `notificationKey`, `deviceId`, and
`idempotencyKey` are optional. The complete request, including unknown/nested
fields and nulls, is preserved as JSONB (semantic JSON, not original whitespace
or key order). Capture size is capped at 128 KiB. No provider or transaction
semantics are required from a client.

Idempotency is owner-scoped and concurrency-safe through unique constraints plus
INSERT ON CONFLICT. Without a client key, use SHA-256 of recursively key-sorted
captured JSON, normalizing postedAt and excluding idempotencyKey. An additional
content hash uniqueness constraint prevents a changed/omitted client key from
duplicating identical content. Preserve a stable key and capture body on retry.
Changed capture content is preserved as a new observation unless it reuses an
existing explicit key (409). Notification keys alone are not identity: Android
may reuse them. Different auxiliary notifications are not transport duplicates;
Batch 2 must link them to one ledger transaction. Exact same captures from two
devices remain distinct; cross-device/event semantic deduplication is deferred.

## Processing and Batch 2 boundary

Ingest only persists RECEIVED. There is no automatic parser registry, worker,
public process endpoint or matcher implementation. `MoneyNotificationParser`
provides key/version/supports/parse. `MoneyService.process` serializes processing
per raw event and appends an immutable attempt, retaining candidate JSON and
relational provider/direction/amount for later matching. Parser exceptions become
FAILED/PARSER_ERROR without storing exception text. Unsupported formats become
REVIEW_REQUIRED. Successful output chooses PARSED or REVIEW_REQUIRED. Reprocessing
keeps earlier attempts and never resets an already-PROCESSED event or changes its
ledger. Ledger posting atomically writes provenance and marks sources PROCESSED.

Candidate fields include provider, IN/OUT, amount, optional occurredAt and
providerTimeText, both account hints, suffix list, counterparty, post-balance,
subtype, source raw UUID and parse status. Incomplete candidates may require
review. A provider minute/second time string is not silently replaced with the
Android display time; calendar year/timezone resolution belongs to Batch 2.

`MoneyTransferMatcher` consumes owner-scoped accounts, parse attempts and existing
ledger records. Proposals can represent a transfer, review, no match, or an
auxiliary link to an existing transaction. There is no scoring formula. Batch 2
must add safe proposal acceptance/auxiliary attachment, parser selection and
execution scheduling, account resolution, ambiguity handling and correction/
reconciliation rules before automatic posting. Do not treat an unmatched OUT
as an immediately confirmed expense.

## Fixture and validation scope

Source: Kafka_AI_WorkSpace / 10_POS / 09_MONEY_SYS /
15_FIXTURES__MONEY_NOTIFICATION_V1. Test resources preserve sanitized Shinhan,
IBK, Woori, Kakao ordinary/favorite/free savings examples. Test-only parsers
exercise actual text extraction and the normalized interface; they are not
registered as production rules. `<OWNER>` and `<COUNTERPARTY>` remain data.
The F07 Shinhan installment account suffix 6017 is an account configuration
fixture; the partial provider sample remains for full parser work in Batch 2.

Focused command (DEV environment variables enable PostgreSQL tests):

```powershell
.\gradlew.bat test --tests 'com.kafka.backend.money.*' `
  --tests 'com.kafka.backend.common.SecurityProfileIsolationTest' `
  --tests 'com.kafka.backend.common.ApiExceptionHandlerTest' bootJar
```

PostgreSQL tests cover account version/archive, every fixture ingestion,
concurrent duplicate deliveries, JSONB preservation, idempotency conflicts,
two valid owners, database owner constraints, all transaction types,
single-/two-/auxiliary-source provenance, failed/unsupported/repeated parsing
and immutable posted provenance. Domain writes and a temporary auth identity
are rolled back. The concurrency test commits only its unique raw fixture and
removes it by exact owner/device/key in finally. JWT routing and validation are
tested separately. A small DEV connection pool avoids the shared session limit.
