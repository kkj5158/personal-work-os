# WORK FLOW V1

WORK FLOW uses the Shared Shell, SystemSwitcher, and Global Tabs. `/workflow` opens Today; its sidebar contains Projects, Timeline, To-do, and Today in that order. Today tab context retains the selected date and source block.

Projects edits the existing Project/Phase hierarchy and WorkTasks, including project-direct tasks. Inline editing and drag-and-drop persist entity order and phase membership. Progress is computed from tasks; completing a project does not complete children. Each entity owns its planning dates.

Today is an independent structured workpad. Enter creates a sibling, Tab/Shift+Tab changes hierarchy, Shift+Enter inserts a line break, Ctrl/Cmd+Enter toggles a checklist, and Ctrl/Cmd+Shift+Enter promotes it. Slash commands, selection handles, range/additive selection, block copy/paste, image groups, and undo/redo share the same block model. Promotion and ordinary copy/paste never duplicate WorkTask identity. The context rail edits linked tasks or image layout/captions.

Autosave uses day revisions and flushes before date/shell navigation. A failed save remains visible and blocks leaving until it is resolved. Linked task updates are serialized; field patches merge against the latest shared task state. Task status remains the source of truth for linked checks.

Carry-over starts in the date header. Parents include descendants; descendant-only selections include text ancestors. Completed checklists become text, incomplete task links retain the same WorkTask, and source links return to the original date and block.

To-do defaults to project grouping. Group order, sorting, completed/undated visibility, and remembered collapse state are stored as presentation preferences, independently of project order. Add to Today reuses a task reference.

Timeline shows one month with independent Project, Phase, and WorkTask bars. Dragging the body preserves duration; edge handles resize a single date. Changes snap to days, save on drop, and support Ctrl/Cmd+Z. Undated tasks remain accessible below the grid. Parent moves never shift children.

Calendar synchronization, tracking, dependencies, collaboration, and week/hour timelines are outside V1.
