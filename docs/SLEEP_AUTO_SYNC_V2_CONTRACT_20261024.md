# Sleep automatic sync v2 — 2026-10-24

## Preflight

Worktree: `personal-work-os-worktrees/sleep-auto-server`, branch
`codex/sleep-auto-server`, clean baseline `aaae479` (`origin/dev`). Read root
AGENTS/CLAUDE and agent operating, Git, validation and production policies.
Existing owner is `SleepService`, `/api/sleep/v1/actions`; all accepted sessions,
event snapshots, tombstones, idempotency receipts and invalidations remain there.
Migration baseline contains timetable V91; V92 is reserved for this additive
Sleep change. Root integration owner must recheck the shared Flyway registry.
This worktree does not connect to or change shared DEV/PROD.

| Existing implementation | Requested delta | Owner/API | Regression risk |
| --- | --- | --- | --- |
| Strict revision conflicts for every action | Automatic estimates abstain; manual touched fields merge under owner lock | Sleep actions | Concurrent manual payload must not copy untouched endpoints |
| Explicit captures/corrections only | `AUTO_APPLY_SESSION` with endpoint provenance | Sleep sessions/events | Duplicate wake-day, overlap, manual priority, tombstone resurrection |
| Session JSON document | Optional subjective score/note; annotation-only action | Sleep, V92 | Null vs zero, validation, endpoint race |
| Legacy envelopes accepted indefinitely | Required event-generation `protocolVersion: 2` | Sleep main actions | Old clients require upgrade for writes; GET remains usable |
| Up to 366 days of missing endpoint requirements | Yesterday/today action surface with compact summary | Sleep today/context | Historical no-data must remain visible in metrics/history |

## Main action envelopes

All main `/actions` requests require top-level integer `protocolVersion: 2`.
Missing/v1/unsupported versions receive HTTP 409
`SLEEP_PROTOCOL_UPGRADE_REQUIRED`, `minimumProtocolVersion: 2`,
`draftAccepted: false` **before receipt replay or mutation**. This is a protocol
generation boundary, never a filter on sleep dates. Future backdated manual
corrections remain valid. Existing read endpoints and settings APIs are unchanged. Nap actions also
require protocol v2 to prevent replay of discarded legacy unsent nap entries;
nap inference/domain behavior remains unchanged. Existing main-action clients must upgrade for writes; a
server-first rollout leaves their already-confirmed records readable and intact.
This explicit upgrade state is required because legacy Android and Web envelopes
both contain UUID device IDs and cannot be safely distinguished by client label.

Android owns the one-time transaction deleting only its legacy unsent main/nap
outbox/candidate/sync state before constructing v2 operations. The backend does
not delete any confirmed fact or event as part of cutover. Never add v2 to an old
stored request during replay. An old app cannot send its old backlog through the
v2 gate. Install updated Web/Android after server v2, and verify the upgrade error
is handled as an update-needed state by old clients.

`AUTO_APPLY_SESSION` uses the ordinary operation/session/revision/capturedAt/
timezone/offset/device envelope. `entryPoint` additionally accepts `BACKGROUND`.
Its `payload.fields` contains only non-null `bedtimeIntentAt` and/or `wakeAt`;
`payload.fieldTimezones` maps those field names to IANA zones. Wake-day identity
uses the actual wake endpoint's local date, including wake before reminder time.
No raw usage timeline is uploaded. No automatic score is accepted.

The existing owner advisory lock serializes decisions, facts, events and
receipts. Operation retries return the exact receipt; changed requests reusing a
key fail. Auto endpoints carry `USAGE_AUTO` / `ESTIMATED`, their actual timezone,
offset and captured timestamp. They can fill missing endpoints without an
explicit manual source, and update an auto endpoint only at the exact current
revision. They never replace manual values/explicit UNKNOWN, excluded records,
tombstones or newer server revisions. Identical estimates do not create an event
or increment revision. Invalid/future/long/overlapping estimates abstain through
a normal receipt instead of starting a user approval queue. Nap facts and
collision checks remain unchanged.

