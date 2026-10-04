# WORK FLOW V1

WORK FLOW uses the Shared Shell, SystemSwitcher, and Global Tabs. `/workflow` opens Workpad; its sidebar contains Projects, Timeline, To-do, and Workpad in that order. Workpad tab context retains the selected date and source block.

Projects edits the existing Project/Phase hierarchy and WorkTasks, including project-direct tasks. Inline editing and drag-and-drop persist entity order and phase membership. Progress is computed from tasks; completing a project does not complete children. Each entity owns its planning dates.

Workpad is an independent structured workpad. Enter creates a sibling, Tab/Shift+Tab changes hierarchy, Shift+Enter inserts a line break, Ctrl/Cmd+Enter cycles Normal → Open To-do → Completed To-do → Normal, and Ctrl/Cmd+Shift+Enter promotes it. Headings and To-do state combine in either order; removing To-do preserves heading style and text. Removing a completed linked To-do detaches the reference without deleting or reopening its WorkTask. Slash commands, selection handles, range/additive selection, block copy/paste, image groups, and undo/redo share the same block model. Promotion and ordinary copy/paste never duplicate WorkTask identity. The context rail edits linked tasks or image layout/captions.

Horizontal Workpad layouts use two or three equal columns containing existing root block subtrees. Drag a handle to a block's visible left/right edge target to create a column; vertical targets reorder or move into existing columns or normal flow. There are no nested columns or resize handles. Empty columns disappear and a one-column remainder returns to normal flow. Enter and indentation remain in the current column; boundary deletion never merges across columns. Numbering is scoped to each column. Editors narrower than 640px stack columns in logical order without changing stored layout. Layout lives in root `metadata.columnGroup` UUID and zero-based `metadata.column`; descendants inherit through parent links. Heading To-dos retain type CHECKLIST with `metadata.textStyle` TEXT/H1/H2/H3. Existing JSON metadata persistence needs no migration.

During a handle drag, eligible root destinations show both left/right column previews before the pointer reaches a side. The middle half of each row accepts the wider side bands; its top/bottom quarters remain vertical reorder targets, including near horizontal edges. Active previews distinguish creating a column from moving above/below, nesting and outdenting. A full three-column destination shows its limit, accounting for a source column emptied by the move. Drag guidance and source highlights show every member of the moving unit. Every block drag, in normal flow or columns, moves the directly dragged/selected roots plus all canonical `parentId` descendants once in document order. Direct child dragging does not move its ancestors; descendant links and relative order stay intact. Unparented heading sections are not implicitly included in pointer dragging. No drag affordances remain when idle.

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

The right dock has Fixed Routine, Shortcuts and Linked Note modes, with independent scroll and saved editors. Explicit Hide/Show controls save the account's `workpadDockCollapsed` preference; hiding releases the dock grid track, and reload or Workpad re-entry restores the choice. Column layouts do not change dock visibility. Opening a linked note deliberately restores the dock. Shortcut explanations and categories are Korean. Inline note references use blue title text with syntax visible while editing. Normal clicks open an editable dock note; Ctrl-click promotes that Note to main. Workspace notes use native NOTE SYS persistence; direct-owned topics use the shared editor adapter. Daily Workpads remain mounted during note navigation, with a recorded-date return path.

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


## WORK FLOW V1 Batch 3 — This Week, Weekday Board, Workpad integration

No backend change and no migration: Batch 3 uses the V61 model and the Batch 2 APIs.

- **Store (`WorkflowContext`)**: caches every opened week (`weeks`, `loadWeek`), not only the current one, keyed by the requested week start. Week mutations go through the same queue and are announced to other windows:
  - `includeProject`, `selectWeekTask`, `saveWeekContent` (revision-checked; a 409 keeps the draft)
  - `reorderWeek` (`week-projects` / `week-tasks` scopes)
  - `movePlanDay`, `reorderDay` (`day:` scope)

  Plan-day changes reload the cached weeks. A pending completion overlay already carries `previousStatus`.
