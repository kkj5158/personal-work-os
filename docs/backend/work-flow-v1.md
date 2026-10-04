# WORK FLOW V1 persistence and API

WORK FLOW reuses `projects` and `phases` identity. V38 extends those tables with status and memo; Projects gain their own optional date range, and Phase dates become optional. Existing Calendar date-range queries exclude undated phases naturally. No Calendar records are created, adjusted, or synchronized by WORK FLOW.

WorkTasks own status, project/phase membership, priority, dates, memo, and order. A phase must belong to the task's selected project; project-direct and unassigned tasks are supported. Parent dates never follow children. Deleting a Project is guarded while children or existing Calendar references remain. Deleting a Phase is guarded only by Calendar/time references (planned time blocks, time entries, supplemental work). Its WorkTasks move to 미분류 (`phase_id = NULL`, revision bumped) and keep the same ids, plan days, weekly rows and Workpad references (Batch 4). Task deletion preserves Today text/completion and removes its reference.

`GET /api/workflow` returns `{projects,phases,tasks}`. Each collection supports `POST /api/workflow/{projects|phases|tasks}` and full-object `PUT /{id}`; `DELETE /{id}` returns 204. UUIDs are server-generated for these entities. Project statuses are ACTIVE/PAUSED/DONE; Phase and WorkTask statuses are TODO/DOING/DONE.

`GET /api/workflow/days/{date}` returns `{date,revision,blocks}`. An absent day reads as revision zero with no blocks, without creating data. `PUT` replaces that day's structured blocks and requires the last observed revision; stale writes return 409. Block UUIDs are client-generated, unique across days. Parents must be within the day, and hierarchy cycles are rejected. Blocks have `id,parentId,order,type,content,checked,workTaskId,sourceBlockId,sourceDate,metadata`. Supported types are TEXT/BULLET/CHECKLIST/H1/H2/H3/CALLOUT/IMAGE/IMAGE_GROUP/DIVIDER. Metadata is an object, preserving image layouts, widths and captions.

Only CHECKLIST blocks may reference a WorkTask. Reads derive linked completion from WorkTask status. Saving a page does not update task status: the client explicitly updates the task. Link changes, copy/paste, and Undo never implicitly create or delete WorkTasks.

- `POST /days/{date}/promote {blockId}` returns a WorkTask and is idempotent for an already-linked block. It preserves the block's identity and children.
- `POST /days/{date}/unlink {blockId}` returns the day, preserving task and local completion.
- `POST /tasks/{id}/today {date}` returns the day, adding at most one reference to that task on the date.
- `POST /days/{date}/carry {blockIds,targetDate}` returns the destination day. Source blocks remain unchanged; incomplete task links keep the same task identity, completed checklists become non-executable text, and child-only selections include ancestor context as text. Every copied block records its immediate source date/block.
- `GET/PUT /preferences` reads/replaces a per-owner JSON object for presentation independently of domain order. `PATCH /preferences` shallow-merges the submitted keys under the existing owner lock and returns the full merged object, so separate views can update their own preferences without removing others. Workpad uses `workpadDockCollapsed` for the explicit right-panel preference.

### Workpad headings and columns

To-do blocks retain `type="CHECKLIST"` and use `checked` for completion. Optional `metadata.textStyle` is `TEXT`, `H1`, `H2`, or `H3`, letting headings and To-dos coexist while preserving TaskReference/promotion rules. Ordinary headings continue using H1/H2/H3 block types. When carry/move context becomes ordinary text, a heading To-do becomes its plain heading type and its checklist-only `textStyle` key is removed.

Column layouts use paired root-block metadata: `columnGroup` is a UUID string and `column` is an integer from 0 through 2. Descendants inherit the root placement; descendant layout metadata is rejected, preventing nested groups. The editor keeps each group contiguous in document order, uses equal widths, cleans/reindexes empty columns, and stacks them on narrow viewports without changing stored placement. The backend accepts sparse group fragments arising from cross-date carry/move; editor load/save normalization restores normal single flow when only one column remains. Existing JSONB persistence requires no migration and block, task, media and note identities are retained.

Image upload is `POST /api/workflow/images {data,mimeType}`, where `data` is raw base64; the response is `{id,width,height,mimeType}`. `GET /images/{id}` returns private bytes. The shared NOTE SYS raster validator detects PNG/JPEG/GIF from bytes, enforces 10 MB and 40 MP, and ignores the claimed MIME type. WORK FLOW reuses `journal_media` storage with an exclusive workflow owner, without creating NOTE SYS workspaces or notes. Image metadata uses `images: [{id,width?,height?,caption?,description?}]`; referenced images must belong to the caller.

