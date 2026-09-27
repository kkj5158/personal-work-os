# WORK FLOW V1

WORK FLOW uses the Shared Shell, SystemSwitcher, and Global Tabs. `/workflow` opens Workpad; its sidebar contains Projects, Timeline, To-do, and Workpad in that order. Workpad tab context retains the selected date and source block.

Projects edits the existing Project/Phase hierarchy and WorkTasks, including project-direct tasks. Inline editing and drag-and-drop persist entity order and phase membership. Progress is computed from tasks; completing a project does not complete children. Each entity owns its planning dates.

Workpad is an independent structured workpad. Enter creates a sibling, Tab/Shift+Tab changes hierarchy, Shift+Enter inserts a line break, Ctrl/Cmd+Enter toggles a checklist, and Ctrl/Cmd+Shift+Enter promotes it. Slash commands, selection handles, range/additive selection, block copy/paste, image groups, and undo/redo share the same block model. Promotion and ordinary copy/paste never duplicate WorkTask identity. The context rail edits linked tasks or image layout/captions.

Autosave uses day revisions and flushes before date/shell navigation. A failed save remains visible and blocks leaving until it is resolved. Linked task updates are serialized; field patches merge against the latest shared task state. Task status remains the source of truth for linked checks.

Move to date starts in the date header or block menu. Explicit selections move their subtrees and retain identity/completion; with no selection the user reviews proposed incomplete items. Ancestor context is cloned/reused at the destination. The source remains open with View date and server-backed Undo actions.

To-do defaults to project grouping. Group order, sorting, completed/undated visibility, and remembered collapse state are stored as presentation preferences, independently of project order. Add to Today reuses a task reference.

Timeline shows one month with independent Project, Phase, and WorkTask bars. Dragging the body preserves duration; edge handles resize a single date. Changes snap to days, save on drop, and support Ctrl/Cmd+Z. Undated tasks remain accessible below the grid. Parent moves never shift children.

Calendar synchronization, tracking, dependencies, collaboration, and week/hour timelines are outside V1.

## Continuous daily editor

Workpad opens a reverse chronological date stream anchored to today (Seoul date), with Today, previous/next recorded date navigation, and a secondary date picker. The first window loads at most three dates; explicit progressive controls add three more. A practical window retains up to nine mounted daily editors; clean, inactive, offscreen dates are flushed and replaced by measured-height placeholders, which reopen in place. Focused, selected, loading, busy or unsaved editors are never evicted, so a protected draft can temporarily exceed the normal window. Active keyed editors preserve local drafts, focus, selection and save queues. All mounted editors participate in the shell save guard. Cross-date block drag ownership remains out of scope and is rejected.

The same borderless Workpad core renders date-independent Fixed Workflow tabs in a collapsible right split. Hidden tabs remain mounted; up to five reusable tabs persist independently. Reset clears only check states in the active tab. Commands/formatting and keyboard help are available through collapsed disclosure controls.

At a block start, explicit Markdown markers transform headings, bullets, numbered lists, checklists and callouts; immediate Undo restores the literal marker. Empty list/checklist/callout Enter exits to Text. Shift+Enter stays native. Markdown paste is limited to explicit block syntax; Ctrl/Cmd+Shift+V keeps native plain text behavior. Alt+Up/Down and Ctrl/Cmd+Shift+Up/Down (without a text range) move structural sections. Heading sections and indented descendants move together without implicit reparenting. Empty leaf Backspace protects IME composition, parents and the final insertion point. Ctrl/Cmd+X cuts only selected text or explicit handle-selected blocks; a lone caret does nothing. Ctrl/Cmd+Shift+X explicitly toggles strike.

`[[` opens title-oriented note completion with keyboard selection and scope labels. A chosen target persists its stable noteId while the visible text stays name-based; unresolved names can be clicked to resolve or create the canonical Note. WORK FLOW can create topic notes without a NOTE SYS workspace. Topic notes and NOTE SYS note details show dated WORK FLOW backlinks with source navigation. Existing workspace notes open their existing NOTE SYS editor.

## Workpad usability

The feature name is Workpad; `/workflow/today` remains compatible and the Today action still jumps to the current date. Numbered markers derive from consecutive numbered siblings, restart after a non-numbered sibling, and count nested siblings independently. Empty-list Enter converts to Text and ends the sequence.

Fixed Workflow owns a bounded, focusable vertical scroll body with a native draggable scrollbar revealed on hover/focus. Its header and tabs stay outside that body; main date-stream scrolling is independent, including the stacked narrow layout.

`POST /api/workflow/notes/resolve` accepts a title and returns matching owner-visible canonical Notes after normalized comparison, or creates one WORK FLOW-owned Note without a workspace. Ambiguous names require explicit selection. Wiki occurrences persist stable Note IDs; deleted targets can be resolved again. Direct-owned Notes use the shared NOTE SYS rich editor through a persistence adapter, including serialized autosave and navigation guards. Workspace Notes open the existing NOTE SYS surface. History deduplicates each date/block relationship and links to `/workflow/today?date=...&block=...`; source blocks are scrolled into view and focused. `/workflow/today?note=...` opens a direct-owned source Note. No new schema or Project/Phase/WorkTask Note relation is introduced.