- **Week helpers (`lib/workflow/week.ts`)**:
  - The week task set is explicit selection ∪ plan days in the week. There is one row per Task, and a Task is never promoted to a selection.
  - Board columns keep one card per placement of the canonical Task.
  - `reopenStatus` restores DOING or TODO. WAITING is not resurrected, because completion cleared its waiting context.
- **S04 This Week (`ThisWeek.tsx`, `/workflow/week?week=&view=`)**:
  - Whole-button Project inclusion with select all / clear all; inclusion never selects Tasks.
  - Project sections follow the week order. Excluded Projects that still have weekly rows are shown marked "포함 안 됨".
  - The 기타 section holds Project-less Tasks.
  - Selection toggle with kind labels 집중 / 날짜만 / 집중 · 날짜. Unselecting keeps plan days, shows a notice, and offers Undo.
  - Week-only Project and Task order, by DnD or ↑↓ buttons.
  - Optional scope line ("이번 주에는 여기까지"), stored in `work_week_projects.scope_line` only.
  - Inline add creates a canonical Task and selects it for the week.
  - Exactly three Focus slots (Title + Memo, empty allowed, reorderable) and inline Weekly Goals (checkbox on the right), autosaved.
- **S05 board**:
  - Monday–Sunday columns in a contained horizontal scroll, plus "이번 주 · 날짜 미정" at the top of the rail.
  - DnD moves a placement between days (merges on collision), reorders within a day, creates a placement from 날짜 미정, and removes a single placement when dropped back on 날짜 미정.
  - A day menu is the keyboard alternative. One-step Undo is available, and failures leave the state unchanged.
- **S06 Workpad (`TodayPlanned.tsx`, surgical `Today.tsx` changes)**:
  - Collapsible "오늘 예정 / 이 날짜 예정" projection from plan days; it never writes the document.
  - Add to Today and add to this date use the idempotent server command, then reload and focus the existing primary reference.
  - TaskReference meta line: Project · Phase · Priority · 마감 (only for `deadlineDate`, never legacy `dueDate`), plus 대기 when WAITING.
  - Continue sits in the block menu. The source record stays, nothing is copied, and a completed Task is not reopened.
  - Linked uncheck restores `previousStatus`. Ordinary checklists and strikethrough stay local.
  - Editor core and the three-mode Dock are unchanged.
- **Options** of the status and priority selects are neutral; only the closed trigger carries the semantic color.
- **Tests**:
  - `lib/workflow/week.test.ts`
  - `app/workflow/this-week.test.tsx` (fake backend with service semantics)
  - `app/workflow/workpad-b3.test.tsx`
  - a pending-completion case in `b2-owner-hotfix.test.tsx`
- **Evidence**: `docs/assets/work-flow/evidence/batch3-20260927/`.
## WORK FLOW V1 Batch 4 — Projects S01 / S02 / S03

No migration. One backend change: Phase delete detaches its Tasks (see `docs/backend/work-flow-v1.md`).

- **S01 (`Projects.tsx`, `/workflow/projects`)**:
  - One wide row per Project: goal, 이어갈 작업, this-week projection, progress with its basis label, and status.
  - Status filters 준비 / 진행 / 보류 / 완료 plus a separate 보관됨 view with 복구.
  - The empty state renders only after loading finishes.
- **S03 create / settings**:
  - A non-modal panel with name, type (일반 / 개발 / 콘텐츠 / 개인) and optional 기본 작업 묶음.
  - The 개발 basic groups are 기획 / 디자인 / 구현 / 검증 at 25% each.
  - New Projects are READY.
  - Settings reorders and deletes Phases. Delete moves their Tasks to 미분류 with the same ids.
