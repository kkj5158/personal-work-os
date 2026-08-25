# Work Log — Confirmed Product Policy

This document states confirmed product decisions for Work Log's backend
domain (`WorkRecord`, `WorkTimeEntry`, `ActivityCategory`,
`StartTimeCriterion`). It supersedes any conflicting assumption in older
historical documents (see `CLAUDE.md`'s document precedence list). It is
policy, not an implementation log — see `docs/contracts/work-log-contract.md`
for the API/domain shape and `docs/backend/*.md` for what is actually built.

## Record identity and dates

- A `WorkRecord` is user-owned and represents exactly one local work date.
- At most one `WorkRecord` exists per `(user_id, work_date)`.
- **No row** and an **explicit `ABSENT` row** are different states. A missing
  row is never treated as absence.
- `미입력` ("not entered") is a **frontend-only** presentation of "no
  persisted row for this date" — it is not, and never becomes, a persisted
  attendance value.
- A future date, or today before it's been recorded, having no row is normal
  and must never be interpreted as absence.
- Past dates are expected to eventually receive an explicit `ABSENT` row
  through a future scheduled job (deferred — not part of the current
  milestone).
- Reading a record must never create one as a side effect.
- Dates and times follow the application's existing single-timezone policy
  (`AppTimeZone`, `Asia/Seoul`) — the same convention already used by
  Planning.

## Attendance

Canonical statuses: `WORK`, `EARLY_LEAVE`, `DAY_OFF`, `PAID_LEAVE`,
`SICK_LEAVE`, `ABSENT`.

- `ABSENT` is a persisted value (once the deferred scheduler exists to write
  it, or a user/future-flow sets it directly).
- There is no "unrecorded" attendance enum value — that state is always
  represented by the row's absence, per the section above.

## Clock times and durations

- Clock-in and clock-out belong to `WorkRecord`, only meaningful for the two
  working statuses (`WORK`, `EARLY_LEAVE`).
- Work may cross midnight — a clock-out time-of-day earlier than clock-in
  belongs to the next local day (the "overnight rule").
- Impossible combinations are rejected (e.g. clock-out without clock-in,
  identical clock-in/clock-out).
- A non-working status cannot retain clock times, a computed stay duration,
  or an applied start-time criterion — switching to one requires the caller
  to explicitly clear those fields.
- Missing clock times alone never imply absence — a `WORK` record with no
  clock-in yet is simply "not clocked in," not absent.

## StartTimeCriterion and lateness

`StartTimeCriterion` is a mutable, user-owned catalog (see
`docs/backend/start-time-criteria.md`). When applied to a `WorkRecord`, the
record freezes a **snapshot** — criterion id (for traceability), name, and
start time — at the moment of selection. A historical record's displayed
criterion name/time never depends on a live join back to the catalog, so
renaming, retiming, or deactivating the original criterion never changes how
an already-saved record reads.

Lateness:

- Compares actual clock-in against the record's own frozen snapshot start
  time — never the live catalog.
- Exact equality is on-time, not late.
- A later clock-in produces a positive lateness value in minutes.
- No applied criterion means lateness is not applicable (not zero, not an
  error — simply not computable).

## ActivityCategory

The single canonical shared category model — see
`docs/backend/activity-categories.md`. Not Work Log-specific; also used by
Planning and, eventually, the time calendar.

- Root category (대분류) = grouping node, never directly assignable.
- Child category (중분류) = the assignable identity. `WorkTimeEntry` stores
  only the child's id; the parent is always derived via the child's own
  `parentId`, never duplicated.
- Only active child categories may be newly assigned. An inactive category
  already referenced by a historical entry remains readable and is never
  silently changed or removed.
- Categories are never hard-deleted.

## WorkTimeEntry

A `WorkRecord` owns an ordered set of `WorkTimeEntry` children — the
additive, per-item time log that sums to the record's net work minutes (never
a value stored independently on `WorkRecord` itself).

- Category is required on every entry.
- `item` is trimmed free text, independent of category.
- Minutes must be positive.
- Editing an entry's category or memo alone must never change the record's
  total work minutes.
- An entry can never reference another user's category or another user's
  record.

## Absence correction (deferred)

`ABSENT` rows are expected to eventually be correctable through a detail
action labeled `결근 정정` ("absence correction"). The MVP version of this is
a direct record correction; a document-submission/approval workflow is a
later idea, not committed. The backend data model must not preclude this
later addition, but the scheduler and the correction UI/endpoint are **not**
part of the current milestone.

## Ownership and concurrency

- Every read and write is scoped to the current authenticated user
  (`CurrentUserProvider`) — a client-supplied user id is never trusted.
- A foreign-owned or missing id is handled through the repository's existing
  not-found convention (indistinguishable from each other in the response).
- `WorkRecord` updates use optimistic locking: the API exposes a version, and
  an update must supply the version it read. A stale version produces a
  clear conflict response, never a silent overwrite.

## Current milestone vs. deferred

**Current milestone:** `ActivityCategory` default-child contract, `WorkRecord`
backend core, categorized `WorkTimeEntry` persistence, and their supporting
documentation/tests.

**Deferred (not part of this milestone):**

- Frontend real API integration (Work Log currently runs entirely on local
  mock data).
- Removing Work Log's frontend mocks.
- The `ABSENT` scheduler.
- The `결근 정정` frontend/backend flow.
- Database-backed analytics/trend endpoints.
- Deployment and any production migration.
