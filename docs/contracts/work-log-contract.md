# Work Log — API and Domain Contract

The technical contract implementing `docs/product/work-log-policy.md`. Where
this document and an actual `docs/backend/*.md` implementation doc disagree,
treat it as a bug in one of the two and reconcile — this file is the spec,
`docs/backend/*.md` is what's actually built. See `CLAUDE.md` for full
document precedence.

## WorkRecord

One row per `(user_id, work_date)`.

Minimum fields: id, user id, work date, attendance status, clock-in,
clock-out, computed stay-duration minutes, work location, work score, memo,
applied start-time-criterion snapshot (id/name/start-time), optimistic-lock
version, created/updated timestamps.

Derived, never stored on the row itself: net work minutes (sum of
`WorkTimeEntry.minutes`), lateness minutes (computed from clock-in vs. the
snapshot start time).

### API

- `GET /api/work-records?from=YYYY-MM-DD&to=YYYY-MM-DD` — current-user-scoped
  list, ordered by date. Never creates rows.
- `GET /api/work-records/{date}` — single record for one date. No record for
  that date is a normal, expected `204 No Content` — never an error, never a
  fabricated empty record.
- `PUT /api/work-records/{date}` — upsert. Request carries the full desired
  state plus `expectedVersion` (required and checked when a record already
  exists for that date; irrelevant on first creation). A version mismatch
  returns a `409`-class conflict, never a silent overwrite.

### Validation

- Non-working status ⇒ clock times, computed stay-duration, and applied
  criterion must all be absent from the request.
- Working status: clock-out requires clock-in; identical clock-in/clock-out
  is rejected; a clock-out time-of-day earlier than clock-in is interpreted
  as the next local day.
- An applied criterion id must belong to the current user. If it differs from
  whatever the record already had, it must additionally be active — the
  service re-reads the live criterion and freezes a new snapshot only in
  that case. If the client re-sends the same criterion id the record already
  has, the existing frozen snapshot is preserved untouched (the live
  criterion is not re-read), so an unrelated field edit can never silently
  drift a historical lateness calculation.
- Work score, when present, is `0`–`100`.

## WorkTimeEntry

A `WorkRecord`'s ordered, additive time-log children. Implemented as its own
isolated unit on top of `WorkRecord` core — see `docs/backend/work-time-entry.md`
for the actual implementation.

Minimum fields: id, owning `WorkRecord`, `ActivityCategory` child id, item
(free text), minutes (positive), optional memo, position (deterministic
ordering), created/updated timestamps.

Rules:

- Category is required and must resolve to a child (`parent_id NOT NULL`)
  category owned by the current user.
- A newly assigned category must be active; an already-referenced inactive
  category on an existing entry remains valid until explicitly changed.
- `item` is trimmed; blank is rejected.
- Minutes must be `> 0`.
- Replacing a record's entry set only ever touches that record's own rows —
  never another user's or another record's.
- A category-only or memo-only edit never changes the record's total work
  minutes (only `minutes` changes affect the sum).

## ActivityCategory (default-child addition)

See `docs/backend/activity-categories.md` for the implemented contract
(`is_default`, first-child-becomes-default, the set-default endpoint). This
milestone's `WorkTimeEntry` slice consumes that contract by validating every
submitted category id is an active child — it does not re-implement
category logic.

## Ownership

Every endpoint above resolves the current user through `CurrentUserProvider`
and scopes every repository query by that user id. A foreign-owned or
missing id returns the same not-found response — ownership is never
revealed through a different error shape.