- **S02 detail (`?project=`)**:
  - Goal and a resume card (`resumeContext`: next Task, latest Workpad record).
  - An 이번 주 계획 projection that writes the same `work_week_projects` / `work_week_tasks` rows S04 uses.
  - A 미분류-first Phase hierarchy with DnD between groups.
  - A 프로젝트 맥락 rail with linked resources and 최근 기록 (a TaskReference projection).
  - Rows open the shared S10 in the non-modal split.
- **Progress (`lib/workflow/progress.ts`)**:
  - Progress is weighted only when every participating group has a weight and the weights sum to 100. 미분류 participates with `unassignedWeight` when it has Tasks.
  - A Phase `progressOverride` replaces its automatic ratio.
  - Otherwise the label is 가중치 미확정 and a count-based fallback is shown.
- **Store**: `archiveProject`; `deletePhase` refreshes after the server detaches Tasks. `TaskDetailPanel` exports `Resources({taskId?, projectId?})`.
- **Tests**: `lib/workflow/progress.test.ts`, `app/workflow/projects-b4.test.tsx`.
- **Evidence**: `docs/assets/work-flow/evidence/batch4-20260927/`.

## WORK FLOW V1 Batch 5 — All To-dos, Waiting, Timeline

No backend change and no migration.

- **S07 All To-dos (`Todo.tsx`, `lib/workflow/explorer.ts`)**:
  - Always-visible button filters for 프로젝트 / 상태 / 우선순위 / 이번 주 (이번 주 · 미배치).
  - OR within a group, AND across groups. Each group's 전체 clears only that group; 필터 초기화 clears all groups and search.
  - Search covers title, memo and Project.
  - Sort: 최근 업데이트 (default), 프로젝트 순서, 마감 가까운 순, 우선순위. Legacy preference keys normalize, and the deadline sort uses `deadlineDate`, never the legacy `dueDate`.
  - A 보관됨 view shows archived Tasks, with 복구 restoring the same Task.
  - Rows edit inline and open S10.
  - `WaitingFoundation.tsx` was removed.
- **S08 Waiting (`Waiting.tsx`, `lib/workflow/waiting.ts`)**:
  - Two projections of WAITING Tasks:
    - 확인할 때가 된 일: flagged, or check date ≤ Seoul today
    - 대기 중
  - Inline add (title only; the ready table defaults the check date to today) creates a TODO Task and moves it to WAITING through the status command.
  - Inline reason / 결과가 오면 edits.
  - The 확인 날짜 popover (오늘 / 내일 / 다음 주 / 날짜 없음 / 직접) also clears `waitingFlagged`. 지금 확인 sets it.
  - 재개 goes to 할 일 or 진행 중, optionally adding to today. 오늘에 추가 is available directly.
  - Filters: 프로젝트, 확인 시점; plus search.
- **S09 Timeline (`Timeline.tsx`, `lib/workflow/timeline.ts`)**:
  - URL state: `view=year|quarter|month` (month is omitted), `period` (omitted when current), `project=` and `show=` (comma lists), plus `?task=`. It is read through the router's search params, so SSR and hydration agree on a directly loaded URL.
  - Year shows Project bars and Quarter shows Project + Phase bars. Pointer drag or Alt+←/→ moves or resizes only that entity's own range, and children are never shifted. A range panel is the date-menu alternative.
  - Month shows plan-day markers (HTML5 DnD or Alt+arrows; one placement moves, and collisions merge), non-draggable 실제 마감 markers, and Project spans.
  - Layer filter: 전체 / 계획 Task / 실제 마감 / Project 기간. There is no 잠정 일정 layer.
  - Undo history via the button or Ctrl/Cmd+Z; a failed undo keeps its entry. 주간 ↗ opens S05 and 오늘 ↗ opens the Workpad.
- **Styles**: `support-views.css`.
- **Tests**: `lib/workflow/explorer.test.ts`, `waiting.test.ts`, `timeline.test.ts`, `app/workflow/support-views.test.tsx`, `Timeline.test.tsx`.

