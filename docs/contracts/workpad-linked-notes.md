# WORKPAD Linked Notes — editor and backlink contract

Updated: 2026-10-27. Applies to WORK FLOW dated Workpads and linked journal notes.

## Shared editing and persistence

`Today.tsx` accepts an optional `WorkpadDocumentSource`. Daily Workpads and Fixed
Routine retain their existing endpoints. `WorkpadNoteEditor.tsx` adapts a note to
that same block engine, with a note-specific ID, save queue, draft key, revision,
title, session slot and image loader. Daily-only task promotion/date/carry controls
are excluded from note mode. Main and dock presentations use the same note ID.

`journal_notes.content` remains the canonical Markdown field. No new table,
column, migration, bulk conversion or secondary document store is introduced.
The Markdown body stores block text once. A final `\n<!--workpad:v1:...-->`
comment contains URI-encoded JSON for existing Workpad block metadata, IDs,
parent IDs, ordering, exact text lengths and presentation prefixes. A versioned
reader validates the tree and lengths; malformed/newer formats retain the original
content and fail closed instead of silently overwriting it. Existing title-search
excerpts still begin with the Markdown body. Excerpt rendering strips this comment.

Opening legacy Markdown never saves it. Supported headings/lists/checklists and
canonical media directives become the existing Workpad block types in memory.
Other Markdown remains verbatim in TEXT blocks. The first explicit edit writes
the versioned representation. NOTE SYS detects this representation and uses the
same editor so a later edit there preserves block identities and hierarchy.
Workspace title changes continue through NOTE SYS rename/reservation/alias APIs;
body saves use its acknowledged version. Independent WORK FLOW notes use the
existing WORK FLOW note endpoint and optimistic version checks.

Images retain their original media IDs. Workspace images use that workspace's
existing authenticated media API; independent notes use WORK FLOW media APIs.
No sharing or ownership permission is broadened.

## Inline wiki editing

A normal rendered-link click opens its bound note and reveals editable `[[...]]`
in the original source block. Selection ends immediately after `]]`. Replacing
presentation spans with their exact text does not change persisted content.
Blur restoration waits for the browser's actual editing-host focus transition.
The source selection stays in its own document while the dock loads. Moving
focus to a different block/editor also moves the selection into that block if
needed. Existing Ctrl/Meta promotion and explicit resolution rules remain.

`metadata.wikiLinks` continues to bind `{name, ordinal, noteId}`. A label edit
reconciles only affected occurrences; it never globally renames the note. Actual
note rename retains its ID. Unresolved or deleted targets follow existing explicit
resolution/choice behavior.

## Layout

An open Linked Note uses two equal content columns above 1000px viewport width.
Routine/Shortcuts/closed-note modes restore the previous approximately 34% dock.
At 1000px and below linked editors stack vertically with independent scroll
containers. Heading alignment follows the first mounted journal content heading
when its top is visible; scrolling the daily journal does not scroll the note.
Existing dock tabs, date stream, navigation, main promotion and autosave remain.

## Canonical contextual backlinks

- `GET /api/workflow/notes/{id}/backlinks?offset=0`: existing list shape,
  deduplicated by actual source block, owner-scoped, 50 occurrences per page.
- `GET /api/workflow/notes/{id}/backlinks/{date}/{blockId}?offset=0`:
  `{blocks: [{block, depth}], total}`, 100 source blocks per page.
- The context endpoint validates note access and the real owner/note/date/block
  relation before reading the canonical source day. It walks `parentId` children
  in source sibling order; it includes the mention and its descendants only.
- Source days are already bounded to 5000 blocks by the existing save contract.
  Context reads are lazy and source-scoped, avoiding one day fetch per occurrence
  in the history list. No copied backlink snapshot is saved.
- The UI groups dates, keeps distinct mention subtrees, renders read-only context,
  exposes more pages and navigates to the exact source date/block. Persisted
  Workpad entity-change notifications and window focus refresh the history.

## Compatibility and release

No production data rewrite is needed. After a note has been edited in this
format, prefer a compatible roll-forward frontend. An older Markdown editor may
remove the metadata comment when saving, so a blind frontend rollback is not a
safe default after new edits. Do not roll back or rewrite newer user note data.
Native OS IME candidate-window verification remains a manual acceptance item;
Korean Unicode input and composition-aware save guards use the shared engine.
