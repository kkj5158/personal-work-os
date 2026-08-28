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
- Past dates that the user's own Planning schedule expected to be a work
  day, but which received no record at all, eventually receive an explicit
  `ABSENT` row through the absence backfill scheduler — see
  `docs/backend/work-record.md` §10. A date planned as a day off/leave is
  never turned into an absence just because it has no row.
- Reading a record must never create one as a side effect.
- Dates and times follow the application's existing single-timezone policy
  (`AppTimeZone`, `Asia/Seoul`) — the same convention already used by
  Planning.

## Attendance

Canonical statuses: `WORK`, `EARLY_LEAVE`, `HALF_DAY`, `DAY_OFF`,
`PAID_LEAVE`, `SICK_LEAVE`, `ABSENT`. `HALF_DAY` ("반차") was added in the
post-production iteration 1 batch — see "Leave allowance and half-day"
below.

- `ABSENT` is a persisted value (once the deferred scheduler exists to write
  it, or a user/future-flow sets it directly).
- There is no "unrecorded" attendance enum value — that state is always
  represented by the row's absence, per the section above.

### Status transitions (working ↔ non-working)

`WORK`, `EARLY_LEAVE`, and `HALF_DAY` are the **working** ("work-included")
statuses — the only ones that may carry clock times, an applied
`StartTimeCriterion` snapshot, the on-time override, `WorkTimeEntry` rows,
and a work score. `DAY_OFF`, `PAID_LEAVE`, `SICK_LEAVE`, and `ABSENT` are
**non-working** — none of them may retain any of those fields; `memo` is the
only field a non-working record shares with a working one.

- **Working ↔ working** (`WORK` ↔ `EARLY_LEAVE` ↔ `HALF_DAY`): every field
  is preserved untouched — this is purely a status relabeling. Entering
  `HALF_DAY` consumes 0.5 day of that date's month's leave allowance;
  leaving it returns 0.5 day — see "Leave allowance and half-day" below.
