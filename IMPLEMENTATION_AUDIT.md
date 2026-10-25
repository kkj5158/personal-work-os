# DIET NOTE integration audit — 2026-10-25 (Asia/Seoul)

Base: `origin/dev` at `0a400b9`. The old primary checkout is on `main` and has unrelated local changes; it is preserved. Implementation uses isolated task worktrees under `D:/DEV_Space/personal-work-os-worktrees`.

## Existing contracts verified before implementation

- Web routes: `/diet/challenges`, `/diet/record`, `/diet/note`; NOTE SYS `/notes`. `NoteSystem` already supports an embedded DIET host and registers editor flush queues.
- Challenges: `DietStore`, `useChallengeDrafts`, `Challenge` types, canonical `/api/diet/challenges` endpoints. Weight/checklist/manual types, CURRENT/NEXT/FINAL roles, four lifecycle states, separate global draft buffer, milestones and color must remain. Existing server deletion affects challenge-specific relations; shared dated records must remain untouched.
- The current Daily Note contains a managed `:::diet` atom (`DietNoteProjection`, `DietDayView`), followed by the existing Markdown/Tiptap body. The atom currently repeats the mobile diary read-only. It must stop displaying that repeated diary; no new editor will be inserted inside it.
- Checklist canonical UI is `ChecklistGrid` + `useChecklistMutations` + `ChecklistWriteQueue`; `ChecklistRecordSection` adapts to `DietStore.saveChecks` and `PUT /api/diet/checks`. Memos persist independently; SUCCESS, FAILURE, UNRECORDED and MISSING remain distinct. `dietActiveOn`, archive intervals and recorded history determine date eligibility. `checklistStats` is the existing DIET calculation, including exclusion of UNRECORDED from its denominator. The embed will use these same components, adapter and API.
- Measurements are `DietData.days`, one morning and one before-sleep slot with slot timestamps. Only morning weight exists. Carry-forward current weight is separate context, never a fabricated same-day measurement.
- `useDietStore` instances currently do not notify each other. Add revision-only notifications through the existing `windowSync` utility and focus refresh; never send diary content through that channel.
- Mobile text is the owner/date `diet_daily_notes` record with expectedVersion CAS; web rich-text is `journal_notes`. Camera originals and projected NOTE media have their own identity and sync policy. These are not currently the same editable record. A compatibility bridge needs to preserve the whole rich-text body and protected media, reject stale concurrent writes and avoid destructive backfills. Detailed bridge findings belong in `docs/DIET_JOURNAL_BRIDGE_AUDIT.md`.
- Operational notes can reuse ordinary `journalDate=null` NOTE documents, the same `NoteEditor` and revision/delete protections. Manual ordering will be stored in existing owner-scoped settings JSON with a workspace lock and expected-order CAS, rather than introducing a new note table/service. Detailed layout audit belongs in `docs/DIET_NOTES_LAYOUT_AUDIT.md`.

## Safety and validation plan

No production deployment, migrations, or user-data QA writes. No automatic destructive migration/backfill. Run focused frontend and backend tests, type/lint/build gates, then isolated DEV API/browser persistence and responsive checks where runtime access permits. Distinguish real mobile client acceptance from API compatibility tests. Final reports and supporting evidence will be kept locally and uploaded individually to Kafka_AI_WorkSpace / 10_POS, with uploaded metadata verified.

## Final compatibility decisions and provenance

- Tested integrated product source: `c9c460949ab020f97746f4981679f4706f574b4b`. The newer unrelated Sleep work on `origin/dev` (`958929f`) was merged without modifying its implementation. Original primary-checkout changes remain untouched.
- Canonical checklist reuse is implemented in `DietChecklist`; it delegates to the same shared grid, queue, DIET state adapter, date eligibility and bulk endpoint. Revision-only notifications refresh other DIET surfaces.
- `ChallengeDetail` serves Planner and the Daily Note modal. Its draft hook now uses existing `/api/diet/mobile/plans` CAS save/delete rather than relying only on a client-side preflight.
- The shared journal bridge is limited to the existing enabled DIET sync target. It keeps owner/date identity, canonical version and media ownership, uses atomic web writes and projection-only saves to avoid loops, and preserves legacy manual web content until explicit adoption. The sync preference is never silently enabled in real user data.
- V98 is the only new migration. It relaxes the existing diary content lower bound to allow hidden empty version tombstones. It does not rewrite existing rows or drop stored content. Only the disposable loopback QA cluster received it during this task.
- Operational notes remain existing ordinary NOTE documents. Order is an owner/workspace settings JSON array, with expected-order CAS and permission checks. No new note table, editor or service.
- The empty-date dashboard is virtual: reading it does not create a stored Daily Note. Explicitly edited body content remains in the existing rich-text editor below the dashboard.
- Shared DIET body retains the existing 20,000-character mobile limit. Oversized existing web bodies remain preserved and failed edits retain drafts; no truncation. Other NOTE documents keep the existing larger limit. Native mobile preserves Markdown source and displays ordered image/caption segments; it is not a new WYSIWYG editor.
- Global policy was read once from `02_GLOBAL_AGENT_EXECUTION_POLICY`, document `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU`, observed update 2026-10-25. Attached MD supplies implementation requirements; its references supply visual direction only. Unrelated WOS/Calendar ZIPs were excluded. No claim is made about changes to ChatGPT Project settings.

Additional preservation check found a target-workspace-change case: shared diary NOTE-upload media UUIDs belong to their original owned workspace. Canonical DIET refs and already persisted historical NOTE refs now retain owner-checked byte access across explicit target changes and sync OFF, without cloning/rekeying images. New arbitrary ordinary-note cross-workspace attachments remain rejected, as do all foreign-owner reads. The existing Camera lifecycle regression and new shared-journal retarget/OFF/foreign-owner assertions passed on the owned PostgreSQL cluster.
