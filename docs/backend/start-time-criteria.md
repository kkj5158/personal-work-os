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
| `sort_order` | INTEGER | List ordering — assigned on create as `max(sort_order) + 1` within the current user's own criteria (`0` for their first), never touched by update. User-reorderable via drag-and-drop — see §9. |
| `is_active` | BOOLEAN | Selectable for new records when `true` |
| `is_default` | BOOLEAN | At most one per user (`uq_start_time_criteria_default`, `V13`) — see §7 |
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
| `PUT` | `/api/start-time-criteria/{id}/default` | Explicitly set as the user's default (see §7) |
| `PUT` | `/api/start-time-criteria/reorder` | Persist a full drag-and-drop reordering (see §9) |

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

## 7. Default criterion (post-production iteration 1)

Invariant: if a user has at least one active criterion, exactly one active
criterion is their default; if none are active, there is naturally no
default. Enforced in `StartTimeCriterionService`, backstopped by the
partial unique index `uq_start_time_criteria_default` (`WHERE is_default =
TRUE`).

- `create()` — the first criterion a user ever creates becomes their
  default automatically (checked via `findByUserIdAndIsDefaultTrue`
  returning empty); every subsequent one does not.
- `update()` — deactivating the current default deterministically promotes
  another active criterion (lowest `sortOrder`, then `name`) if one exists,
  or leaves no default if it was the last active one. Reactivating a
  criterion while the user currently has no default at all promotes it.
- `setDefault(id)` (`PUT .../{id}/default`) — explicit action; rejects an
  inactive target; clears-and-flushes the previous default before marking
  the new one, mirroring `ActivityCategoryService.setDefault`'s ordering
  (see `docs/backend/activity-categories.md`) so the partial unique index is
  never transiently violated within the transaction. Idempotent when
  already default.

V13's migration backfills the invariant for pre-existing data: for each user
with at least one active criterion, the one with the lowest `sortOrder`
(tied-break by `created_at`) is promoted to default.

The frontend (Today panel) preselects the default criterion automatically
and **persists** that selection immediately (via the same save path an
explicit selection uses) rather than only reflecting it visually — clock-in
requires an already-applied criterion server-side, so a merely-visual
default would not actually let the user check in without an extra step.

## 8. Memo + archive-vs-hard-delete (attendance management batch)

Adds an optional `memo` column (`V18`). Adds a real `DELETE /api/start-time-criteria/{id}`
for the first time — previously the only "removal" was deactivation via
`PUT`. `StartTimeCriterionService.delete`:

- No usage history at all (`WorkRecordRepository.existsByUserIdAndAppliedCriterionId`
  and `AttendancePlanRepository.existsByUserIdAndStartTimeCriterionId` both
  false) → physically removed from the table.
- Has history → archived instead (`deleted_at` tombstone, same one-way
  pattern as `checklist_items.deleted_at`) — forces `is_active`/`is_default`
  false, excluded from `GET /api/start-time-criteria` (via
  `findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc`), and `update()`
  now rejects touching an archived row. Deactivating/archiving the current
  default transfers default to another active criterion via the same
  deterministic rule §7 already uses.

`isSelectableForNewUse()` (active AND not archived) is now the single check
for "may this criterion be newly applied/planned" — used by both
`WorkRecordService`'s applied-criterion validation and the new
`AttendancePlanService`'s plan-criterion validation. An already-applied/
planned reference to a criterion that later becomes inactive or archived
remains valid and displayable; only *new* selection is gated on this,
consistent with §6's snapshot-vs-live-reference principle (a `WorkRecord`'s
snapshot never depended on the live row anyway; an `AttendancePlan`'s live
reference simply keeps resolving to the archived row's now-frozen fields).

## 9. Canonical ordering + drag-and-drop reorder (attendance refinement batch)

`출근 기준 관리`'s row order (`AttendanceManagement` page,
`StartTimeCriteriaManagement.tsx`) IS the canonical presentation order —
there is no separate frontend-only ordering. `PUT
/api/start-time-criteria/reorder` (`{ orderedIds: UUID[] }`) persists a full
drag-and-drop reordering: `StartTimeCriterionService.reorder` validates
`orderedIds` names exactly the user's current non-archived sibling set (the
same set `list()` returns), then sets each row's `sortOrder` to its index in
that list via one `saveAll` — a single mutation per completed drag, never a
mutation per drag-over event.

Because every consumer (`list()`, the criterion selector on Work Record/
Today's Work, the Attendance calendar's Quick Plan Popover) already reads
`findByUserIdAndDeletedAtIsNullOrderBySortOrderAscNameAsc`, reordering here
automatically reorders every one of those without any additional wiring.

Reordering is presentation metadata only:

- Never touches `isDefault` — the default-criterion invariant (§7) is
  entirely independent of position; a default criterion can sit anywhere in
  the list.
- Never touches a `WorkRecord`'s applied-criterion snapshot or an
  `AttendancePlan`'s historical read — both are keyed by id, not by
  position, so reordering can never retroactively change a past lateness
  calculation.

Frontend implementation reuses the same dnd-kit pattern already established
for `ActivityCategory` reordering (`PointerSensor` with a 5px activation
distance, `closestCenter` collision detection, a `DragOverlay` compact-chip
preview, optimistic local reorder with rollback on failure) — a flat single
list needs none of the sibling-group collision scoping the nested category
tree required.
