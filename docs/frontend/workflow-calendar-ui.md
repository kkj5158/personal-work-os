# Frontend — Workflow Calendar V1, second pass

Product policy: `docs/product/workflow-calendar-policy.md`.
Visual references: `docs/assets/calendar/REFERENCE_IMAGE_MAP.md`.

## Surface and ownership

`/calendar` has its own full-height rail / grid / editor shell. The WORK sidebar
is hidden here; Calendar is the final system-switcher item after WORK OS and
NOTE SYS. Day/Week and Planning/Execution/Compare are internal modes.
Source-owned Actual entities, categories and Reflection lifecycle remain intact.
Project/Phase schema and hooks are preserved, with unfinished UI hidden.

## Implementation map

- `page.tsx`: range projection, selection, optimistic move rollback, shared
  editor, Day side-by-side / Week stacked Compare and synchronized scrolling.
- `TimeGrid.tsx`, `layoutLanes.ts`: 15-minute snapping, 30-minute click drafts,
  drag create/move/resize, cross-day moves, progressive edge scrolling, real
  overlap lanes, selection/ghost/conflict previews. Column width never depends
  on event count. Context uses a constant activity inset.
- `CalendarRail.tsx`, `appearance.ts`: always-present mini month, source category
  hierarchy and order, indeterminate visibility tree, inactive option, quick
  colors and bulk color/display settings. `calendar.appearance.v1` localStorage
  is Calendar presentation data, never domain category metadata.
- `CalendarEditor.tsx`, `editorModel.ts`, `useCalendarEditor.ts`: full persistent
  editor; serialized first-title Planning create and debounced updates;
  explicit Actual/State saves; inline unsaved guard; immediate delete + Undo.
  WORK Actual creation distinguishes regular and supplemental sources and
  requires an existing Work Log, preserving attendance ownership.
- `WeekUnscheduledActualRow.tsx`: independent per-date unscheduled entries in
  Execution and Compare, opening the same full editor.
- `ReflectionModal.tsx`: shared by Calendar and NOTE SYS with date/context.
  Serialized body autosave flushes before close/complete. Re-completion
  regenerates the unfiltered server snapshot, including unscheduled totals.
- `ReflectionTimeline.tsx`: aligned 00–24 PLAN / ACTUAL / thin STATE rows.

## Contracts and limits

State defaults off in Planning and on in Execution/Compare; Compare shows it
only with Actual. It has direct rail creation and side editing, with server
State-vs-State overlap validation. Actual conflicts use all fetched source
records regardless of visibility, plus authoritative backend validation.

Attendance headers show source status and planned net duration. The source
AttendancePlan does not store start/end bounds, so Calendar shows a subtle
day context tint rather than inventing working hours. `workingRanges` is an
optional grid contract for actual source bounds when available.

Preferences are browser-local. Actual Undo preserves source identity using an
owner-bound, process-local 30-second server token; the snackbar is 8 seconds.
Plan/State Undo recreates the deleted values. Applied V25–V31 are unchanged.

## Validation

Focused frontend tests cover lane geometry, midnight boundaries, hidden-source
conflicts, pointer create/rejection, serialized autosave/failure retention,
Actual explicit save/guard, category propagation and inheritance, and Reflection
version/flush behavior. Run:

```powershell
npx tsx --test app/calendar/layoutLanes.test.ts app/calendar/calendarEditor.test.ts lib/notes/reflection-autosave.test.ts
npx tsc --noEmit
```

For isolated local browser QA, `NEXT_DIST_DIR` can select a separate Next output
directory, avoiding an existing dev server lock. Use port 3001 and a separate
backend port if needed. Browser QA covers all six view/mode combinations,
normal/overlapping plans, Actual rollback and Undo, context geometry, per-date
unscheduled entries, visibility and shared Reflection lifecycle.
