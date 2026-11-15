# Work Routine

`/workflow/routine` is one personal document per authenticated owner, immediately
after This Week in the WORK FLOW navigation. Its approved visual reference is
`WORK_ROUTINE_MOCKUP_V1.html` from the owner's 2026-11-15 handoff. The only design
extension is H1/H2/H3 insertion. No sample content or automatic reset is created.

The existing `Today` Workpad editor is bound through `WorkpadDocumentSource`.
Block schema, hierarchy, heading styles, keyboard editing, drag/drop, history,
serialized autosave, draft recovery, cross-window refresh and revision conflict
handling are shared with production Workpad. Routine styles and controls are
opt-in; unrelated editor screens keep their existing behavior.

`GET/PUT /api/workflow/routine` use the existing authenticated REST client and
WorkflowService owner lock. Migration V105 adds `workflow_work_routines`
(`user_id` primary key, revision, serialized blocks); RLS denies direct client
business-table access. The server derives owner from authentication and accepts
no target owner/ID. PUT enforces the expected revision and shared block/media
validation, and rejects daily task/carry references. GET of an unused routine is
empty and does not initialize data. Existing fixed tabs, notes and daily Workpads
are independent and remain untouched.

Progress counts all CHECKLIST blocks, including descendants. Bulk uncheck enters
the shared history and save queue. The explicit 실행 취소 patches only the reset
block IDs' checkbox states in the current document; later text, structure and
deletions survive. Reset and undo flush server mutations. Failed saves retain
the draft with retry/error feedback; revision conflicts retain both versions for
review rather than overwriting concurrent changes.

V104 is reserved by the separate, unmerged Study foundation worktree. V105 is
intentionally used here without changing that reservation or existing checksums.
Rollback should preserve this additive table and newly written documents; prefer
a forward fix. This feature does not modify authentication or other schemas.
