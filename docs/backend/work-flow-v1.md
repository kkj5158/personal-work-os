# WORK FLOW V1 persistence and API

WORK FLOW reuses `projects` and `phases` identity. V38 extends those tables with status and memo; Projects gain their own optional date range, and Phase dates become optional. Existing Calendar date-range queries exclude undated phases naturally. No Calendar records are created, adjusted, or synchronized by WORK FLOW.

WorkTasks own status, project/phase membership, priority, dates, memo, and order. A phase must belong to the task's selected project; project-direct and unassigned tasks are supported. Parent dates never follow children. Deleting Projects/Phases is guarded while children or existing Calendar references remain. Task deletion preserves Today text/completion and removes its reference.

`GET /api/workflow` returns `{projects,phases,tasks}`. Each collection supports `POST /api/workflow/{projects|phases|tasks}` and full-object `PUT /{id}`; `DELETE /{id}` returns 204. UUIDs are server-generated for these entities. Project statuses are ACTIVE/PAUSED/DONE; Phase and WorkTask statuses are TODO/DOING/DONE.

`GET /api/workflow/days/{date}` returns `{date,revision,blocks}`. An absent day reads as revision zero with no blocks, without creating data. `PUT` replaces that day's structured blocks and requires the last observed revision; stale writes return 409. Block UUIDs are client-generated, unique across days. Parents must be within the day, and hierarchy cycles are rejected. Blocks have `id,parentId,order,type,content,checked,workTaskId,sourceBlockId,sourceDate,metadata`. Supported types are TEXT/BULLET/CHECKLIST/H1/H2/H3/CALLOUT/IMAGE/IMAGE_GROUP/DIVIDER. Metadata is an object, preserving image layouts, widths and captions.

Only CHECKLIST blocks may reference a WorkTask. Reads derive linked completion from WorkTask status. Saving a page does not update task status: the client explicitly updates the task. Link changes, copy/paste, and Undo never implicitly create or delete WorkTasks.

- `POST /days/{date}/promote {blockId}` returns a WorkTask and is idempotent for an already-linked block. It preserves the block's identity and children.
- `POST /days/{date}/unlink {blockId}` returns the day, preserving task and local completion.
- `POST /tasks/{id}/today {date}` returns the day, adding at most one reference to that task on the date.
- `POST /days/{date}/carry {blockIds,targetDate}` returns the destination day. Source blocks remain unchanged; incomplete task links keep the same task identity, completed checklists become non-executable text, and child-only selections include ancestor context as text. Every copied block records its immediate source date/block.
- `GET/PUT /preferences` persists a per-owner JSON object for To-do presentation independently of domain order.

Image upload is `POST /api/workflow/images {data,mimeType}`, where `data` is raw base64; the response is `{id,width,height,mimeType}`. `GET /images/{id}` returns private bytes. The shared NOTE SYS raster validator detects PNG/JPEG/GIF from bytes, enforces 10 MB and 40 MP, and ignores the claimed MIME type. WORK FLOW reuses `journal_media` storage with an exclusive workflow owner, without creating NOTE SYS workspaces or notes. Image metadata uses `images: [{id,width?,height?,caption?,description?}]`; referenced images must belong to the caller.

All reads and writes enforce the authenticated owner, including referenced projects, phases, tasks, source blocks, and images. Workflow write operations serialize through the owner's preference row. The four new tables have RLS enabled with no public access policies. Hibernate remains `ddl-auto=validate`.

Targeted checks: `WorkflowServiceTest`, `WorkflowControllerTest`, and `WorkflowMediaTest` use isolated data and cover hierarchy, order/status/date persistence, revision conflicts, ownership, promotion/unlink, carry context, image groups and preferences. After DEV migrations are applied, explicitly set `WORKFLOW_DEV_DB_TEST=true` to run `WorkflowPostgresIntegrationTest`; it requires the existing DEV environment variables and rolls back its entire fixture transaction.