## WORK FLOW V1 final stabilization (central integration, 2026-09-28)

- Batch 4 (`7393f62`) and Batch 5 (`34bb40a`) were merged onto dev. The only conflict was the CSS import list in `app/workflow/layout.tsx`.
- Integration fix: the Workpad linked-task side panel (`TaskDetails.tsx`) now edits `deadlineDate` as 마감일. The legacy start/due pair is shown read-only as 기존 Timeline 기간.
- **Central QA**:
  - WORK FLOW frontend suite 57/58; the one failure is the pre-existing `TodayWiki.test.tsx` baseline.
  - Backend WORK FLOW tests 58 pass / 2 skipped.
  - Lint on changed files, `git diff --check` and the production build all passed.
  - Integrated browser regression passed: Batch 3 E2E 42/42, Batch 4 smoke 16/16, and the central S07/S08/S09/canonical/multi-window run.
  - The Timeline Year Project bar and Quarter Phase bar were moved with real pointer drags, and Month plan markers with real mouse HTML5 drags, including a collision merge and Undo.
- **Evidence**: `docs/assets/work-flow/evidence/final-stabilization-20260928/`.

## Project Groups, DnD polish and Workpad usability (2026-09-28)

- **Projects catalog (`ProjectCatalog.tsx`, `lib/workflow/catalog.ts`)**:
  - Order = Project Group order, then Project order inside the group. 그룹 없음 (a null `groupId`) is a neutral projection and comes last.
  - The 01/02/03 numbering follows this display order.
  - `+ 그룹`, rename (inline), delete (Projects move to 그룹 없음) and per-viewer collapse, which is kept in `localStorage`.
  - dnd-kit drives group reorder and in-group / cross-group Project moves.
    - A handle is the only drag start, with a 6px activation distance.
    - Feedback: lifted card, origin placeholder, target-group highlight and a rejected state outside every group (that drop changes nothing).
    - Auto-scroll and a keyboard path (Space, arrows, Space) are supported.
  - The store applies a move optimistically and restores the exact previous catalog on failure or conflict.
  - A drop is sent as "before the next visible Project", so filtered and archived Projects keep their slots.
  - All To-dos "프로젝트 순서" and the default group order read the catalog; All To-dos never rewrites Project or Task order.
- **Three independent orders:** Projects catalog order, This Week order (`work_week_*`) and Project-internal Phase/Task order.
- **Shared native DnD layer (`lib/workflow/dnd.ts`)** for Project Detail, This Week, the board, focus/goals, All To-dos group order, Timeline markers and Workpad blocks:
  - Elements declare `data-dnd-row` / `data-dnd-target` / `data-dnd-accept`.
  - The layer draws a whole-row drag image, origin placeholder, insertion line or target highlight, and a visible rejection. It also provides edge auto-scroll and a FLIP settle.
  - Drop semantics are unchanged.
- **All To-dos rows** stay non-draggable. The only All To-dos drag is the group-order view preference.
- **Workpad**:
  - Caret moves apply in a layout effect. Before, a fast keystroke after Enter or Backspace landed in the previous block, which turned `##` after a delete into `#` + H1.
  - IME state follows the live input event, so a block removed mid-composition no longer freezes Markdown.
  - A truly empty leaf Backspace deletes the block.
  - Shift+Enter at the end of a line keeps the caret on the new line (sentinel `<br>`).
  - Plain Ctrl+Z no longer waits for an in-flight autosave.
  - Numbered headings are an H1–H3 block with `metadata.numbered`. They are counted per parent and level; body text never breaks a run, and an un-numbered same-level heading restarts it. Typing `1. ## …` creates one; the first Backspace removes only the number.
  - Commands & formatting is always visible.
  - The generic Block details / keyboard helper is removed; shortcuts stay in the Dock. The linked Task and image panels open on demand.
  - Alt+X (completion strike) and native Ctrl+X Cut are unchanged.
