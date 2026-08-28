# Iteration: Post-Production Feature Batch 1 (2026-08)

Status: implemented on `feat/worklog-post-prod-iteration-1`, pushed to
`origin`, not merged into `dev`. Awaiting independent Codex review before
any promotion decision.

This is a record of *what happened in this iteration and why* — not a
step-by-step transcript. For the durable current-state facts this iteration
established, see `docs/product/work-log-policy.md` and the `docs/backend/*`
docs it points to; this file is the "how/why," not the source of truth.

## Scope

The first feature batch after Work Log's initial production release
(`prod` at `33d3682`). Six requirements, delivered as one coherent feature
branch: monthly leave allowance + half-day leave, a default start-time
criterion, direct 24-hour time input, a Daily Work chart with targets, a
Daily Work Checklist system (the largest single piece), and
`ActivityCategory` drag-and-drop ordering + explicit move.

## What was built

See `docs/product/work-log-policy.md`'s per-feature sections and the
`docs/backend/*.md` docs they link to for the confirmed policy and
implementation detail. Summary only:

1. **Leave allowance + `HALF_DAY`** (`docs/backend/leave-allowance.md`) —
   user-configured monthly allowance, usage always derived fresh from
   `WorkRecord` statuses (never stored independently), `HALF_DAY` added as
   a third work-included attendance status consuming 0.5 leave day.
2. **Default start-time criterion** (`docs/backend/start-time-criteria.md`
   §7) — at-most-one-default invariant, auto-preselected and
   auto-persisted on Today.
3. **Direct `HH:mm` time input** — `TimeTextInput` replaces the native
   `input[type=time]`-based `TimeInput` (deleted) across every editable
   check-in/check-out surface.
4. **Daily Work chart + targets** (`docs/backend/work-chart-target.md`) —
   current-week Time/Score chart with a dashed target baseline;
   deliberately no effective-dated target history this iteration.
5. **Daily Work Checklist** (`docs/backend/checklist.md`) — the largest
   piece: permanent item identity + effective-dated versions, single-level
   categories, a daily snapshot/result model, the equal-day-weighted
   achievement calculation, and three analytics views.
6. **`ActivityCategory` ordering + move** (`docs/backend/activity-categories.md`
   §5d/§5e) — persisted `sort_order` (previously always `0`), and an
   explicit move-to-different-parent action (never a cross-parent drag).

## Notable design decisions made during implementation

- **Work-included → non-work entries guard is a deliberate policy
  tightening, not a bug fix.** Research before implementation found the
  actual pre-iteration backend behavior silently deleted `WorkTimeEntry`
  rows on this transition (no guard existed, contrary to what the iteration
  brief assumed was "the existing rule"). Per the brief's own precedence
  ("requirements are the source of truth for this iteration's intended
  behavior"), the hard-block guard was implemented as specified, and the
  frontend's non-working-transition flow was updated to match — see
  `docs/backend/work-record.md` §12b for the full before/after.
- **Checklist version immutability boundary is "before today," not
  "already saved."** A version effective *today* remains editable in
  place; only a version whose effective date is strictly in the past is
  locked. This avoids blocking an ordinary same-day correction while still
  protecting real historical fidelity — see `docs/backend/checklist.md` §2.
- **Checklist daily snapshot/restore needed no special-casing.** Because
  applicability is always derived live from the parent `WorkRecord.status`
  rather than stored on the entry, and the snapshot step is idempotent
  (skips if any entries already exist for that record), first-creation,
  non-work→work transitions, and "returning to work-included restores
  preserved results" all fall out of the same one code path — see
  `docs/backend/checklist.md` §5–6.
- **No new frontend dependency was introduced.** Category and checklist
  drag-and-drop reordering use native HTML5 drag-and-drop rather than
  `@dnd-kit` or similar, matching this frontend's existing dependency-free
  approach to interactive widgets (the chart layer is all hand-rolled SVG).

## Explicitly deferred / simplified (see `docs/product/work-log-policy.md`)

- A week/month table compressed checklist cell was not built — checklist is
  still fully usable via Today, the 일 (daily) view, management, and
  analytics. Would need a batch per-range checklist endpoint (today's
  `/api/checklist-daily/{date}` is per-date only) plus a new table column.
- The checklist emoji picker is a curated quick-pick grid plus free-text
  entry, not a full search/category picker.
- The checklist Overall Achievement Trend chart shows one series
  (Overall/Core/Secondary) at a time via a toggle, not true layered
  overlay — the shared chart component is single-series by design.

## Validation performed

- Full backend test suite (`./gradlew test`) green throughout, including
  the real-datasource `contextLoads` test (confirms V13–V16 apply cleanly
  against the actual DEV Supabase schema).
- Frontend `tsc --noEmit` and `next lint` clean for every file touched;
  the 6 pre-existing lint errors (Planning, Sidebar — untouched by this
  iteration) are unchanged.
- See the branch's final implementation report (session transcript) for
  the full command/test list and any live-smoke-test results performed
  against the real DEV database.
