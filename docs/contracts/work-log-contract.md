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
applied start-time-criterion snapshot (id/name/start-time), the "정시 출근
처리" on-time override flag, optimistic-lock version, created/updated
timestamps.

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
- `POST /api/work-records/{date}/clock-in`, `.../clock-out` — server-timestamped
  actions restricted to today, operating only on an already-existing record.
  `POST /api/work-records/{date}/clock-times/clear` — clears both clock
  times, the derived duration, and the on-time override together; any date;
  blocked while work-time entries exist. All three take `{expectedVersion}`.
  See `docs/backend/work-record.md` §9 for the full rationale/rules.
- `POST /api/work-records/{date}/absence-correction` — 결근 정정. Same body
  shape as `PUT`; only eligible when the record's current status is
  `ABSENT`. See `docs/backend/work-record.md` §11.

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

## Error contract

Every error response, across every Work Log (and non-Work-Log) endpoint, is
`{"message": "..."}`. `ApiExceptionHandler` (`backend/.../common/ApiExceptionHandler.java`)
is the single source of every mapping:

| Status | Meaning |
|---|---|
| `400` | `InvalidRequestException` (validation), or a malformed request body/content-type |
| `404` | `ResourceNotFoundException` / `WorkSettingsNotFoundException` — missing and foreign-owned are always identical |
| `409` | `OptimisticLockConflictException` (stale `expectedVersion`), or a `DataIntegrityViolationException` from a genuine constraint race outside that check |
| `500` | anything else — logged server-side only |
| `204` | (not an error) — see each domain's own doc for where a missing resource is a normal empty state rather than a 404 |

The `500`/`409`-from-`DataIntegrityViolationException` handlers never
include the underlying exception's own message, class, or cause in the
response — a raw JDBC/Postgres exception message can contain constraint
names, column values, or (in principle) connection details, none of which
belong in a client-facing response. Only the deliberately hand-written
messages our own service code throws (`InvalidRequestException`,
`ResourceNotFoundException`, etc.) are ever echoed back.
