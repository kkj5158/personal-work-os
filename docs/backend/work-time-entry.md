# Work Time Entry

Implements the `WorkTimeEntry` portion of `docs/product/work-log-policy.md`
and `docs/contracts/work-log-contract.md`.

## 1. Table

`work_time_entries` — new in `V8__create_work_time_entries.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key. Unlike every other entity in this codebase, callers may supply this id (see §3) |
| `user_id` | UUID | Denormalized onto the row directly (not just reachable via `work_record_id`) so ownership queries never need a join, matching every other domain's `findByIdAndUserId` convention |
| `work_record_id` | UUID | FK → `work_records(id)`, `ON DELETE CASCADE` |
| `category_id` | UUID | Composite FK → `activity_categories(id, user_id)`, `ON DELETE RESTRICT` — a **live** reference, never snapshotted (see §4) |
| `item` | VARCHAR(200) | Trimmed free text |
| `minutes` | INTEGER | `CHECK (minutes > 0)` |
| `memo` | TEXT | Nullable |
| `position` | INTEGER | `CHECK (position >= 0)`, `UNIQUE (work_record_id, position)` — deterministic ordering |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard audit timestamps |

## 2. Live category reference, not a snapshot

This is the one deliberate asymmetry with `WorkRecord`'s applied
start-time-criterion: `WorkTimeEntry.categoryId` is a genuine live reference.
`ActivityCategory` is shared across Planning and the future time calendar —
if a category is renamed, every place that displays it (including old
entries) must reflect the new name immediately. There is no
`category_name`/`category_snapshot` column, by design.

What *is* preserved is the **reference itself**: an entry that already
points at a category which has since been deactivated keeps pointing at it
— it is never silently cleared or reassigned. Only *newly* assigning a
category (a brand-new entry, or changing an existing entry to a different
category) requires that category to be active. See §5.

## 3. Replace-all persistence model

`PUT /api/work-records/{date}` carries the record's **complete** entry list
(`WorkRecordRequest.workTimeEntries`), matching the frontend's own save
model — the whole list is always resent together, never a partial patch.
`WorkTimeEntryService.replaceAll(workRecordId, items)`:

1. Loads the record's current rows, keyed by id.
2. For each incoming item, in order (its list index becomes its `position`):
   - If its `id` matches one of the record's own current rows, that row is
     **updated in place** — identity survives the edit.
   - If its `id` is `null`, or doesn't match any of this record's current
     rows, a **new** row is created. A client-supplied `id` that doesn't
     belong to this record is still checked against the whole table first
     (`existsById` / `findByIdAndUserId`) — reusing an id that belongs to
     another record (or, defensively, another user) is rejected outright
     rather than risking a raw primary-key collision or, worse, silently
     reparenting someone else's row.
3. Any of the record's current rows not claimed by the incoming list are
   deleted.

This is why the entity accepts a caller-supplied id (see `WorkTimeEntry`'s
Javadoc) — every other entity in this codebase self-generates its id,
because nothing else needs cross-request identity stability for a
client-driven collection like this.

## 4. Category validation

- `categoryId` is required on every entry.
- Resolving a **new** selection (brand-new entry, or an id different from
  what the row already had) requires: the category exists and is owned by
  the current user (`ResourceNotFoundException` otherwise), is a **child**
  (`parent_id IS NOT NULL` — a root is rejected with `InvalidRequestException`),
  and is **active** (inactive rejected with `InvalidRequestException`).
- Resolving an **unchanged** selection (the id matches the row's existing
  `categoryId`) skips all of the above entirely — the category repository
  is not even consulted — so a historical entry's reference to a
  since-deactivated category survives untouched across unrelated edits
  (e.g. a memo-only save).

## 5. Other validation

- `item`: required, trimmed; blank is rejected.
- `minutes`: required, must be `> 0`.
- `memo`: optional; trimmed, empty string normalized to `null`.

## 6. Totals

Net work minutes are **never** stored — `WorkTimeEntryService.sumMinutes`
computes the sum on demand, and `WorkRecordResponse.netWorkMinutes` exposes
it alongside the record. A category-only or memo-only edit never changes
this sum, since it only ever depends on `minutes`.

## 7. Ownership

Every query is scoped by `user_id` — either directly (the entry's own
denormalized column) or transitively (the category composite FK, the parent
record's own already-ownership-checked lookup). `WorkTimeEntryService` never
accepts a `work_record_id` from client input; it is always the id of a
`WorkRecord` already resolved through `CurrentUserProvider`-scoped lookup in
`WorkRecordService`.
