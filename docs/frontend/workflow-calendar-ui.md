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

## Known first-pass gaps (deferred to the next refinement round)

- No live DEV browser QA was completed this pass — port 3000 was occupied
  by what appears to be the user's own running dev server; typecheck
  (`tsc --noEmit`) and `eslint` are clean instead. **Needs a real visual
  pass against REF-01…REF-08 before this is considered done.**
- Week view's Unscheduled Actual list is a single flat panel below the
  grid, not per-day-column as the reference shows (§9 of the product
  policy calls for "each date owns its own small Unscheduled Actual area").
- `PhaseTimeline` shows at most 3 Project rows / 2 Phase rows each with a
  simple `+N` overflow count, no click-through.
- Editing an Unscheduled Actual item's title/category/duration isn't wired
  — only scheduling it (via `ScheduleTimeDialog`) is; full edit only
  becomes reachable once it's scheduled and clicked on the grid.
- No frontend tests were added — this codebase has no test runner
  configured beyond ad hoc `node --experimental-transform-types` scripts
  for a handful of `worklog`/`notes` files (see `package.json`); none of
  those existing scripts cover Calendar.
- Attendance header context is Day-view only; Week view doesn't show a
  per-day or aggregate attendance line yet.
