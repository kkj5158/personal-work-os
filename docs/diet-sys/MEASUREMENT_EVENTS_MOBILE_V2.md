# Mobile V2 measurement events — candidate, 2026-10-15

V87 is additive. V86 is already reserved by MONEY earnings weeks in concurrent
worktrees. Do not renumber an applied migration or modify historical checksums.
This task prepares backend code and APKs; it does not deploy production.

`diet_measurements` retains the original doubles, nullable timestamps, slot,
source and metadata. Backfill copies the seven supported day measurement cells
without rounding, aggregation or choosing duplicate winners. `diet_days` already
has `(owner_id,entry_date)` uniqueness, so legacy daily weight duplicates cannot
exist under this schema. Verify migration constraints against the deployment
database before applying it; do not remove invalid history to force completion.

The new authenticated API exposes owner-scoped 500-row keyset pages and UUID PUTs
with operation ID and expected revision. The database unique partial index
enforces one active daily weight. The existing owner lock serializes mutations,
including legacy day PUTs. The write and durable operation acknowledgement commit
together. Reusing an operation ID with a different body is invalid. A lost reply
can be replayed without another insertion or edit. Metadata/source/unit are not
writable from the simplified form, so an edit cannot strip them.

Mobile facts project the latest measurement per legacy metric/slot into the
existing day row. This patches only that metric and its shared legacy slot time;
targets, fasting, waist and other metrics are preserved. Per-event timestamps
remain independent even though legacy consumers can show only one time per slot.
Legacy day writes update the linked projected fact and advance its revision;
explicit null clears tombstone the active cell facts, retaining audit rows.
The legacy full-object endpoint keeps its established last-write-wins contract:
old clients without revisions cannot acquire new CAS guarantees. New event API
clients reject stale revisions. This distinction must remain explicit in QA.

NOTE projection runs after the canonical transaction, using the established
best-effort projection mechanism. Event moves update the old and new date views.
Auth/security configuration is unchanged; the owner always comes from the
existing `CurrentUserProvider`. No public RLS policies are added.

## Focused verification

`DietMeasurementPostgresTest` only accepts an explicit loopback `diet_v2_qa`
database and recreates its synthetic schema. It never reads DEV/PROD credentials.
It tests actual PostgreSQL locking, uniqueness, pagination, metadata, legacy
projection and retries. `DietMeasurementQaApplication` is on the test classpath
only, uses a fixed synthetic owner on loopback, and is excluded from bootJar.
Never launch it against a shared database or publish its permissive test filter.

## Deployment and rollback

1. Review the final dev revision, migration inventory and deployment lock.
2. Take the usual production backup, validate existing history against constraints,
   and deploy V87 plus the API only after production authorization.
3. Verify authenticated owner-scoped reads and a separately authorized fixture.
4. Install the APK as an update; never uninstall or clear app data.

Rollback the application binary first, preserving both new tables and the capture
trigger. Existing day consumers continue to read the projected values. Older
binary rollback hides additional same-day facts until the event API is restored;
it must not drop those facts. No automatic destructive down migration is provided.
Do not drop tables or repair Flyway history to roll back: that would destroy the
only copy of additional same-day measurements and idempotency acknowledgements.
