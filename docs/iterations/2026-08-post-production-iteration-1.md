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

## Continuation: Work Log IA split + checklist matrix table

A later continuation of this same batch (still on
`feat/worklog-post-prod-iteration-1`), closing the "week/month table
compressed checklist cell" gap noted above and restructuring the IA per
product feedback that checklist completion competing with the Work Record
page for attention was the wrong shape.

- **Split into two pages.** 근무 기록 (`/worklog`) keeps everything
  attendance/clock/work-time/score/memo/leave/charts-related. A new 근무
  체크리스트 page (`/worklog/checklist`) is the only place checklist
  completion happens now — the Today summary and Daily view on 근무 기록 no
  longer render any checklist UI, not even a read-only indicator.
  `DailyChecklistPanel.tsx` was deleted (fully unused after the removal).
  Sidebar gained a "근무 체크리스트" entry visually grouped under "근무 기록"
  (a flat list with an `indent` flag — the sidebar has no collapsible
  parent/child primitive, and building one was judged out of scope for this
  pass).
- **Checklist record matrix table** (`ChecklistMatrixTable.tsx`) — one row
  per calendar date in the selected month, one column per checklist item
  that appears in at least one daily snapshot within that month (the union,
  not just the six currently-active items). Backed by a new batched
  `GET /api/checklist-daily/matrix?from&to` endpoint
  (`ChecklistDailyService.getMatrix`, see `docs/backend/checklist.md` §12) —
  no N+1 per-date fan-out, and no new migration (100% existing entities/
  repositories). A `—` cell means the item didn't apply to that date (non-
  work day, or the item didn't exist/wasn't active yet); checkbox cells save
  immediately via the existing `PUT /api/checklist-daily/entries/{id}/achieved`.
- **Column drag-and-drop reordering** reuses
  `PUT /api/checklist-items/reorder` unchanged, scoped to within one
  category's sibling group (matching `ChecklistManagementModal`'s own
  `handleDrop` pattern exactly) — a flat cross-category order isn't
  expressible via that endpoint without either a schema change or a
  surprising implicit category move on drag, and neither was judged
  worthwhile here. Management order and matrix column order are therefore
  always the same persisted `ChecklistItem.position` value; after a
  successful drag the frontend simply re-fetches the matrix rather than
  maintaining its own column-order state. A deleted item can still surface
  as a historical column (frozen snapshot name/emoji) but is never
  draggable.
- **Checklist analytics moved from modal to page.** The three-view
  analytics content was extracted from the retired `ChecklistAnalyticsModal`
  into `ChecklistAnalyticsContent.tsx` (no props, no modal shell) and now
  renders as a full-width section of the 근무 체크리스트 page — same
  calculations, same shared range control, presentation-only change.
- **Korean IME input bug (checklist name field) fixed at the shared
  `WorkLogModal` level**, not a per-caller workaround. Root cause: a single
  `useEffect` that both ran the initial-focus logic and installed the
  Escape/Tab keydown handler was keyed only on `[onClose]`, and several
  callers pass a sequence of `if (x) return (<WorkLogModal>...)` branches
  with no differentiating `key` — React reconciles those as the *same*
  component instance being updated in place (not remounted) across a phase
  change, so the child input's own composition/focus state could be
  clobbered by the effect re-running mid-IME-composition. Fixed by splitting
  the effect by concern (focus-on-mount vs. keydown-subscription) and adding
  a distinct `key` per logical modal phase in every multi-phase caller
  (`ChecklistManagementModal`, `ChecklistCategoryModal`,
  `CategoryManagementModal`, `WorkLogRecordDetailModal`) — this protects any
  current or future `WorkLogModal` caller with the same multi-phase-branch
  shape, not just the checklist form that surfaced it.

Validation: full backend suite green; frontend `tsc --noEmit`, `next lint`,
and `next build` all clean. Live-smoke-tested against the real DEV database
(backend restarted to pick up this session's code — the previously-running
dev process predated these changes and briefly 500'd on the new endpoint
until restarted): matrix rendering, union/historical `—` semantics,
immediate-save checkbox persistence across reload, drag-and-drop column
reorder persistence (verified both via the UI's own drag path and via
directly exercising the same `reorderChecklistItems` API call the drag
handler makes), deleted-item historical column display, and the Korean IME
fix (full multi-character string entered in one pass, focus retained).
Two temporary items were created directly against the DEV database while
constructing test data for the drag-and-drop and union-column scenarios: a
second checklist item ("Drink Water") was created, exercised, and then
soft-deleted again (its tombstone will show up as a historical-only column
around 2026-08-30 going forward — expected lifecycle, not a defect); a
`WorkRecord` for 2026-08-30 (a future date, status `WORK`, no other data)
was also created to give that second item an entry to attach to, and
**could not be removed afterward** — no delete endpoint exists for
`WorkRecord`. This is disclosed here rather than silently left for someone
to puzzle over later.