- **Evidence**: `docs/assets/work-flow/evidence/project-groups-ux-20260928/`.

## Waiting project context (2026-09-30)

Frontend only: no backend, API or migration change. Waiting stays one independent queue of WAITING Tasks.

- **Context navigation** (`Waiting.tsx`, `lib/workflow/waiting.ts`): chips `전체` / `프로젝트 없음` / active Projects (READY or ACTIVE, catalog order, first 8) / `더보기`. Each chip shows its WAITING count; long names are ellipsized and the bar wraps instead of scrolling sideways.
  - `더보기` lists the remaining active Projects, 보류 · 완료 Projects, and archived Projects that still own WAITING items. A Project picked there is shown as the selected chip.
- **Project context / 프로젝트 없음**: shows only that context's items in both 확인할 때가 된 일 and 대기 중. The add row has no Project selector: `projectId` comes from the context at submit time (null for 프로젝트 없음). After a create, the row resets and focus returns to the title, so several items can be entered in a row. The Project column is hidden (implied by the context).
- **전체**: the aggregated management view. It keeps the 프로젝트 filter, 확인 시점 filter and search, and each row's Project select reassigns the item (with a notice). There is no add row in 전체; new items are entered from a context.
- **Default / persistence**: the first visit opens 전체. The last chosen context is a per-viewer convenience in `localStorage` (`wf.waiting.context`, same pattern as the catalog collapse state). A remembered Project that no longer exists falls back to 전체; records are never detached.
- **Tests**: `lib/workflow/waiting.test.ts` (context rules, chip/더보기 split) and `app/workflow/support-views.test.tsx` (consecutive creation, switching, 프로젝트 없음, 전체 filter/search/reassignment, remembered and stale context).
- **Evidence**: `docs/assets/work-flow/evidence/waiting-project-context-20260930/`.

## Projects order everywhere: Waiting and All To-dos grouping (2026-10-01)

Frontend only: no backend, API or migration change. The Projects page is the single source of project grouping and order: group `sort_order` → Project `sort_order` inside the group → 그룹 없음 last.

- **Shared helper** (`lib/workflow/catalog.ts`): `projectGroupSections(projects, groups, include)` returns the Projects-page sections (labels included) narrowed by a predicate, dropping empty groups. `isActiveProject` = READY or ACTIVE and not archived.
- **Shared UI** (`app/workflow/ProjectGroupChips.tsx`): `ProjectGroupChips` renders inline clusters (group label + Project chips). `ProjectGroupFilter` is the Group → Project filter row: 전체 / 프로젝트 없음, then the groups. A group label selects or clears every Project of that group; values are always Project ids.
- **Waiting**:
  - Context chips are grouped. Primary chips are active Projects; 더보기 holds 보류 · 완료 Projects and archived Projects that still own WAITING items (an archived Project without items is not offered). This replaces the earlier "first 8 chips" rule.
  - 전체 has `+ 새 대기/확인`: choose a context, that context opens, and the create-row title is focused. Creation still never asks for a Project in the row.
  - The 전체 프로젝트 filter is the shared grouped filter, with WAITING counts.
  - 확인 시점 gains 직접 지정: one date, compared as an Asia/Seoul `YYYY-MM-DD` key with no Date/UTC conversion. The chip shows the chosen date; 해제 and 필터 초기화 clear it. 필터 초기화 clears the project filter, 확인 시점, 직접 지정 and search.
- **All To-dos**:
  - The 프로젝트 filter is the shared grouped filter (non-archived Projects, as before).
  - 프로젝트별 그룹 sections follow the Projects order exactly, 프로젝트 없음 last. The per-view override (`preferences.projectOrder`) is no longer applied or written, the section drag handle is removed, and 보기 설정 says to change order in Projects. The stored field is left untouched.
