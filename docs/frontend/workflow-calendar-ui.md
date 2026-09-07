# Frontend — Workflow Calendar V1

Confirmed product policy: `docs/product/workflow-calendar-policy.md`.
Reference images: `docs/assets/calendar/` (`REFERENCE_IMAGE_MAP.md`).

## Route

`/calendar` (sidebar: WORKFLOW → 캘린더). The pre-existing `/planning` route
is untouched and still works — it was only updated at the field-name level
(`categoryId` → `activityCategoryId`, `domainType: "WORK"` default) to match
the backend's evolved `PlannedTimeBlock` contract. Consolidating `/planning`,
`실행`, and `회고`'s inert Sidebar placeholders into the new `/calendar`
route is a reasonable next-round follow-up, not done in this pass to keep
the change additive and low-risk.

## Component map (`frontend/app/calendar/`)

- **`TimeGrid`** — the core Day/Week grid. Generalizes `app/planning/
  PlanningGrid.tsx`'s hand-rolled pointer-event drag/resize/snap engine
  (same 15-min snap, same `PX_PER_MIN` math) rather than introducing a new
  grid library or `@dnd-kit` (already installed, but reserved for sortable
  lists elsewhere in this codebase — the time-grid drag stays consistent
  with Planning's existing convention). `interactionMode="plan"` allows
  blank-space drag-to-create; `"actual"` does not (Actual is created via
  explicit dialogs).
- **`layoutLanes.ts`** — cluster-based lane packing for Planning overlap:
  connected-component grouping by pairwise overlap, then greedy interval
  scheduling within each cluster. A block with no overlap is its own
  one-lane cluster and renders full width.
- **`StateRail`** / **`WeekStateStrip`** — Day's dedicated left column vs.
  Week's compact per-day-column strip (both in `StateRail.tsx`).
- **`DayCompareView`** / **`WeekCompareView`** — Compare layouts. Both mount
  two `TimeGrid`s and mirror `scrollTop` between them via a shared ref +
  `onScroll` callback (see `TimeGrid`'s `scrollContainerRef`/`onScroll`
  props) so the two time axes stay visually aligned while scrolling.
- **`CalendarBlockEditDialog`** / **`LifeActualEditDialog`** /
  **`BatchActualEditor`** / **`ReflectionModal`** — all built on
  `app/worklog/WorkLogModal.tsx` (its a11y focus-trap shell), not the
  simpler `components/ui/Modal.tsx` Planning depends on — matching that
  file's own documented reuse intent. `WorkLogModal` gained an `"xlarge"`
  (1200px) size for the Reflection modal.
- **`calendarColor.ts`** — Project/Activity color-mode resolution.
  `resolveBlockColor` takes a minimal `{id, projectId}`/`{id, colorToken}`
  shape (not the full `PhaseDto`/`ProjectDto`) so `PhaseWithProjectDto[]`
  from the `/api/phases/selector` fetch can be passed straight through
  without remapping.

## Live DEV visual QA (2026-09-08)

Ran both the backend and frontend from this worktree (frontend on an
alternate port, 3001, since 3000 was occupied by another running dev
server — a `calendar-worktree-frontend`/`calendar-worktree-backend` pair was
added to the main worktree's `.claude/launch.json` for this) and reviewed
the real running app against REF-01…REF-08 end to end, creating live test
data (a LIFE Actual entry, a State entry via direct API call, a completed
Reflection) to exercise every surface with real content. Two real bugs were
found and fixed this way — see the `fix(work-os): visual-QA fixes` commit —
that no amount of `tsc`/`eslint` could have caught:

- `GET /api/phases/selector` 409'd unconditionally (`LocalDate.MIN`/`MAX`
  sentinel bounds exceeded PostgreSQL's actual `date` range).
- The Batch Actual Editor crashed with a raw constraint-violation 409
  instead of a clean per-row message when committing a WORK item with no
  category (`work_time_entries.category_id` is `NOT NULL`).

Both known gaps from the first-pass report are now confirmed fixed and
verified live: Week's Unscheduled Actual is per-date
(`WeekUnscheduledActualRow`), and the attendance-context header now renders
in Week mode too. Day view's centering was also confirmed broken and fixed
in the same pass — the page-level `max-w-[1400px]` wrapper only has any
effect once the viewport exceeds ~1640px, so at normal desktop widths the
Day grid was stretching full-bleed; a dedicated `mx-auto max-w-[...]`
wrapper now scopes the narrower width to the Day content itself.

Confirmed working end-to-end with live data: Day/Week × Plan/Actual/Compare
grids, State Rail (Day) and per-column State strip (Week), the Project/Phase
timeline, Batch Actual Editor's validate-all-or-persist-none behavior
(including a genuine cross-domain overlap rejection against a live LIFE
Actual entry), and Reflection completion generating a correct PLAN/ACTUAL/
STATE snapshot with accurate planned/actual/delta/WORK totals.

## Known first-pass gaps (deferred to the next refinement round)

- `PhaseTimeline` shows at most 3 Project rows / 2 Phase rows each with a
  simple `+N` overflow count, no click-through.
- Editing an Unscheduled Actual item's title/category/duration isn't wired
  — only scheduling it (via `ScheduleTimeDialog`) is; full edit only
  becomes reachable once it's scheduled and clicked on the grid.
- `BatchActualEditor` has no per-row category picker — a plan block with no
  (or an invalid) category can only be excluded from the batch, not fixed
  in place, since `BatchActualService` now correctly rejects it.
- There is no frontend UI anywhere to create or edit a `LifeStateEntry`
  (State Block) — the State Rail/strip render existing state data
  correctly (verified via a state entry created directly through the API),
  but nothing in the Calendar UI lets a user record one. This needs a
  small dedicated dialog next round.
- With very short blocks (e.g. a 1-hour Plan block on an 18-hour Reflection
  timeline), the rendered bar can be too narrow to show its own label —
  needs a minimum readable width or a truncation/tooltip fallback.
- No frontend tests were added — this codebase has no test runner
  configured beyond ad hoc `node --experimental-transform-types` scripts
  for a handful of `worklog`/`notes` files (see `package.json`); none of
  those existing scripts cover Calendar.