Duplicate proposed session IDs on one wake day return the canonical session.
`receipt.sessionId` echoes the proposed request ID; `receipt.session.id` can be
the existing canonical ID. Android must retire the proposed local ghost and
store the canonical snapshot. Receipts include `mergeOutcome` (`APPLIED`,
`UNCHANGED`, `NEWER_SERVER_FACT`, `CANONICAL_SESSION`, `DELETED`, `DELETED_DAY`,
`EXCLUDED`, `MANUAL_PRIORITY_OR_UNCHANGED`, or `INELIGIBLE_<code>`). A rejected
new estimate can return `session: null`, `newRevision: 0`; it is not confirmed
server data. Deleted receipts have `deleted: true` and a minimal tombstone.

New tombstones retain expected/logical wake dates to stop recreation with a new
UUID, in addition to original same-ID protection. Privacy-scrubbed pre-V92
tombstones have no reconstructible date; their original UUID remains protected. The server conservatively abstains from
automatic backfill through the latest undated tombstone deletion day
(`LEGACY_TOMBSTONE_BACKFILL_PROTECTED`), while allowing explicit manual backdating.
No history is reconstructed or synthetic session inserted to cover that gap.

## Manual merge and annotations

`CORRECT_SESSION`, `CAPTURE_BEDTIME`, `CAPTURE_WAKE`, `MARK_TIME_UNKNOWN` accept a
non-negative expected revision no greater than current. Explicit touched endpoint
fields merge against the current authoritative session; server-serialized arrival
wins for concurrent manual edits. Client wall-clock time never selects a winner.
Both versions remain in before/after event history and original operation
requests. Untouched endpoint values/provenance and subjective annotations survive.
Destructive delete/exclude/restore/undo actions keep strict revision safeguards.
Deleted same-ID operations reconcile to authoritative tombstones.

`ANNOTATE_SESSION` has `payload.fields` containing only `sleepScore` and/or
`sleepNote`. Score is nullable integer 0–100 (0 is valid); note is nullable one
line up to 100 Unicode code points. Line separators are rejected. Null clears a
field; an absent field preserves it. This action merges only touched annotations
at a valid prior revision and never normalizes or writes endpoint fields.
Identical annotation saves produce a receipt without revision churn. Annotations
can also accompany `CORRECT_SESSION.payload.fields` for atomic editor saves.
The existing session JSON metadata pattern is extended, and V92 adds database
checks. No separate annotation/diary ownership or nap behavior is introduced.

## Completeness and analytics

`today.pendingActions` and compact context pending actions contain only yesterday
and today's actual endpoint requirements. A record on the corresponding owned
wake date resolves duplicate reminder-cycle requirements even when reminder
settings revisions differ. Historical no-data remains in daily metrics and
history, rather than becoming a cumulative actionable backlog. Existing
materialized historical pending rows are retained but retired from the normal
action projection; no session is synthesized or deleted to reduce the count.
The projector only materializes the two-day window on mutations. GET remains
read-only.

`today.syncProtocolVersion = 2`; additive `pendingSummary` reports
`actionableEndpointCount`, `windowDays: 2` and
`meaning: MISSING_ENDPOINTS_NOT_SYNC_CONFLICTS`. The metric still describes a
reported bedtime-to-wake interval, with additive `estimatedCompleteCount` for
records containing at least one automatic endpoint. Subjective sleepScore is
independent of daily reflection/dayScore.

## Validation and rollback

`qa/sleep-auto-server-tests.ps1` creates a fresh loopback PostgreSQL cluster with
synthetic auth, runs `com.kafka.backend.sleep.*`, validates task PG process/data
identity and stops only its own server. Result/logs are under
`F:/artifacts/sleep-auto-server-20261024`. No shared credentials are loaded.
The inherited populated-V70 upgrade assertion compares historical session,
event, cycle and receipt rows unchanged after migration. Focused new assertions
cover duplicates/revision churn, actual wake-day identity, auto/manual priority,
explicit unknown, annotation/time races, zero/null/Unicode limits, tombstones,
legacy protocol replay, future backdating, abstention and compact DUE projection.

V92 is additive and must remain applied on rollback. Reverting clients requires
retaining a compatible protocol serializer; reverting the server while leaving
automatic producer clients enabled is unsafe because old server code does not
recognize the new action types. Disable the automatic producer before a code
rollback and retain confirmed facts/history. No PROD deployment is performed by
this worktree; integration/deployment/Drive report are owned by the parent task.
