# Start Time Criteria

## 1. Purpose

A `StartTimeCriterion` is a user's reusable, named start-time reference (e.g.
`오후 출근` / `15:00`). It exists so a future `WorkRecord` can record which
start-time standard was applied on a given day, as the basis for a lateness
calculation.

This domain is implemented ahead of `WorkRecord` persistence specifically
because `WorkRecord` must **snapshot** the applied criterion's name and start
time at save time, not reference this table live. Implementing the source
data first makes that snapshot relationship concrete for the next unit.

## 2. Table

`start_time_criteria` (migration `V5__create_start_time_criteria.sql`)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key, client-assigned |
| `user_id` | UUID | Owning user (`auth.users`, `ON DELETE CASCADE`) |
| `name` | VARCHAR(100) | Criterion name, trimmed before persistence |
| `start_time` | TIME | Start-time-of-day reference |
| `sort_order` | INTEGER | List ordering — assigned on create as `max(sort_order) + 1` within the current user's own criteria (`0` for their first), never touched by update. No reorder UI exists yet. |
| `is_active` | BOOLEAN | Selectable for new records when `true` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard audit timestamps |

Constraints/indexes: `chk_start_time_criteria_sort_order` (`sort_order >= 0`),
`idx_start_time_criteria_user_sort` on `(user_id, sort_order, name)` for
deterministic list ordering. No name-uniqueness constraint — the committed
frontend criteria-management UI never validates or enforces unique names, so
none is added here. No seed rows.

## 3. Ownership

Every read and write is scoped to `CurrentUserProvider.getCurrentUserId()`.
`StartTimeCriterionRepository.findByIdAndUserId` is the only lookup path used
for update — a criterion owned by another user is indistinguishable from a
missing one (`ResourceNotFoundException`, 404), matching the rest of the
codebase (see `ActivityCategory`).

## 4. API

Base route: `/api/start-time-criteria`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/start-time-criteria` | List the current user's criteria, ordered by `sortOrder` then `name` |
| `POST` | `/api/start-time-criteria` | Create a criterion (always starts active) |
| `PUT` | `/api/start-time-criteria/{id}` | Update `name`, `startTime`, `isActive` |

No delete endpoint: the committed frontend (`StartTimeCriteriaModal.tsx`)
never permanently deletes a persisted criterion — only an unsaved, in-session
draft row can be discarded before it's ever saved. Deactivation (`isActive:
false` via `PUT`) is the only supported way to retire a criterion.

Request/response field names: `name`, `startTime`, `isActive`, `sortOrder` —
`startTime` serializes as a local `HH:mm:ss` value, consistent with
`WorkSchedule.plannedStartTime` elsewhere in this codebase.

## 5. Active / inactive behavior

- Only `isActive = true` criteria are meant to be offered for a **new**
  selection (enforced by the future WorkRecord-facing consumer, not by this
  API — this slice has no concept of "selection", only CRUD).
- An inactive criterion is not deleted and its row remains fully readable via
  `GET` — a `WorkRecord` that already snapshotted it must still be able to
  display what was applied at the time.

## 6. Why this must not retroactively change history

A future `WorkRecord` will store its own copy of the applied criterion's
`name` and `startTime` (and probably its id, for traceability) at the moment
it is saved — never a live foreign-key-only reference that gets resolved at
read time. If a `WorkRecord` instead pointed at a `StartTimeCriterion` row
live, renaming that criterion or changing its `start_time` later would
silently rewrite what an already-saved record's lateness calculation *meant*,
which is a correctness and audit problem, not just a display inconvenience.
This is the same snapshot-vs-live-reference distinction already established
on the frontend (`AppliedStartTime`'s frozen `criterionName`/`startTime`
fields in `startTimeCriterion.ts`) and is the reason `StartTimeCriterion`
itself exposes no cascading delete and no destructive rename semantics: the
source row can always change going forward, but a `WorkRecord`'s own
snapshot columns (deferred to the next unit) are what stay frozen.