All reads and writes enforce the authenticated owner, including referenced projects, phases, tasks, source blocks, and images. Workflow write operations serialize through the owner's preference row. The four new tables have RLS enabled with no public access policies. Hibernate remains `ddl-auto=validate`.

Targeted checks: `WorkflowServiceTest`, `WorkflowControllerTest`, and `WorkflowMediaTest` use isolated data and cover hierarchy, order/status/date persistence, revision conflicts, ownership, promotion/unlink, carry context, image groups and preferences. After DEV migrations are applied, explicitly set `WORKFLOW_DEV_DB_TEST=true` to run `WorkflowPostgresIntegrationTest`; it requires the existing DEV environment variables and rolls back its entire fixture transaction.

## Worklog editor and shared note context (V43–V44)

`journal_notes` is the shared stable identity/content store. V43 makes `workspace_id` optional and adds `workflow_owner_id`; exactly one context is present, and a directly owned WORK FLOW note must have type NOTE. Existing NOTE SYS inserts and its workspace-bound title/alias/wiki indexes remain unchanged. No synthetic workspace or duplicated note content is created. A future workspace attachment can retain the same ID by atomically replacing the direct owner context with a workspace relationship and registering its name.

`GET /api/workflow/notes?q=title` searches up to 30 accessible current note titles and returns ID, title, scope, optional workspaceId and version (without note bodies). `POST /notes` creates a directly owned topic note. `GET /notes/{id}` reads accessible content; `PUT /notes/{id}` requires the current version and edits only directly owned topics. Workspace notes continue to use NOTE SYS's existing editor and rename/alias contract.

Text blocks persist explicit `metadata.wikiLinks: [{name,ordinal,noteId}]` alongside readable `[[name]]` syntax. Ordinals count repeated normalized names within a block. The existing NOTE SYS `NoteContent` parser builds dated `worklog_note_references` in the same transaction as day saves. Only explicit resolved identities bind; unresolved names never guess, including duplicate titles in different scopes. Removing syntax removes relations only. Rename/reorder preserves IDs and historical labels. Soft-deleted note identities can remain historical references without blocking other worklog edits. `GET /notes/{id}/backlinks` returns date, blockId, and source excerpt in reverse date order.

`GET /api/workflow/days?before=YYYY-MM-DD` (or `after`) returns up to 20 recorded dates. Empty read-only days are not created. V44 adds owner-scoped, date-independent `workflow_fixed_tabs`. `GET/POST /fixed` and `GET/PUT /fixed/{id}` use `{id,title,revision,blocks}`; at most five tabs are allowed and updates require the current revision. Fixed checklists cannot reference daily WorkTasks or carry provenance. Reset changes only checkbox state in the active tab through a normal revisioned save.

NUMBERED joins the supported block types. Existing Today IDs, dates, content, metadata, and hierarchy remain compatible. Isolated migration/SQL tests in `WorklogNotesServiceTest` cover scope ownership, legacy workspace writes, rename/removal backlinks, revision conflicts and fixed-tab limits. Shared DEV migration application remains serialized by the integrating agent.

## WORK FLOW V1 Batch 2 — core domain (V61)

`V61__work_flow_v1_core.sql` is additive. `work_tasks` stays the only Task identity; new relations reference it and never copy it. It was written as V60, but at the shared DEV integration gate (2026-09-27) V60 was already applied on shared DEV by the parallel MONEY track (`V60__money_bookkeeping_review_rules`), so the unapplied WORK FLOW migration yielded and became V61. The replaced CHECKs use PostgreSQL's generated names (`projects_status_check`, `work_tasks_status_check`), confirmed by a full local replay and by shared DEV `pg_constraint`; H2 tests rename H2's constraints to match (`WorkflowTestSchema`).

- Projects: `project_type` (GENERAL/DEVELOPMENT/CONTENT/PERSONAL), `goal`, `archived_at`, `next_task_id`, `unassigned_weight`, `revision`; status adds READY. WORK FLOW creates projects as READY; existing rows and Calendar-created projects keep their status. No project priority.
- Phases: optional `weight` and `progress_override` (NULL = automatic = completed active Tasks / active Tasks), `revision`.
- Tasks: WAITING status; `deadline_date` is the V1 real deadline. `start_date`/`due_date` remain the legacy Timeline range (constraint kept) and are never used as a deadline or backfilled. Plus `waiting_reason`, `waiting_next_action`, `waiting_check_date`, `waiting_flagged`, `next_step`, `completed_at` (NULL for historical DONE rows), `previous_status`, `archived_at`, `revision`.
- New: `work_task_plan_days` (PK task+date), `work_weeks` + `work_week_focus_slots` (exactly slots 0–2) + `work_week_goals`, `work_week_projects`, `work_week_tasks`, `work_task_events`, `workflow_resource_links` (exactly one of project/task; exactly one of Shared Note Core `note_id` or http(s) `url`).

