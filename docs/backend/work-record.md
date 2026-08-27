# Work Record

Implements the confirmed policy in `docs/product/work-log-policy.md` and the
contract in `docs/contracts/work-log-contract.md`. See those for the "why";
this document is "what's actually built."

## 1. Table

`work_records` — originally created empty in `V1__create_time_work_management.sql`
and never consumed by any application code until now. Evolved in place by
`V7__evolve_work_records_for_work_record_backend.sql` (a pure `ALTER`,
following the same style `V3`/`V4` already used to evolve
`calendar_categories` into `activity_categories` — `V1` itself is untouched).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, client-assigned |
| `user_id` | UUID | Owning user (`auth.users`, `ON DELETE CASCADE`) |
| `work_date` | DATE | One row per `(user_id, work_date)` (`uq_work_records_user_date`) |
| `status` | VARCHAR(30) | `WORK`, `EARLY_LEAVE`, `DAY_OFF`, `PAID_LEAVE`, `SICK_LEAVE`, `ABSENT` |
| `clock_in_at` / `clock_out_at` | TIMESTAMPTZ | Full timestamps, not bare times — the overnight rule is resolved into the actual date before storage, so `clock_out_at >= clock_in_at` always holds (`chk_work_records_clock_order`, from V1, still valid) |
| `basic_work_minutes` | INTEGER | Computed stay-duration (체류 시간), recomputed server-side whenever clock times change |
| `work_location` | VARCHAR(100) | From V1, unchanged |
| `work_score` | INTEGER | 0–100, from V1, unchanged |
| `memo` | TEXT | From V1, unchanged |
| `applied_criterion_id` | UUID | Snapshot only — no FK to `start_time_criteria` (see §4) |
| `applied_criterion_name` | VARCHAR(100) | Snapshot |
| `applied_start_time` | TIME | Snapshot |
| `version` | INTEGER | Optimistic lock, `NOT NULL DEFAULT 0` |
| `is_on_time_override` | BOOLEAN | `NOT NULL DEFAULT false`. "정시 출근 처리" MVP flag — added by `V9__add_on_time_override_to_work_records.sql`. See §9. |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard audit timestamps |

V7 also **dropped** `manual_duration_minutes` (the V1 manual-override
concept) — Work Log's confirmed frontend policy no longer supports directly
adjusting work duration; net work minutes are always derived from
`WorkTimeEntry` rows (added in a later migration, see
`docs/backend/work-time-entry.md` once that slice lands).

Renamed attendance values: `PRESENT → WORK`, `ANNUAL_LEAVE → PAID_LEAVE`.
`DAY_OFF` / `EARLY_LEAVE` / `ABSENT` / `SICK_LEAVE` are unchanged. The table
was empty before this migration, so the rename is a safe in-place `UPDATE`.

## 2. Entity and ownership

`com.kafka.backend.workrecord.WorkRecord`, `WorkAttendanceStatus` enum
(`isWorkday()` is true only for `WORK`/`EARLY_LEAVE`). Every repository
method is scoped by `userId`; `WorkRecordService` resolves the current user
through `CurrentUserProvider`, same as every other domain in this codebase.

## 3. API