- **Tests**: `lib/workflow/catalog.test.ts`, `lib/workflow/waiting.test.ts`, `app/workflow/support-views.test.tsx`, `app/workflow/projects-todo-interaction.test.tsx`.
- **Evidence**: `docs/assets/work-flow/evidence/waiting-groups-todo-order-20261001/` (`DEV_15_SIDE_BY_SIDE_PROJECTS_WAITING_TODO.png` shows the same hierarchy on all three screens).

## Waiting revision (2026-10-01)

Source of truth: Drive `103_CURRENT_POLICY__WORK_FLOW_WAITING_REVISION_20261001` (semantics) and `104_UIREF` + the four `105` images S08A–S08D (composition). This supersedes the two Waiting sections above where they conflict: the project-context chips, `+ 새 대기/확인` and the per-row Project select are gone. All To-dos keeps its grouped filter and Projects order.

- **Model**: the canonical WorkTask is still the only Waiting item. Migration `V67__work_flow_waiting_revision.sql` (additive) adds `work_tasks.waiting_agent`, `waiting_since`, `waiting_completed_at`.
  - Status command: `completeWaiting` completes from the Waiting queue and keeps the waiting context on the Task (completed history). `WAITING` from that state reactivates the same Task (event payload `reactivated`). `waitingSince` lets an Undo restore the original waiting start. Reopening a completed Waiting item as ordinary work clears the kept context.
  - `waitingAgent` (CODEX / CLAUDE_CODE / CHATGPT / DIRECT, null = 미지정) is Waiting execution metadata, not an assignee. It is patchable and cleared when the Task leaves WAITING.
- **Projection**: by check date only. Check date ≤ today (Asia/Seoul) → 확인할 때가 된 일; future or no date → 대기 중. The legacy flag no longer promotes a row and 지금 확인 is removed (client and `/waiting`).
- **Filters** (AND across, OR inside): grouped Project filter panel — one row per Projects-page group in saved order, Project chips, a group 전체, live case-insensitive search that keeps every group row, multi-select, 전체 / 프로젝트 없음; 확인 시점 including 직접 지정; 담당 Agent. Text search stays in the header.
- **Inline create** in both tables: 그룹 → 프로젝트 → 제목 → 담당 Agent → 대기 이유 → 결과가 오면 → 확인일 → 추가. Only the title is required; no group = 프로젝트 없음; Project choices follow the group; a single filtered Project (or group) prefills. Text resets after a create, place and Agent stay, focus returns to the title.
- **Rows**: checkbox, group / Project, title, Agent badge, inline reason / result, check-date picker, and 재개 / 오늘에 추가 / 완료 / ⋯ (편집 / 삭제).
  - 재개 returns the Task to its previous active status and does not add it to Today. 오늘에 추가 resumes and calls the canonical Add to Today (duplicate prevention unchanged). 완료 moves it to completed history.
  - Routine actions run immediately with one functional Undo (queued in click order, never dropped). Only 삭제 asks first. 편집 is an inline row form for every 103 field. There is no Task detail panel on this screen.
- **Bulk**: row checkboxes and a contextual bar (오늘에 추가 / 재개 / 완료 / Agent 변경 / 확인일 변경) with one Undo for the batch.
- **Completed history**: collapsed `완료 이력 N건`. 다시 대기하기 asks for a new date or 날짜 없음 in a small popover; the old date is never reused silently.
- **Right side**: 담당 Agent 현황 (active only; a row applies that Agent filter) and 대기 작업 통계 (확인할 때가 된 일 / 대기 중 / 날짜 없음 / 평균 · 최장 대기일).
- **Tests**: `WorkflowV1DomainTest`, `lib/workflow/waiting.test.ts`, `app/workflow/support-views.test.tsx`.
- **Evidence** (implementation evidence, not UI reference): `docs/assets/work-flow/evidence/waiting-revision-20261001/`.
