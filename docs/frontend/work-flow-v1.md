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
