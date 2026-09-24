# MONEY SYS Batch 2

Backend-only extension of Batch 1. No Android, UI, metadata-only ingest change, categorization, or production deployment.

## Parsers and evidence

`ShinhanNotificationParserV1`, `IbkNotificationParserV1`, `WooriNotificationParserV1`,
and `KakaoNotificationParserV1` implement `MoneyNotificationParser`; all use version
`1.0.0`. Package selection is exact. Parsing uses expanded text when populated,
otherwise text. Unicode whitespace is normalized for syntax matching (including
Woori's full-width padding); original fields/JSON are never changed.

Strict observed grammars extract amount, direction, account/product or masked
reference, counterparty, balance, subtype and time. Unknown/malformed formats
require review. Unexpected parser exceptions create immutable FAILED/PARSER_ERROR
attempts, without exception text. No parser output or notification body is logged.

Candidates retain raw UUID, parser version, evidence, Android postedAt and a
separate nullable providerOccurredAt. `occurredAt` is the matching/ledger time:

- SHINHAN/IBK: provider minute lower bound, `PROVIDER_MINUTE`. Zero seconds in the
  serialized instant mean the beginning of a minute interval, not observed seconds.
- WOORI: provider seconds, `PROVIDER_SECOND`.
- KAKAO: provider time absent; `ANDROID_POSTED_AT` explicitly identifies fallback.

Missing provider years resolve to the nearest valid Korea-time date in postedAt's
year +/- 1. A difference over 24 hours requires review. Invalid calendar dates are
not repaired. Precision and normalization rule are saved in evidence.

## Account resolution

Only the owner's active accounts are supplied. Exact provider plus suffix or
masked reference must identify one account. An exact product/display name can
disambiguate suffix collisions. Unknown/ambiguous accounts require review;
cross-provider suffixes never match. No accounts, owner name, or real user values
are seeded. Roles remain ordinary account metadata.

## Matcher 1.0.0

Transport idempotency is unchanged. Matching keeps all independent raw sources.
New parse attempts wait two minutes before posting, allowing opposite arrival
order and competing candidates. Two-sided candidates require equal amount,
opposite direction, different resolved owned accounts, Android post times within
10 seconds (inclusive), and observed/provider times within 90 seconds. The
stricter Android bound compensates for provider minute precision.

Additional evidence must be one of:

- Identical nonempty counterparty after whitespace normalization and removal of
  the exact `신한오픈` aggregator prefix. The prefix is never treated as a destination bank.
- An explicit Shinhan savings-product deposit counterparty and resolved savings destination.
- The verified Shinhan hub-to-regular-savings shape: SHINHAN on both sides,
  INCOME_HUB source, SAVINGS destination, explicit `정기적금(suffix)` IN hint,
  absent IN counterparty, nonempty OUT counterparty, equal provider minute, and
  Android posts at most one second apart. This is a narrowly defined inference
  from the verified shape, not a bank transfer identifier.

The compatibility graph must have exactly one partner in both directions.
Competing partners go to REVIEW_REQUIRED. Pair selection is symmetric, not greedy
by delivery order. An IN notification can arrive first.

Kakao's explicit source -> destination product/suffix route resolves both owned
accounts and produces one transfer from one PRIMARY source. A savings-success
notification never posts alone: it may attach as AUXILIARY to exactly one existing
Kakao explicit-route transfer with equal amount, resolved destination and time
within 10 seconds. Multiple/missing primaries require review. If its primary posts
in the current pass, linking is retried on the next pass.

Unmatched events do not automatically become income/expense merely because time
expired. Only explicit `카드결제 ` OUT / `급여 ` IN counterparty wording qualifies,
after the wait and with no nearby opposing same-amount candidate. These narrow
external fallback tests are synthetic; real-device external-payment/payroll
coverage remains unverified. Everything else requires review. Categories are untouched.

## Processing and reprocessing

The additive MONEY schedule migration adds nullable `processing_due_at` and
`processing_reason` to existing raw rows, then sets the due-time default for
future INSERTs. Existing Batch 1.5 rows remain RECEIVED, processing_version=0,
unscheduled. No historical backfill is performed. It also changes new parse
attempt timestamps to clock_timestamp(), avoiding same-transaction ordering ties.

`MoneyProcessingScheduler` runs every five seconds using the existing Spring
scheduling facility. Configuration: `app.money.processing-enabled` (default true),
`app.money.processing-delay-ms` (default 5000). Disable the scheduler for maintenance.
Due rows durably enumerate owners; no owner ID is accepted from a request parameter.
Each owner pass uses a transaction and PostgreSQL transaction advisory lock.
All subsequent account/raw/attempt/ledger reads and writes are owner-scoped.

RECEIVED -> immutable parser attempt -> PARSED -> waiting -> PROCESSED or
REVIEW_REQUIRED. FAILED/unknown/account ambiguity terminate with an explicit
processing reason. The worker reuses the current attempt, not reparsing each tick.
Posting and PRIMARY/AUXILIARY provenance are atomic. Unique raw-source constraints
and owner locks prevent duplicate posting across retries/instances. Failures roll
back the pass and retain durable due work; logs contain a fixed generic warning.

Server-only `MoneyService.requestReprocessing(rawId)` enqueues one unposted owned
raw after account configuration or parser changes. Its next attempt is appended.
There is no public bulk reprocess endpoint. Posted raws cannot be re-enqueued;
explicit diagnostic `process` may append an attempt while preserving the original
ledger and provenance. Corrections to posted transactions are a later workflow.

The worker refuses incomplete matching sets: more than 500 scheduled raws or 500
relevant existing transactions for one owner require operational intervention.
Notifications delayed beyond the horizon/10-second arrival window and unknown
formats/products remain review cases. No fuzzy update dedupe or late financial
rewrite is attempted. Provider-specific rules need new versions when formats change.

## Acceptance and data safety

The sanitized 18-source fixture sequence covers ten logical transfers (20 account
sides): IBK->Shinhan, Shinhan->IBK, IBK->Woori, Woori->Kakao, Kakao->Shinhan,
Shinhan->Kakao, both favorite/gateway savings directions, Woori->Shinhan, and
Shinhan salary->regular savings. Additional catalog fixtures cover free savings
and auxiliary success. Synthetic tests exercise ambiguity, timing boundaries,
owner isolation, deliberate retries, failures, and external fallback.

`MoneyRealDeviceReadOnlyTest` is opt-in with `MONEY_VERIFY_DEVICE_AUDIT=true`.
It queries the verified window in `public` in a read-only transaction, parses and
matches in memory against a synthetic registry, and asserts 18 unchanged raws /
10 transfer proposals. It neither posts real transactions nor exports raw bodies.
The real DEV owner still needs actual MoneyAccount configuration before deliberate
processing. Tests are not evidence that a real account registry has been installed.

The four metadata-only HTTP400 callbacks remain unpersisted and provisionally
aggregate-style, with no added ingestion or parsing rule.

## Validation/integration status

See `money-sys-batch2-closeout.md` for commit, applied/proposed migration number,
actual test results, runtime evidence and the integration gate. Batch 3 must not
start until Batch 2 integration and normal DEV Flyway/startup are verified.