- **Working → non-working**: clock-in, clock-out, the applied criterion
  snapshot, the on-time override, and work score are all cleared
  (`workScore` becomes `null`, never `0`) — `memo` is preserved. **Post-
  production iteration 1 policy change**: unlike the other cleared fields,
  `WorkTimeEntry` rows are never silently cleared as part of this
  transition — if any exist on the record, the transition is rejected
  outright (`InvalidRequestException`, "Remove this date's work-time
  entries before changing to a non-working status") until the user deletes
  them first via a separate save. This supersedes the original MVP policy
  (recorded in `docs/backend/work-record.md`'s history), which allowed the
  frontend to atomically clear entries as part of the same request; the
  frontend's non-working-transition confirmation now blocks outright
  instead of clearing when persisted entries exist. Entering a non-working
  leave-consuming status (`PAID_LEAVE`) is also subject to the leave-balance
  check below.
- **Non-working → working**: starts a clean working state — clock times,
  the applied criterion, the on-time override, work score, and
  `WorkTimeEntry` rows are never resurrected from whatever the record held
  the last time it was a working status. `memo` is preserved.
- **Non-working ↔ non-working**: no working-only field can be present on
  either side, so this is also a simple relabeling. Leaving `PAID_LEAVE`
  returns its 1.0 day of leave; entering it consumes 1.0 day, subject to
  the same balance check.
- **Any transition away from a currently-`ABSENT` record** — regardless of
  the destination status — is always an absence correction
  (`POST /api/work-records/{date}/absence-correction`), never a plain
  `PUT`. This is not a separate rule from the two above; it composes with
  them (e.g. `ABSENT` → `WORK` is simultaneously "non-working → working,
  starts clean" *and* "routed through the correction endpoint").
- A missing row (미입력, see above) is never itself a transition endpoint —
  there is no status to transition *from* until a row exists.

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
- A category may be physically deleted, but only when doing so cannot
  damage historical or persisted business data: an unused category (no
  `WorkTimeEntry` or `PlannedTimeBlock` references it, checked at delete
  time) may be deleted outright, including an unused default child; a
  category currently in use is rejected (400), never silently ignored —
  deactivate it instead; a root with any remaining children (active or
  inactive) is likewise rejected until every child is gone first —
  deletion never cascades. Because an in-use category can never be
  deleted, no historical row can ever end up pointing at a category that
  no longer exists. See `docs/backend/activity-categories.md` for the
  exact enforcement.

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

## Leave allowance and half-day (post-production iteration 1)

- The user manually configures a leave allowance per calendar month (`docs/backend/leave-allowance.md`) — there is no carryover between months and no automatic accrual.
- A month with no configured allowance is distinct from one explicitly set to `0.0` — the former blocks selecting `PAID_LEAVE`/`HALF_DAY` at all ("Configure this month's leave allowance first."); the latter means the user explicitly has none available.
- Usage is never stored as a separate number — it is always derived fresh from that month's `WorkRecord` statuses (`PAID_LEAVE` = 1.0 day, `HALF_DAY` = 0.5 day), so it can never drift out of sync with actual attendance history.
- The configured allowance for a month may never be set below leave already used that month (leave balance can never go negative).
- Selecting `PAID_LEAVE` or `HALF_DAY` is validated against **that record's own date's month**, not the current calendar month — editing a historical date is judged by its own month's allowance/usage, computed excluding whatever that same date already consumed (so re-saving an unrelated field on an already-`HALF_DAY` date never double-counts its own prior 0.5 against itself).
- `HALF_DAY` ("반차") is a work-included status like `WORK`/`EARLY_LEAVE` — normal check-in/out, applied criterion, lateness, on-time override, `WorkTimeEntry` rows, and work score all apply exactly as they do for `WORK`. It is not assumed to be any fixed number of work hours; all statistics use the actually recorded values. It is distinct from `EARLY_LEAVE` (unplanned, consumes no leave).
- Monthly attendance statistics show `HALF_DAY` as its own visible bucket, separate from `PAID_LEAVE` — never collapsed together — while leave-usage statistics correctly count two half-days as one full leave day consumed.
- `근무일` (workday) counting includes `HALF_DAY` alongside `WORK`/`EARLY_LEAVE`.

## Daily Work Checklist (post-production iteration 1)

See `docs/backend/checklist.md` for the full domain design (permanent item identity vs. effective-dated versions, the daily snapshot/result model, the max-6-active-items invariant, and the equal-day-weighted achievement calculation). Product-level summary:

- A checklist item's identity is permanent; renaming/re-emoji-ing/reclassifying it creates a new effective-dated version, never a new item. Only an explicit delete (a one-way tombstone) retires an item permanently.
- At most 6 items may be simultaneously active.
- Checklist applies only to work-included dates (`WORK`/`EARLY_LEAVE`/`HALF_DAY`) — a non-applicable date's preserved results are never deleted, only excluded from evaluation/statistics until the date returns to a work-included status.
- Today's unchecked items are "not yet determined," never a confirmed failure — only a past date's unchecked item counts as "not achieved."
- Achievement rate is calculated as the mean of each valid day's own rate (equal-day weighting) — a day with 6 active items never outweighs a day with 2 in a period average.

## Absence correction

`ABSENT` rows (see the backfill scheduler, `docs/backend/work-record.md`
§10) must be correctable through a detail action labeled `결근 정정`
("absence correction"). The MVP version of this is a direct record
correction; a document-submission/approval workflow is a later idea, not
committed. The backend correction endpoint is part of this milestone; the
frontend UI for it is not (no such UI exists on the frontend today at all
— see the Work Log frontend audit referenced from
`docs/project/work-log-roadmap.md`).

## Default start-time criterion (post-production iteration 1)

If a user has at least one active `StartTimeCriterion`, exactly one active criterion is always their default; if none are active, there is naturally no default. The first criterion ever created becomes the default automatically; deactivating the current default deterministically promotes another active one (or leaves none, if it was the last). Today preselects the default automatically (persisted immediately, since clock-in requires an already-applied criterion) so the user can normally check in without touching the selector — see `docs/backend/start-time-criteria.md`.

## ActivityCategory ordering and move (post-production iteration 1)

Top-level categories and each parent's children now have a persisted drag-and-drop order (`sortOrder`, previously always `0`). Moving a subcategory to a different top-level category is a deliberate explicit action (never a cross-parent drag), always appending to the destination's end — see `docs/backend/activity-categories.md`. This is unrelated to and does not change the existing "no historical snapshot for work-time categories" policy (§"ActivityCategory" above) — renaming/moving still reclassifies historical `WorkTimeEntry` display under the current hierarchy.

## Daily Work chart targets (post-production iteration 1)

Simple current-value-only targets (actual work time, work score) back the new Daily Work chart's baselines — deliberately no effective-dated history for this iteration (a changed target applies to historical chart comparisons too). See `docs/backend/work-chart-target.md`.

## Ownership and concurrency

- Every read and write is scoped to the current authenticated user
  (`CurrentUserProvider`) — a client-supplied user id is never trusted.
- A foreign-owned or missing id is handled through the repository's existing
  not-found convention (indistinguishable from each other in the response).
- `WorkRecord` updates use optimistic locking: the API exposes a version, and
  an update must supply the version it read. A stale version produces a
  clear conflict response, never a silent overwrite.

## Current milestone vs. deferred

**Original MVP milestone:** the full Work Log backend MVP — `ActivityCategory`
default-child contract, `WorkRecord` backend core (including the on-time
override and dedicated clock-in/out/clear actions), categorized
`WorkTimeEntry` persistence, the `ABSENT` backfill scheduler, absence
correction, and their supporting documentation/tests. See
`docs/project/work-log-roadmap.md` for exactly what's implemented.

**Post-production iteration 1** (this batch): monthly leave allowance +
`HALF_DAY`, default start-time criterion, direct `HH:mm` time input,
Daily Work chart + targets, the Daily Work Checklist system (domain,
daily UI, management, three-view analytics), and `ActivityCategory`
ordering/move. Implemented on `feat/worklog-post-prod-iteration-1`;
see the iteration record under `docs/iterations/` for the full list and
known follow-ups. Explicitly deferred from this batch: a week/month
compressed checklist table cell (checklist is otherwise fully usable via
Today/Daily-view/management/analytics), a full search-and-category emoji
picker (a curated quick-pick grid plus free text stands in for now), and
true multi-series overlay in the checklist Overall Achievement Trend chart
(a toggle switches between Overall/Core/Secondary instead).

**Deferred (frontend-only, not part of the backend MVP):**

- Frontend real API integration (Work Log currently runs entirely on local
  mock data) and removing its mocks.
- The `결근 정정` frontend UI (the backend correction endpoint is part of
  this milestone — see `docs/backend/work-record.md`).
- Optimistic-lock conflict UI, loading/empty/validation/error states.
- Deployment and any production migration.
