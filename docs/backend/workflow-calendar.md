## Simple state conversion contract

The latest policy replaces Execute/End in everyday Calendar interaction.
`POST /api/calendar/state` accepts `{kind, id, sourceType?, targetState,
actual?, plan?}` and returns one `{kind, id, sourceType?}` reference. Kind/state
are `PLAN` or `ACTUAL`; Actual references include their existing source type.
The operation locks the owner row and commits domain Actual persistence and
retained Plan provenance atomically. The ordinary projection excludes converted
Plans and legacy linked Plans, so the user sees one block.

V48 adds only nullable conversion-source, preferred-source and retained-duration
metadata to `planned_time_blocks`, plus a scoped unique index. No historical
records are rewritten. Unscheduled duration and supplemental source identity
survive correction to Plan and conversion back. WORK still requires an existing
valid WorkRecord. Calendar writes advance its revision to protect against stale
aggregate edits in Work Log.

Actual date rules use Asia/Seoul: past/today allowed, including later clock times
today; tomorrow and later rejected. Clipboard and Calendar move paths convert
future Actual results to Plan. Plan contributes no Actual statistics; source
Actual rows are the sole live totals authority. Completed Reflection snapshots
remain historical and refresh only when explicitly re-completed.

Legacy Execute/End endpoints remain compatibility APIs. New Calendar UI does
not expose them. Existing running rows remain readable; ordinary state
correction resolves their legacy relationship transactionally.

## Historical: Unified Calendar contract (2026-09-20)

V45 adds `execution_start_at` to original `work_time_entries` and `life_time_entries` plus `calendar_plan_executions`, which stores typed FK relationships only (no copied Actual content). Zero duration is permitted only on a running domain row; finalized sub-minute execution uses the domain minimum of one minute while exact timestamps remain intact. A user-row transaction lock plus partial unique index prevents concurrent running links across application instances. Plan deletion is blocked while running. Cancel/finish/history are transactional; failed replacement execution rolls back a confirmed prior finish.

`GET /api/calendar/executions` lists owner-scoped links and domain data. `POST /{planId}/start` accepts optional `finishRunningPlanId`; `POST /{planId}/finish`, `DELETE /{planId}`, and `POST /{planId}/history` (local `startAt`,`endAt`) complete the lifecycle. Paths are relative to `/api/calendar/executions`. Historical completion can correct a running source's same-day end while retaining its exact start.

V46 adds/backfills `planned_time_blocks.plan_date`, permits only paired-null Plan times, and indexes untimed dates. Plan create/update accepts `date` when `startAt`/`endAt` are null. The range endpoint keeps `planBlocks` timed-only for Reflection/legacy compatibility and adds `unscheduledPlans`. No existing source rows are converted or deleted.

Clipboard paste/history explicitly allow overlapping Actual intervals. Ordinary Actual DnD still follows source validation. Content-only source edits tolerate unchanged timestamps. WorkRecord aggregate saves preserve existing overlapping pairs only when both source identities and intervals are unchanged; newly introduced Work Log conflicts still fail.

Validation fixture: `backend/src/test/resources/calendar_execution_postgres_rollback.sql`, run centrally with `psql -v ON_ERROR_STOP=1` after V45/V46. All fixtures roll back; workers must not apply shared migrations.

# Backend — Workflow Calendar V1

Confirmed product policy: `docs/product/workflow-calendar-policy.md` (read
that first — this document is the persistence/API reference, not the policy
source of truth).

## New domains

| Package | Table | Purpose |
|---|---|---|
| `lifecategory` | `life_categories` | LIFE-owned root/child category hierarchy, distinct from WORK. |
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
  stored duration. For regular WORK with paired times, it is derived from the
  range; without times it remains manual. Supplemental Work retains its existing
  duration semantics. These are the same source records projected by Calendar.
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

The transactional `WorkRecordService` replace-all flow also checks global
Actual overlap after both WorkTimeEntry and SupplementalWorkEntry lists are
replaced and flushed. Validating the final aggregate avoids false conflicts
with rows removed or moved by the same save. A conflict rolls back the whole
Work Log save, including attendance and both lists.

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
a server restart expires pending Undo. Tokens are atomically claimed so concurrent
requests cannot both restore successfully; a rollback makes the token retryable
until its original expiry. No additional persistence or migration
is required. Existing schedule/unschedule endpoints remain compatible.

Reflection snapshots now include `unscheduledActual` with the same complete
source DTOs as the Calendar range, and Work/Life actual totals include them.
Older frozen snapshots deserialize with an empty array. Re-completion rebuilds
this data from all Calendar sources, independently of UI visibility filters.

### LIFE CODE semantic categories (post-V1)

The existing `life_categories` identities now support a nullable `parent_id`.
Existing rows remain roots. Children require an owned, active root; a third level
is rejected. Both roots and children can be assigned to Calendar records.
`POST /api/life-categories` accepts `{name, parentId?}`; every response includes
`parentId`. `PUT /api/life-categories/reorder` accepts `{parentId, orderedIds}`
containing exactly one sibling group, including inactive siblings, with no duplicates.
Ordering is persisted once on drop, with optimistic UI rollback on failure.
A parent with children cannot be deleted. Calendar colors remain Calendar-owned.
The existing one-default-per-user behavior is preserved.


### Post-V1 timing, State and Reflection

`V32` permits a nullable `life_state_entries.label` (optional description), `V33` adds LIFE category parents, and `V34` persists NOTE workspace ordering. Existing values/identities remain. All applied V1–V31 migrations are unchanged.

`ActivityTiming` validates paired same-date times at five-minute precision and derives scheduled duration. WORK request `timingProvided:true` can explicitly clear a schedule; older requests omitting timing preserve existing Calendar scheduling. State also requires end<=now and an explicit StateGroup.

Reflection creation is atomic `INSERT ... ON CONFLICT DO NOTHING` followed by an owner/date read, preserving any existing content/status/version/snapshot. Missing Reflection GET is a normal404 without redirect; errors retain their HTTP status under PROD security. Context smoke tests validate the DEV schema with Flyway execution and absence scheduling disabled.
