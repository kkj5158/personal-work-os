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
seeds `version = 0` explicitly in its constructor (matching the column's own
`DEFAULT 0`) — `@Version` fields are otherwise only populated by Hibernate
once a row is actually persisted, so without this an unpersisted entity's
version reads as `null`.

## 8. On-time override ("정시 출근 처리")

Identified by the Work Log frontend audit as a real, already-designed MVP
concept (`WorkLogRecord.isOnTimeOverride` on the frontend) that had no
backend field yet. `is_on_time_override` forces the *displayed* lateness to
on-time regardless of the raw clock-in-vs-criterion comparison — the raw
`latenessMinutes` in the response is never pre-overridden; a future frontend
integration combines the two exactly as the existing mock frontend already
does (`getEffectiveLateness`).

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

## 9. Deferred

- Frontend integration — Work Log's frontend remains fully mock-backed; see
  `docs/project/work-log-roadmap.md`.