Internal POS tabs expose Close, Close others, Close right, Pin/unpin, and Duplicate from a viewport-aware context menu. Pinned state uses the existing persisted tab model and preserves tab order; pins survive bulk close, while explicit close is allowed. Duplicate retains route context with a new ID. Every route-changing tab action keeps the existing save guard.
## Workpad revision 4

Each date is one browser editing host, with per-block identity and metadata retained in the model. Mouse text selection crosses text, heading and list blocks; Ctrl+A selects the current block, then this date only. Handles alone select structural ranges/sets. Text deletion preserves surviving children; structural deletion removes normalized subtrees. Copy/cut publishes plain text and HTML plus internal structure where supported. Multi-line paste splits around the caret and creates new IDs. Heading-middle Enter retains its level; heading-end Enter creates Text. Backspace peels indentation and format before merging; forward Delete retains the front block type. Markdown prefixes reconvert existing formats. Drop feedback explicitly distinguishes before/after/child/outdent; dates cannot be drag targets. Movement and deletion participate in Undo.

The right dock has Fixed Routine, Shortcuts and Linked Note modes, with independent scroll and saved editors. Shortcut explanations and categories are Korean. Inline note references use blue title text with syntax visible while editing. Normal clicks open an editable dock note; Ctrl-click promotes that Note to main. Workspace notes use native NOTE SYS persistence; direct-owned topics use the shared editor adapter. Daily Workpads remain mounted during note navigation, with a recorded-date return path.

Workpad and Fixed Routine revisions use the shared window revision channel. Clean editors refresh automatically; independent block edits merge by stable identity. Content conflicts preserve drafts and offer comparison, local conflict resolution or latest server content. Structural conflicts require an explicit whole-document choice. Remote merge invalidates old full-document undo history. IME composition prevents leaving through save guards. Acknowledged old saves do not clear newer drafts. NOTE SYS uses the same notification layer with entity-level conflict handling. Linked task title changes are committed atomically with the day revision, so a rejected stale Workpad save cannot overwrite a task title. Accepting remote content clears superseded title drafts.

No Project / Timeline / To-do information-architecture redesign or speculative entity fields are introduced. Deeper Workpad integration remains a later revision.

## WORK FLOW V1 Batch 2 — store, S10 and navigation

Navigation follows the locked IA: Projects / This Week / Workpad, then All To-dos / Waiting / Timeline. There is no Archive page; `/workflow/today` and `/workflow/todo` keep their paths. `/workflow/week` and `/workflow/waiting` are projection-list foundations until the full S04/S05 and S08 screens.

`WorkflowContext` keeps server-confirmed data plus optimistic overlays (`lib/workflow/store.ts`). Field edits are revision-checked PATCHes and status changes use the lifecycle command. A 409 is retried once only when another window did not change the edited fields; otherwise a `WorkflowConflictError` is raised and editors keep their drafts. Saves replace entities in place (no reload). Commits publish `{entityType:'workflow'}` through `lib/windowSync`; other windows refresh while keeping pending overlays. Add to Today also publishes the Workpad day revision so open editors merge the new reference.

S10 (`TaskDetailPanel` in `SplitView`, selection in `?task=`) is non-modal: the list stays interactive and keeps its scroll and filters, and the detail pane scrolls independently. Fields autosave; WAITING fields appear only for WAITING. Delete, Duplicate and Archive stay explicit. There is no assignee, Save button, subtasks, templates, rich text or file upload; documents, notes and URLs are linked resources. All To-dos, Projects and Timeline use it. The Workpad editor and its context rail are unchanged in this batch.

### Batch 2 owner-feedback hotfix (pre-Batch 3)

Owner decisions: Drive `93_STACK__WORK_FLOW_BATCH2_OWNER_FEEDBACK_20260927` (B2-HOTFIX-01 to 08).

- One Task row (`TaskRow.tsx`) serves Project Detail and All To-dos. Clicking the row body opens S10. Anything inside a `RowControl` (the `data-row-control` boundary) performs only its own action: checkbox, DnD handle, inline selects/dates, plan-date popover, Add to Today. The title button is the row's keyboard target. A new control only needs to be wrapped, never listed.
- All To-dos rows edit Project, work group, status, priority, plan dates and the semantic deadline inline. They use the same revisioned store as S10 (status via the status command), with no Save button. Deeper work (memo, WAITING context, resources, records, archive/duplicate/delete) stays in S10.
- Project Detail shows `미분류 작업` first. It is a neutral projection of Phase-less Tasks, not a Phase, and never a Phase drop target. Real Phases follow with a restrained identity-color header band and indented flat rows. Task DnD into or out of the bucket assigns or clears the Phase.
- All To-dos Project groups have a header band with the Project color; `프로젝트 없음` is the neutral unassigned group.
- S10 fields sit in quiet sections: 기본 정보, 대기 (WAITING only), 일정 정보, 이번 주, 설명 / 메모, 연결 자료, 최근 기록. The property grid is a container query: 2 columns, and 1 column when the panel itself is narrower than 430px.
- The global shell does not bound page height, so sticky panes never engage. On desktop, the Project page and `SplitView` bound themselves to `--app-content-height` (as Calendar and Note System do) and scroll per pane, whether or not S10 is open. Opening or switching S10 therefore never moves the list scroll. Project-hosted S10 keeps a readable width, and the center column yields first.
- `updateTask` compares a requested status with the rendered state (pending overlays included), so a quick toggle back is not dropped.
