# WORK FLOW V1

WORK FLOW uses the Shared Shell, SystemSwitcher, and Global Tabs. `/workflow` opens Today; its sidebar contains Projects, Timeline, To-do, and Today in that order. Today tab context retains the selected date and source block.

Projects edits the existing Project/Phase hierarchy and WorkTasks, including project-direct tasks. Inline editing and drag-and-drop persist entity order and phase membership. Progress is computed from tasks; completing a project does not complete children. Each entity owns its planning dates.

Today is an independent structured workpad. Enter creates a sibling, Tab/Shift+Tab changes hierarchy, Shift+Enter inserts a line break, Ctrl/Cmd+Enter toggles a checklist, and Ctrl/Cmd+Shift+Enter promotes it. Slash commands, selection handles, range/additive selection, block copy/paste, image groups, and undo/redo share the same block model. Promotion and ordinary copy/paste never duplicate WorkTask identity. The context rail edits linked tasks or image layout/captions.

Autosave uses day revisions and flushes before date/shell navigation. A failed save remains visible and blocks leaving until it is resolved. Linked task updates are serialized; field patches merge against the latest shared task state. Task status remains the source of truth for linked checks.

Carry-over starts in the date header. Parents include descendants; descendant-only selections include text ancestors. Completed checklists become text, incomplete task links retain the same WorkTask, and source links return to the original date and block.

To-do defaults to project grouping. Group order, sorting, completed/undated visibility, and remembered collapse state are stored as presentation preferences, independently of project order. Add to Today reuses a task reference.

Timeline shows one month with independent Project, Phase, and WorkTask bars. Dragging the body preserves duration; edge handles resize a single date. Changes snap to days, save on drop, and support Ctrl/Cmd+Z. Undated tasks remain accessible below the grid. Parent moves never shift children.

Calendar synchronization, tracking, dependencies, collaboration, and week/hour timelines are outside V1.

## Continuous daily editor

Today now opens a reverse chronological date stream anchored to today (Seoul date), with Today, previous/next recorded date navigation, and a secondary date picker. The first window loads at most three dates; explicit progressive controls add three more. A practical window retains up to nine mounted daily editors; clean, inactive, offscreen dates are flushed and replaced by measured-height placeholders, which reopen in place. Focused, selected, loading, busy or unsaved editors are never evicted, so a protected draft can temporarily exceed the normal window. Active keyed editors preserve local drafts, focus, selection and save queues. All mounted editors participate in the shell save guard. Cross-date block drag ownership remains out of scope and is rejected.

The same borderless Today core renders date-independent Fixed Workflow tabs in a collapsible right split. Hidden tabs remain mounted; up to five reusable tabs persist independently. Reset clears only check states in the active tab. Commands/formatting and keyboard help are available through collapsed disclosure controls.

At a block start, explicit Markdown markers transform headings, bullets, numbered lists, checklists and callouts; immediate Undo restores the literal marker. Empty list/checklist/callout Enter exits to Text. Shift+Enter stays native. Markdown paste is limited to explicit block syntax; Ctrl/Cmd+Shift+V keeps native plain text behavior. Alt+Up/Down and Ctrl/Cmd+Shift+Up/Down (without a text range) move structural sections. Heading sections and indented descendants move together without implicit reparenting. Empty leaf Backspace protects IME composition, parents and the final insertion point. Ctrl/Cmd+X keeps native Cut with a text range, otherwise toggles independent text strike; Ctrl/Cmd+Shift+X explicitly toggles strike.

`[[` opens title-oriented note completion with keyboard selection and scope labels. A chosen target persists its stable noteId while the visible text stays name-based; unresolved names stay unresolved. WORK FLOW can create topic notes without a NOTE SYS workspace. Topic notes and NOTE SYS note details show dated WORK FLOW backlinks with source navigation. Existing workspace notes open their existing NOTE SYS editor.
