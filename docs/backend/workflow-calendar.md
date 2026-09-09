# Backend — Workflow Calendar V1

Confirmed product policy: `docs/product/workflow-calendar-policy.md` (read
that first — this document is the persistence/API reference, not the policy
source of truth).

## New domains

| Package | Table | Purpose |
|---|---|---|
| `lifecategory` | `life_categories` | Flat LIFE-owned category list (mirrors `ActivityCategory`, no parent tree). |
| `project` | `projects`, `phases` | Minimal date-first Project/Phase bridge. |
| `lifetime` | `life_time_entries` | LIFE Actual time (mirrors `WorkTimeEntry`/`SupplementalWorkEntry`). |
| `lifestate` | `life_state_entries` | The "State Block" — independent time-state data. |
| `reflection` | `reflection_entries` | WORK_OS's `ReflectionProvider` implementation. |
| `calendar` | *(none — read projection)* | Aggregates every source; owns cross-domain Actual-overlap validation, scheduling, and the Batch Actual Editor. |

## Evolved existing domains

- **`PlannedTimeBlock`** (`plannedtimeblock`): `category_id` renamed to
  `activity_category_id`; added `domain_type` (`WORK`/`LIFE`, required),
  `life_category_id`, `phase_id`. Its prior overlap-blocking validation
  (`PlannedTimeBlockService.validateNoOverlap`) was **removed** — Planning
  overlap is locked-policy allowed. `PlannedTimeBlockRepository.
  existsByCategoryId` is now `existsByActivityCategoryId`.
- **`WorkTimeEntry`** (`worktimeentry`): gained optional `start_at`/`end_at`
  (both-or-neither, DB-enforced) and `phase_id`. `minutes` remains the
  duration source of truth — these columns are display/scheduling only.
  `applyChanges` (used by the WorkRecord replace-all save) deliberately does
  not touch them, so an ordinary Work Log save never clobbers a
  Calendar-assigned schedule; only `schedule()`/`unschedule()`/`setPhaseId()`
  do.
- **`SupplementalWorkEntry`** (`supplementalwork`): gained `phase_id` (it
  already had optional `start_at`/`end_at`).

## Migrations

`V25`–`V31` (see `backend/src/main/resources/db/migration`), all additive.
Before adding a new one, check the actual latest `V<N>` file present —
`docs/GIT_WORKFLOW.md` §11 for why branch state alone isn't proof of what's
applied to the shared DEV database.

## Cross-domain Actual overlap