API (all owner-scoped, serialized by the owner lock):
- `PATCH /tasks|projects|phases/{id}` `{expectedRevision, ...changed fields}` → 409 on a stale revision; unknown fields are 400. Legacy full-object POST/PUT still work and no longer erase V1 fields.
- `POST /tasks/{id}/status {status, expectedRevision, waiting…}` records COMPLETED/REOPENED/WAITING/RESUMED; `POST /tasks/{id}/archive {archived, expectedRevision}`; `POST /tasks/{id}/duplicate`; `GET /tasks/{id}/events`.
- `POST /tasks/{id}/today {date}` and `POST /tasks/{id}/continue {date}` → `{day, blockId, created, planDayCreated}`: ensure the plan day and exactly one primary TaskReference (`metadata.taskRef="primary"`) on that date; the source date is never touched and nothing is copied.
- `GET/PUT/DELETE /tasks/{id}/plan-days[/{date}]`, `POST /plan-days/move {taskId,from,to}` (merges on collision), `GET /plan?from&to` (Today planned).
- `GET /weeks/{monday}` → focus slots (always 3), goals, included projects, and one row per Task with `selected` and `plannedDates` kept distinct; `PUT/DELETE /weeks/{monday}/projects/{id}`, `PUT/DELETE /weeks/{monday}/tasks/{id}` (unselecting never removes plan days), `PUT /weeks/{monday}/content {expectedRevision, focusSlots[3], goals}`.
- `PUT /order {scope, ids}` — transactional; ids must be the complete scope (projects, phases:{p}, tasks:{p|none}:{ph|none}, week-projects:{w}, week-tasks:{w}, day:{d}, resources:project|task:{id}).
- `GET /projects/{id}/recent-records`, `GET /tasks/{id}/recent-records` (projection of TaskReferences, newest Workpad date first), `GET /waiting` (ready-to-check = WAITING and flagged or check date ≤ Seoul today; not a status).
- `GET/POST /resources`, `PATCH/DELETE /resources/{id}`.

## WORK FLOW V1 Batch 4 / 5 and final stabilization

- **No migration.** The shared DEV Flyway head stays V63. V61 is the WORK FLOW core; V62 and V63 belong to MONEY and DIET.
- **One backend change:** `WorkflowService.deletePhase` (described above), covered by a `WorkflowV1DomainTest` case.
- **Batch 5** (All To-dos / Waiting / Timeline) uses only the existing V61 APIs:
  - `PATCH /tasks|projects|phases/{id}`
  - `POST /tasks/{id}/status`
  - `POST /tasks/{id}/archive`
  - `POST /tasks/{id}/today`
  - `POST /plan-days/move` — its `merged` flag drives the Timeline merge notice and Undo.

## V64 — Project Groups and catalog order (2026-09-28)

**Schema:** `V64__work_flow_project_groups.sql` is additive.
- New table `workflow_project_groups (id, user_id, name ≤80, sort_order, revision, timestamps)`, with RLS enabled.
- New nullable column `projects.group_id` referencing it with `ON DELETE SET NULL`.
- Existing projects resolve to 그룹 없음.
- Groups organize the Projects catalog only. They never affect Phase, Project Type, status, progress, dates, This Week or Tasks.

**API** (`WorkflowProjectGroupService`, owner-scoped, serialized by the owner lock):
- `GET/POST /project-groups`
  - New groups go to the end.
- `PATCH /project-groups/{id} {name, expectedRevision}`
  - A stale revision returns 409.
- `DELETE /project-groups/{id}`
  - Its Projects, archived ones included, move to the end of 그룹 없음 in order.
  - Returns the catalog.
- `POST /projects/{id}/move {groupId|null, beforeProjectId|null, expectedRevision}`
  - Atomic: inserts before a Project in the target group's full list, or at the end.
  - Only rows whose position changes are renumbered.
  - A stale revision or a missing `beforeProjectId` returns 409.
  - An already-applied move writes nothing, so a retry succeeds.
  - Returns the catalog.
- `PUT /order` with scope `project-groups`
  - Full-list, revision-bumping group order.
- New Projects always join the end of 그룹 없음 server-side.

**Tests:** `WorkflowProjectGroupTest`.