Base route `/api/work-records`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/work-records?from=&to=` | Current-user list in `[from, to]`, ordered by date. `to < from` is rejected. |
| `GET` | `/api/work-records/{date}` | Single record. No row for that date → `204 No Content` (never creates one, never a 404 — a missing row is a normal state, not an error). |
| `PUT` | `/api/work-records/{date}` | Upsert. See §5 for the request shape. |
| `POST` | `/api/work-records/{date}/clock-in` | Server-timestamped clock-in. `{date}` must be today (`AppTimeZone.ZONE`). Requires an existing record for that date, a workday status, an already-applied criterion, and no existing clock-in. Body: `{expectedVersion}`. |
| `POST` | `/api/work-records/{date}/clock-out` | Server-timestamped clock-out; computes `basicWorkMinutes`. `{date}` must be today. Requires an existing clock-in and no existing clock-out. Body: `{expectedVersion}`. |
| `POST` | `/api/work-records/{date}/clock-times/clear` | Clears clock-in, clock-out, `basicWorkMinutes`, and the on-time override together — covers both the frontend's "cancel" and "delete" actions. Works on any date (not just today). Blocked while the record has work-time entries. Body: `{expectedVersion}`. |
| `POST` | `/api/work-records/{date}/absence-correction` | 결근 정정. Same body shape as `PUT`. Only eligible when the record's current status is `ABSENT`. See §11. |

## 4. Applied start-time-criterion snapshot

`applied_criterion_id`/`_name`/`_start_time` are plain columns, **not** a
foreign key to `start_time_criteria` — adding any constraint to that table
would be a `StartTimeCriterion` change, out of scope for this slice, and a
frozen snapshot is conceptually independent from the live catalog anyway.
Ownership of the referenced criterion is validated once, at write time
(`StartTimeCriterionRepository.findByIdAndUserId`), never re-checked or
re-joined at read time.

**Snapshot-refresh rule (the one non-obvious part of this slice):**
`WorkRecordService.upsert` only re-reads the live criterion and takes a new
snapshot when the request's `appliedCriterionId` **differs** from whatever
the existing record already has. If the client re-sends the *same* criterion
id — e.g. saving an unrelated memo edit — the existing frozen snapshot is
copied forward untouched and the criterion repository is not consulted at
all. Without this, a plain PUT-with-full-state request (which naturally
re-sends the currently-applied criterion id on every save) would silently
refresh the snapshot to the criterion's *current* name/time on every
unrelated edit, defeating the entire point of snapshotting. This was caught
and fixed during this slice's own test-writing, not assumed correct from
the start.

## 5. Request/response shapes

`WorkRecordRequest(status, clockIn, clockOut, workLocation, workScore, memo,
appliedCriterionId, expectedVersion, workTimeEntries)` — `clockIn`/`clockOut`
are bare `LocalTime` (no date; the service derives the actual calendar date,
applying the overnight rule for `clockOut`). `expectedVersion` is required
and checked only when a record already exists for that date.
`workTimeEntries` is the record's **complete** entry list (see
`docs/backend/work-time-entry.md`) — must be empty for a non-working status.

`WorkRecordResponse` adds fields that are **not** stored on `work_records`
itself: `latenessMinutes` (`null` = not applicable — non-working status, no
clock-in, or no applied criterion; `0` = on time; positive = minutes late),
`version`, `workTimeEntries`, and `netWorkMinutes` (the sum of
`workTimeEntries`' minutes, via `WorkTimeEntryService.sumMinutes`).

## 6. Validation summary

- Non-working status: request must not include clock times or an applied
  criterion — rejected otherwise (`InvalidRequestException`).
- Working status: clock-out requires clock-in; identical clock-in/clock-out
  rejected; clock-out time-of-day earlier than clock-in → next local day.
- `appliedCriterionId` not owned by the current user → `ResourceNotFoundException`.
  Newly selected (different from the existing snapshot) and inactive →
  `InvalidRequestException`.
- `workScore` outside `0`–`100` → `InvalidRequestException`.
- Stale `expectedVersion` on an existing record → `OptimisticLockConflictException`
  → `409`.

## 7. Optimistic locking

JPA `@Version` on `version` (defense in depth: Hibernate's own flush-time
check backs up the service's explicit pre-check, closing any TOCTOU gap a
purely manual compare would have). `WorkRecordService.upsert` is
`@Transactional`. A freshly constructed, not-yet-persisted `WorkRecord`
leaves `version` `null` — matching Hibernate's own expectation for a
genuinely transient entity (see §7a) — and `WorkRecordService` compares
versions null-safely (`Objects.equals`), never by calling `.equals()`
directly on a possibly-null `getVersion()`.

### 7a. Why `WorkRecord` implements `Persistable<UUID>` (a real bug this caught)

Every entity in this codebase has a client-assigned (not `@GeneratedValue`)
`id` — normally fine, since Spring Data JPA's `save()` falls back to an
id-null-check for "is this new," and a non-null client-assigned id routes to
JPA `merge()`, which handles "doesn't exist yet" gracefully on its own.
`WorkRecord` is the *only* entity that also has `@Version`. Spring Data's
new-vs-existing check for a versioned entity prefers the version field's
nullness over the id's — so an earlier version of this class seeded
`version = 0` at construction (purely to make a bare `new WorkRecord(...)`
convenient to use as a mock "existing" row in unit tests) — but a non-null
version made Spring Data (and, independently, Hibernate's own
transient/detached determination) believe every brand-new record was
already persisted:

- Routed to `merge()`: Hibernate's optimistic-lock check on merge saw a
  non-null version, assumed an `UPDATE ... WHERE id=? AND version=?` should
  match an existing row, found none, and threw `StaleObjectStateException`
  ("Row was already updated or deleted by another transaction") on every
  single first save.
- After adding `Persistable` alone (routing to `persist()` instead): Hibernate's
  own transient/detached check *also* independently inspects the version
  field's nullness, and rejected the still-non-null-version entity with
  `InvalidDataAccessApiUsageException: Detached entity passed to persist`.

**Neither surfaced in the mock-based `WorkRecordServiceTest` suite** —
those tests stub `repository.save()` directly and never exercise real
Hibernate persist/merge semantics. Only a real-database HTTP smoke test
(`PUT /api/work-records/{date}` against the actual development Postgres)
caught it — every single `WorkRecord` creation was silently broken until
this was found and fixed. The fix is both halves together: implement
`Persistable<UUID>` (a `@Transient isNew` flag, set `false` by
`@PostPersist`/`@PostLoad`) so Spring Data correctly calls `persist()` for
a genuinely new record, *and* leave `version` null in the constructor so
Hibernate agrees it's transient. This is the standard, well-known pattern
for "client-assigned id + `@Version`" in Spring Data JPA.

## 8. On-time override ("정시 출근 처리")

Identified by the Work Log frontend audit as a real, already-designed MVP
concept (`WorkLogRecord.isOnTimeOverride` on the frontend) that had no
backend field yet. `is_on_time_override` forces the *displayed* lateness to
on-time regardless of the raw clock-in-vs-criterion comparison — the raw
`latenessMinutes` in the response is never pre-overridden; the real frontend
integration combines the two exactly as the frontend's own
`getEffectiveLateness` always did.

Rules, enforced in `WorkRecordService.resolveOnTimeOverride`:

- Eligible to newly request only when: workday status, a clock-in is set,
  a start-time criterion is applied, and the raw clock-in is genuinely later
  than the criterion (`> 0` minutes). Requesting it outside these conditions
  is rejected with `InvalidRequestException`.
- Invalidated back to `false` — regardless of what the request asks for —
  whenever, compared to the existing record, the clock-in changes, the
  applied criterion changes, or the status leaves a workday status. This
  mirrors the frontend's own documented invalidation rule and is enforced
  server-side so the backend is authoritative, not just the frontend.
- No audit/source metadata beyond the boolean itself — matches the
  frontend's own documented MVP scope for this flag.

### 8a. Real-database bug found by frontend integration (fixed)

Found only once the real frontend actually resent an *unchanged* clock-in
after a real save — invisible to the mock-based backend test suite, which
never round-trips a value through a real `TIMESTAMPTZ` column. The
invalidation check above originally compared clock-in times with raw
`OffsetDateTime.equals()`, which broke in two independent ways:

- `TIMESTAMPTZ` does not store an offset — Postgres/the JDBC driver returns
  an existing row's clock-in normalized to a UTC (`Z`) offset, while a
  freshly computed value from the current request uses `AppTimeZone`'s own
  `+09:00`. Same instant, but `OffsetDateTime.equals()` (unlike
  `isEqual()`) also compares the offset itself, so every resend of an
  *unchanged* clock-in looked like a change on the very next save after a
  real round-trip — the override could never actually be applied to a
  record that had ever been through a real save.
- The dedicated clock-in action stamps full second/nanosecond precision,
  but every clock time the client can ever resend through the generic
  upsert is `"HH:MM"` only, so a reconstruction from that string is always
  exactly zero-second.

Fixed by comparing clock-in times as a display-local (`AppTimeZone.toDisplay`),
minute-truncated `LocalDateTime` instead — see `WorkRecordService.toComparableMinute`.

## 9. Dedicated clock-in / clock-out / clear actions

The frontend audit flagged that trusting a client-supplied `new Date()` for
"clock in/out right now" is a timezone/trust risk. `clockIn`/`clockOut` on
the generic `PUT` (§5) remain for manual/historical time entry (the
record-detail modal's full-draft save), but the three action endpoints in
§3 are server-timestamped and carry their own business rules:

- `clockIn`/`clockOut` only operate on an already-existing record — the
  record itself (and its applied criterion) must already exist, which is
  why `clock-in` requires one to already have an applied criterion rather
  than creating a record from nothing.
- Both are restricted to today (`AppTimeZone.ZONE`) — a server-stamped "now"
  for any other date would be meaningless.
- `clock-times/clear` is deliberately not restricted to today — the
  record-detail modal uses the same "delete/cancel clock times" action on
  historical records too — and is blocked while the record has work-time
  entries, matching the frontend's own rule (`WorkTimeEntryService.findByWorkRecord`
  is consulted, not a stored count).
- All three require `expectedVersion` and go through the same optimistic-lock
  check as `upsert`.

## 10. Absence backfill scheduler

`AbsenceBackfillScheduler` (`@Scheduled`, `app.absence-backfill-cron`,
default daily at 01:00 Asia/Seoul) runs `AbsenceBackfillService.backfillAllUsers()`,
which creates an explicit `ABSENT` `WorkRecord` (`WorkRecord.createAbsence`,
`absence_auto_generated = true`) for every past date, for every user in
`auth.users`, where **both**:

- no `WorkRecord` row exists for that date at all, and
- the user's own Planning schedule (`EffectiveWorkScheduleService.resolve`,
  from the existing `workschedule`/`worksettings` domain) says that date was
  planned as `PlannedStatus.WORK`.

A date planned as a day off / annual leave / sick leave is left alone even
with no row — absence only applies to a date the user was actually expected
to work. If the user has no `WorkSettings` at all for that date's year
(`WorkSettingsNotFoundException`), the date is skipped rather than guessed —
there is no plan to compare against.

**Bounded backfill window** (`app.absence-backfill-window-days`, default
`90`): each run only considers `[today - windowDays, yesterday]`, never
today or a future date. No canonical product document specifies how far
back a missed-run recovery should reach; an unbounded scan back to account
creation was rejected as a pathological case for a long-dormant account.
This bound is an ordinary implementation choice, documented here per
`.claude/rules/validation.md`'s spirit — revisit if the product later wants
a different recovery horizon.

**Idempotency and concurrency**: `AbsenceRecordWriter.createAbsenceIfMissing`
is a separate `@Transactional(REQUIRES_NEW)` bean (not a private method on
the service — self-invocation would silently skip Spring's proxy and the
new-transaction semantics), so one racing/failing row never rolls back the
rest of the batch. It re-checks existence inside its own transaction and
treats a unique-constraint violation on save (`uq_work_records_user_date`)
as "another writer already created it," not an error — safe for concurrent
scheduler instances, for a user's own concurrent save, and for the same run
being triggered twice.

**Restart behavior**: the scheduler keeps no checkpoint of its own — every
run recomputes the missing-date set fresh from the database, so a restart
mid-run simply leaves the remaining gaps for the next run to pick up.

## 11. Absence correction (결근 정정)

`POST /api/work-records/{date}/absence-correction` — `WorkRecordService.correctAbsence`.
Same request/response shape as the generic `PUT` upsert (§5); the only
difference is an eligibility gate and an audit stamp:

- Eligible only when a record already exists for that date **and its
  current status is `ABSENT`** (regardless of whether it was scheduler-generated
  or set some other way) — otherwise `InvalidRequestException`. No record
  at all for that date → `ResourceNotFoundException`.
- On success, stamps `absence_corrected_at = now()` (Asia/Seoul) and applies
  the full requested state exactly like `upsert` (new status, clock times,
  memo, applied criterion, work-time entries, etc.).
- **Idempotency / re-correction**: once a correction moves the record's
  status away from `ABSENT`, it is no longer eligible through this endpoint
  — a further edit to that date is an ordinary `PUT` upsert, which
  preserves the existing `absence_corrected_at` untouched (it is only ever
  set or refreshed by this endpoint, never cleared by a plain upsert). This
  is what makes repeated correction requests safe: the second call is
  rejected with a clear `400`, not a silent no-op or a duplicate audit
  entry.
- **Never recreated by the scheduler**: `AbsenceBackfillService` only
  creates a row where none exists at all (§10) — a corrected record, whatever
  its current status, always has a row, so the scheduler can never touch it
  again.
- `absence_auto_generated` (§10) is untouched by correction — it remains a
  permanent record of the row's origin regardless of how many times it's
  since been edited or corrected.
- Both `absenceAutoGenerated` and `absenceCorrectedAt` are exposed on
  `WorkRecordResponse`, and the real frontend (`feature/worklog-mvp-integration`)
  distinguishes "자동 결근, 미정정" from "정정됨" using them in
  `WorkLogRecordDetailModal`.
- Uses the same optimistic-lock check (`expectedVersion`) as `upsert`.

## 12. Frontend integration

The real Work Log frontend (`feature/worklog-mvp-integration`) consumes
this API — see `docs/project/work-log-roadmap.md` for the full list of
what's connected. No known Work Log MVP gap remains deferred.