`calendar.ActualOverlapChecker` is the single place this is enforced. It
resolves a user+date's scheduled intervals across `WorkTimeEntry`,
`SupplementalWorkEntry` (via that date's `WorkRecord`), and `LifeTimeEntry`,
then checks pairwise half-open-interval overlap (touching boundaries
allowed, matching the rest of this codebase's convention). Called from:
`WorkTimeEntryService.schedule`, `SupplementalWorkEntryService.schedule`,
`LifeTimeEntryService.create`/`update`/`schedule`, and
`BatchActualService.commit` (which additionally simulates in-batch
conflicts before touching the database).

Note: the existing `WorkRecord` replace-all save flow
(`WorkTimeEntryService.replaceAll`, `SupplementalWorkEntryService.replaceAll`)
was **not** retrofitted to call this cross-domain checker — that flow's own
overlap validation (self + the record's own clock interval) is unchanged.
Only the new Calendar-specific scheduling actions are cross-domain-aware.
Extending the replace-all flow itself is a reasonable follow-up, not done in
this pass to avoid destabilizing the existing Work Log save path.

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /api/calendar?from&to` | The unified projection — `CalendarRangeResponse` (planBlocks, actualBlocks, unscheduledActual, stateBlocks, attendanceContext, workRecords). |
| `PUT /api/calendar/actual/{sourceType}/{id}/schedule` | Unscheduled Actual → Time Grid, for any `ActualSourceType`. |
| `PUT /api/calendar/actual/{sourceType}/{id}/unschedule` | Time Grid → Unscheduled Actual. |
| `POST /api/calendar/batch-actual` | Batch Actual Editor commit — validate-all-or-persist-none. |
| `GET/POST/PUT/DELETE /api/planned-blocks[...]` | PlanningBlock CRUD, plus `/{id}/reschedule` (drag/resize) and `/{id}/duplicate`. |
| `GET/POST/PUT/DELETE /api/life-categories[...]` | LifeCategory CRUD. |
| `GET/POST/PUT/DELETE /api/life-time-entries[...]` | LifeTimeEntry CRUD. |
| `GET/POST/PUT/DELETE /api/life-state-entries[...]` | LifeStateEntry CRUD. |
| `GET/POST/PUT/DELETE /api/projects[...]`, `/api/projects/{id}/phases[...]`, `/api/phases/{id}` | Project/Phase CRUD. |
| `GET /api/phases/selector` | Every phase, most-recent first, with parent Project — backs the Phase selector. |
| `GET /api/phases/timeline?from&to` | Phases intersecting a date range — backs the Project/Phase timeline widget. |
| `GET/POST/PUT/DELETE /api/reflections/{date}[...]` | Reflection lifecycle (create/autosave content/complete/edit/delete). |
| `GET /api/note-system/reflection-provider` | Now reports `available: true` (previously always `false`) — see below. |

## Reflection / Note System integration

`ReflectionService` implements `notesystem.integration.ReflectionProvider` —
the boundary interface Note System already called (previously always
answering unavailable). The interface's `Snapshot`/`WorkSummary` shape was
extended (nothing implemented it before this pass, so this was a safe,
additive change) to add `stateBlocks`, a `TimeSummary` for LIFE alongside
the existing WORK `WorkSummary`, and explicit `complete`/`reopen` methods.
Snapshot JSON is stored in a native `jsonb` column (`ReflectionEntry.
snapshotJson`, `@JdbcTypeCode(SqlTypes.JSON)`) via a private
`ObjectMapper` + `JavaTimeModule` instance — deliberately not the
application's shared REST `ObjectMapper` bean, so this internal storage
format never depends on unrelated global Jackson configuration.

## Known first-pass limitations

- Batch Actual Editor's WORK path requires an existing workday `WorkRecord`
  for the target date; it does not create or change attendance status
  itself (that decision belongs to AttendancePlan/WorkRecord, out of this
  feature's scope).
- `PhaseService`/`ProjectService` are intentionally minimal (no reordering
  endpoint beyond what's listed, no archival) — sufficient for the Calendar
  bridge, not a Project Management surface.

## Second-pass source editor

`GET/PUT/DELETE /api/calendar/actual/{sourceType}/{id}` and
`POST /api/calendar/actual/{sourceType}` edit original source rows. The editor
body is `{date, categoryId, title, durationMinutes, startTime, endTime, memo,
phaseId}`; reads return those fields plus `sourceType` and `id`. Times must
both be null (unscheduled) or an increasing same-day pair. Duration remains
explicit; callers resizing a block send the changed duration. Null `phaseId`
preserves the existing WORK association.

Cross-date moves retain source identity and revalidate global Actual overlap.
WORK sources require an existing target WorkRecord; regular WorkTimeEntry
also requires a working-day status. Supplemental Work retains the Work Log
regular-clock overlap constraint. Calendar never creates or changes attendance.
Source types cannot be converted through an update.

Delete returns `{undoToken}`. `POST /api/calendar/actual/undo/{undoToken}`
restores the original source identity after ownership, attendance and overlap
checks. Undo lasts 30 seconds and is an ephemeral, process-local affordance;
a server restart expires pending Undo. No additional persistence or migration
is required. Existing schedule/unschedule endpoints remain compatible.

Reflection snapshots now include `unscheduledActual` with the same complete
source DTOs as the Calendar range, and Work/Life actual totals include them.
Older frozen snapshots deserialize with an empty array. Re-completion rebuilds
this data from all Calendar sources, independently of UI visibility filters.
