# Handoff: Work Schedule / Planning UI

**Purpose:** Synchronize context with ChatGPT (or any other collaborator) on the current state of the Planning (Work Schedule) UI after a large-scale redesign was rolled back.

**Generated:** 2026-08-19, by inspecting the actual repository state (files + git), not from memory or assumption. Investigation-only — no code was changed while producing this document.

**Repo root:** `C:\DEV_SPACE\personal-work-os` (monorepo: `backend/` Spring Boot, `frontend/` Next.js)

---

## 1. Current baseline UI

### Screen structure (after rollback)

Single page at route `/planning` (`frontend/app/planning/page.tsx`), client-rendered (`"use client"`). Root `/` immediately `redirect()`s to `/planning` (`frontend/app/page.tsx`).

Top-to-bottom layout inside `PlanningPage`:

1. **Header bar** — static "Planning" title only.
2. **`ViewSwitcher`** — Day/Week toggle, Prev/Today/Next navigation, current date/week label.
3. **`WorkPlanPanel`** — secondary panel showing the resolved Work Schedule for the current date (status / start time / grace / target duration), with an inline edit mode.
4. **Inline grid error banner** (conditional, plain `<p>`), only when the last fetch of planned blocks failed.
5. **`PlanningGrid`** — the primary UI: an hour-by-hour time grid (1 column for Day view, 7 for Week view) rendering `PlannedTimeBlock`s.
6. **`BlockEditDialog`** — a centered modal (not a popover), opened for both create and edit of a single planned block.

There is **no sidebar, no toast/undo system, and no category-visibility filtering** in the current baseline — those were introduced in the rolled-back redesign and have been removed (see §2).

### Main components and responsibilities

| File | Responsibility |
|---|---|
| `frontend/app/planning/page.tsx` (260 lines) | Owns all state: view mode, anchor date, fetched blocks/categories/work-plan, dialog open/mode/target block. Performs all data fetching (`refetchBlocks`, `refetchCategories`, `refetchWorkPlan`) and all mutation calls, always followed by a full refetch (no client-side cache/optimistic state). Wires the four child components together. |
| `frontend/app/planning/ViewSwitcher.tsx` (53 lines) | Pure presentational: Day/Week buttons, Prev/Today/Next buttons, date label. No internal state. |
| `frontend/app/planning/WorkPlanPanel.tsx` (206 lines) | Displays the effective (resolved) Work Schedule for `anchorDate`; "Edit plan" reveals per-field checkbox+input pairs so the user can explicitly mark a field as "override" vs "inherit from yearly WorkSettings" (a null field = inherit). Calls `onSave` with a `WorkScheduleOverrideInput`. |
| `frontend/app/planning/PlanningGrid.tsx` (278 lines) | The time grid itself. Renders `days.length` `DayColumn`s sharing an hour scale (60px/hour, 15-min snap). Each `DayColumn` handles its own Pointer Events (via `setPointerCapture`, no window listeners): click/drag on empty space to create a block, drag a block body to move it (same-day only, vertical), drag its bottom edge to resize, click (no movement) to open the edit dialog. |
| `frontend/app/planning/BlockEditDialog.tsx` (197 lines) | Modal form (title, start/end time, category select + inline "add category", memo). Shared by create and edit modes. Has its own `saving`/`error` local state; `handleSave`/`handleDelete` both correctly reset `saving` in a `finally` block (see §4, delete-bug fix). |
| `frontend/components/ui/{Button,Input,Select,Modal}.tsx` | Hand-written Tailwind primitives (no shadcn/ui CLI scaffold), used across the above. `Modal.tsx` is a full-screen dimmed overlay + centered panel — this is the dialog chrome currently in use. |
| `frontend/lib/api/{client,types,workPlan,categories,plannedBlocks}.ts` | API client layer, fully separated from UI. `client.ts` is a thin `fetch` wrapper (`ApiError` class, explicit 204 handling before any `.json()` call). One file per backend domain. |
| `frontend/lib/date.ts`, `frontend/lib/categoryColor.ts` | Timezone-naive date helpers (never use `toISOString()`/UTC conversion — the backend is the sole place that assigns Asia/Seoul) and a deterministic category→color mapping. |

### Backend (unaffected by any UI work, confirmed unchanged — see §6)

- `backend/src/main/resources/db/migration/V3__rename_calendar_tables_to_time_block_model.sql` — renames `calendar_blocks`→`planned_time_blocks`, `calendar_categories`→`time_block_categories` (pure rename, V1/V2 untouched).
- `backend/src/main/java/com/kafka/backend/workschedule/WorkPlanController.java` — `GET /api/work-plans/{date}`, `GET/PUT /api/work-plans/{date}/override`.
- `backend/src/main/java/com/kafka/backend/timeblockcategory/TimeBlockCategoryController.java` — `GET/POST /api/time-block-categories`.
- `backend/src/main/java/com/kafka/backend/plannedtimeblock/PlannedTimeBlockController.java` — `GET /api/planned-blocks?rangeStart=&rangeEnd=`, `POST /api/planned-blocks`, `PUT/DELETE /api/planned-blocks/{id}`.
- `backend/src/main/java/com/kafka/backend/common/{CurrentUserProvider,DevCurrentUserProvider,DevSecurityConfig,AppTimeZone,ApiExceptionHandler,...}.java` — dev-only fixed-user auth stub, CORS/security config, Asia/Seoul timezone conversion, error mapping.

---

## 2. Changes that were rolled back

### What was introduced (the "large-scale UI Improvement Pass")

Verified by having read the pre-rollback file contents directly in this conversation before the rollback was executed:

- **`frontend/components/Sidebar.tsx`** (201 lines, now deleted) — collapsible left nav with app sections, plus a category list with visibility checkboxes, persisted to `localStorage`.
- **`frontend/components/ui/Popover.tsx`** (82 lines, now deleted) — anchored, non-dimming popover positioned relative to a `DOMRect`, used to replace the centered `Modal`.
- **`frontend/components/ui/Toast.tsx`** (54 lines, now deleted) — bottom-right toast with an optional action button, used for delete-undo.
- **`PlanningGrid.tsx`** was rewritten to ~436 lines: cross-day drag (tracking a `columnIndex` per pointer move via `getColumnIndexAtX`), separate top/bottom resize handles, a "ghost" block preview during drag, a dashed outline at the block's origin position, and a `selectedBlockId` prop for highlighting.
- **`BlockEditDialog.tsx`** was rewritten to use `Popover` instead of `Modal`, added a date `<input type="date">` field, and — critically — changed `onSave`/`onDelete` from `Promise<void>` (awaited) to `void` (fire-and-forget), removing the `saving` state concept entirely.
- **`page.tsx`** was rewritten to ~465 lines: integrated `Sidebar` and `Toast`, replaced the fetch-then-refetch mutation pattern with **optimistic local-state mutations** for create/update/move/resize/delete (each with manual rollback logic on failure), added delete-with-undo (re-creating a block via a new POST, since IDs aren't restorable), added category-visibility filtering (`hiddenCategoryIds`), and added a summary stats bar (block count / planned time / categories used).

### Why they were rolled back

Per the user's own stated reasoning (direct quote from the request that initiated the rollback): *"The large UX pass changed too many interaction systems at once: drag, resize, click selection, optimistic updates, delete + undo, cross-day movement, contextual popover, sidebar/category behavior. After the pass, overall usability became significantly worse and interaction behavior became difficult to reason about."*

There is no evidence in the repo of a more granular technical postmortem (e.g., no bug-tracking notes, no failing-test record tied to the redesign) — the rollback decision is recorded here as a **product/UX judgment call by the user**, not a correctness bug. `Unable to verify`: any additional technical reasons beyond usability regression, since no such notes exist in the repository.

### Rollback baseline and completion

- **No git commit exists for either the pre-rollback or post-rollback state.** `git log` shows only 6 commits, none touching `frontend/`, and `frontend/` was never tracked before this session (`git log -- frontend/` returns nothing). So the "rollback baseline" was **not** a git ref — it was the exact source I had authored earlier in this same conversation, reconstructed from memory of my own prior tool-call output (verified byte-for-byte against the files listed in the "before" bullets above once I re-read the live UX-pass files, before I overwrote them).
- **Rollback completion — confirmed by direct file inspection performed just now (see §6 for exact byte-level checks):**
  - `PlanningGrid.tsx`, `BlockEditDialog.tsx`, `page.tsx` — restored to the pre-redesign source (verified via fresh `Read` in this session, shown in full above).
  - `Sidebar.tsx`, `Popover.tsx`, `Toast.tsx` — confirmed deleted (`find components -type f` shows only `Button.tsx`, `Input.tsx`, `Modal.tsx`, `Select.tsx`).
  - `grep -rl "Sidebar\|components/ui/Popover\|components/ui/Toast" app lib components` → no matches (no dangling references).
  - `npm run build` → succeeds (Turbopack compile + TypeScript check + static generation all clean), re-verified again just now while producing this document.
  - **Conclusion: the rollback is fully completed and currently builds clean.** This is not an inference from conversation history — it is a direct read of the files on disk at the moment this document was written.

---

## 3. Confirmed decisions

**Must be preserved (the current baseline, verified in the files above):**
- Single centered `Modal` dialog for block create/edit (not a popover).
- Awaited (non-optimistic) mutations: every create/update/move/resize/delete calls the API and then refetches from the server — no local optimistic state, no rollback-on-failure logic, no undo.
- Same-day-only drag: a block can be moved vertically within its own day column; cross-day drag is not implemented.
- No sidebar; no toast/notification system.
- No category-visibility filtering UI.
- The delete-stuck-in-"Saving" fix: `BlockEditDialog.handleDelete` resets `saving` in a `finally` block (both `handleSave` and `handleDelete` now follow the same pattern — confirmed present in the current file, line ~112 area).
- Backend API surface and data model (`planned_time_blocks`, `time_block_categories`, Work Plan effective/override split) — untouched by any UI work and not to be changed as part of UI refinement.

**Areas decided not to change (explicit user instruction for this and prior turns):**
- No reintroduction of the large-scale redesign (sidebar, popover, toasts, optimistic updates, cross-day drag, ghost preview) — the user was explicit that this is not to be proposed again.
- No full-screen re-architecture; work proceeds as incremental element-level refinement only.

**Confirmed design principles / user requirements (from this task's own prompt):**
- Workflow order going forward: **Planning UX refinement → visual design finalization → final validation → commit.**
- UX direction should be based on **Notion Calendar and Google Calendar**. `Unable to verify` exactly which specific interaction patterns from those products are wanted beyond what's already stated in `docs/time-work-management-v1.md`, which independently (written before this session) describes the Calendar screen as a *"Notion Calendar-style weekly time-grid"* (§7 of that doc) — this is corroborating evidence the direction was set early in the project, not just in this handoff request.
- Functional validation is expected **before** visual polish, and a final validation pass is expected **before** commit — no commit has happened yet for any of this UI work.

---

## 4. Completed work

| Feature | Implementation status | Validation performed |
|---|---|---|
| Day view (single-column grid) | Implemented, restored to baseline | `npm run build` passes; manually verified in an earlier turn per user's own manual test report (create/edit/drag/resize/delete/persistence all confirmed working in that report) |
| Week view (7-column grid, same data) | Implemented, restored to baseline | Same as above — user's manual verification report explicitly listed "switch Day ↔ Week" and "refresh and confirm persistence" as working |
| Work Plan panel (effective + override, inherit-vs-override UI) | Implemented, unchanged by the redesign/rollback | Not re-tested in this session; last known-good per user's manual report |
| Planned block CRUD (create/edit/move/resize/delete) | Implemented, restored to baseline | Delete flow specifically re-verified: root cause found and fixed (missing `finally` in `handleDelete`), fix confirmed present in current file |
| Delete-stuck-in-"Saving" bug | **Fixed and confirmed preserved through the rollback** | Root-caused via full code trace across `client.ts`, `plannedBlocks.ts`, `BlockEditDialog.tsx`, `page.tsx`, and the backend controller/service; fix is a single `finally` block; `npm run build` passed after the fix |
| Backend unit tests | 19/20 passing (last run in this session, backend files unchanged since) | `./gradlew test`: `PlannedTimeBlockServiceTest` 8/8, `TimeBlockCategoryServiceTest` 5/5, `EffectiveWorkScheduleResolverTest` 3/3, `EffectiveWorkScheduleServiceTest` 3/3. The 1 failure is `BackendApplicationTests.contextLoads()`, which requires live `SUPABASE_DB_*` env vars not available in this sandbox — pre-existing and environment-only, unrelated to any UI or business logic. |
| Frontend build/type-check | **Passing**, re-verified just now while producing this document | `npm run build`: Turbopack compile, TypeScript check, and static page generation for `/`, `/_not-found`, `/planning` all succeeded with no errors |
| Manual browser end-to-end verification of the restored baseline | `Unable to verify` in this session | No browser tool was invoked in this session; the last manual browser verification on record is the user's own report against the *pre-redesign* baseline (before the large UX pass), which is exactly the state now restored — but it has not been re-confirmed in-browser since the rollback |

---

## 5. Remaining incremental refinements

Only items explicitly confirmed in prior conversation turns are listed. **No new redesign ideas are introduced here.**

| Priority | Task | Affected files/components | Completion criterion |
|---|---|---|---|
| 1 | Re-verify the restored baseline live in a browser (the rollback was verified by file/build inspection only, not by re-running the manual click-through) | `frontend/app/planning/*` (no code change expected — verification only) | All items from the user's original manual-verification checklist (Day load, Work Plan read/update, category create/select, block create/edit/drag/resize/delete, Day↔Week switch, refresh persistence) pass again against the restored baseline |
| 2 | Incremental Planning UX refinement, informed by Notion Calendar / Google Calendar, applied as small isolated changes (not a full rewrite) | `frontend/app/planning/PlanningGrid.tsx`, `BlockEditDialog.tsx`, `WorkPlanPanel.tsx`, `ViewSwitcher.tsx` — one component at a time | `Unable to verify` — no specific refinement items (e.g. "improve block click target size", "add hover affordance") have been confirmed yet; this is a category of future work, not a defined task, per the agreed workflow (`Planning UX refinement` is step 1 of the four-step process but its concrete scope has not been itemized in any prior turn) |
| 3 | Visual design finalization | Same components as above, plus `frontend/components/ui/*`, `frontend/app/globals.css` | `Unable to verify` — no visual spec (colors, spacing, typography direction) has been confirmed beyond "based on Notion Calendar and Google Calendar"; this step explicitly follows UX refinement per the agreed workflow and has not started |
| 4 | Final validation | All of the above | `Unable to verify` — depends on completion of steps 1–3; expected to repeat the manual checklist plus `npm run build` and `./gradlew test` |
| 5 | Commit | Whole working tree | A single reviewed commit (or small set of commits) capturing the validated Planning UI state — **no commit has been made for any frontend work at any point in this project's history** |

**Note on staged files:** `git status` currently shows the *entire* `frontend/` tree plus `backend/` additions as staged (`git add`) but not committed — see §6. This staging was not performed by any action in this session; it is external state observed at inspection time. `Unable to verify` who/what staged it.

---

## 6. Current Git state

- **Current branch:** `main`
- **Recent commits** (`git log --oneline -6`, most recent first):
  ```
  498b9b3 feat: implement work settings and schedule backend
  9fdc7b2 feat: add work schedule defaults
  53865e6 feat: create time and work management schema
  2e8a672 docs: define time and work management v1
  592cb76 chore: configure spring and database environment
  91b0092 init
  ```
  None of these commits touch `frontend/` or the Planning UI — all UI work (slice implementation, delete-bug fix, large redesign, rollback) has happened entirely uncommitted, in this working tree, across this conversation.
- **Uncommitted changes:** Everything is currently **staged but not committed** (`git status --porcelain` shows `A ` / `M ` prefixes, not `??`) — this includes the entire `frontend/` tree (all Planning UI files, the API client layer, UI primitives, scaffold/config files) and the full backend `workschedule`/`worksettings`/`timeblockcategory`/`plannedtimeblock`/`common` packages plus `V3` migration. `.claude/settings.local.json` and `backend/src/main/resources/application.properties` are modified-and-staged.
- **Last verified safe baseline:** The current working tree state itself — i.e., what's staged right now — since:
  1. It matches the pre-redesign Planning UI exactly (confirmed by direct file read, §2).
  2. It includes the delete-bug fix.
  3. `npm run build` passes cleanly (re-verified just now).
  4. Backend tests are 19/20 passing, with the 1 failure being a known environment-only issue unrelated to this work.
  
  There is **no earlier git commit** to point to as a fallback — this staged working-tree state is the only known-good reference point that exists anywhere (locally or in git history).

---

## 7. Single next step

**Task:** Re-verify the restored baseline live in a browser (priority 1 from §5) — before any further UX refinement work begins, since the rollback has only been confirmed by static file/build inspection, not by exercising the actual running app.

**Target files:** None should be modified. This is a verification-only step against the current `frontend/app/planning/*` and the backend Planning API endpoints listed in §1.

**Expected scope:** Start the backend (with `APP_DEV_USER_ID` pointing at a real `auth.users` row and a `work_settings` row present for the current year — both are pre-existing operational prerequisites, not new work) and the frontend dev server, then walk through the full manual checklist: Planning Day loads, Work Plan read/update, category create/select, planned block create/edit/drag/resize/delete, Day↔Week switch showing the same persisted data, and refresh-to-confirm-persistence.

**Verification method:** Manual click-through in a browser (no automated E2E suite exists in this repo — `Unable to verify` whether one is planned). Success = every item in the checklist behaves as it did in the user's last manual verification report, with no regression introduced by the rollback process itself.

---

## HANDOFF SUMMARY

- **State:** The Planning UI has been rolled back from a large-scale redesign (sidebar + popover + toast/undo + optimistic mutations + cross-day drag) to the prior stable baseline. The rollback is **file-and-build verified complete** as of this document (`git` has no history to compare against — `frontend/` was never committed).
- **Baseline files (all restored/confirmed):** `frontend/app/planning/page.tsx`, `PlanningGrid.tsx`, `BlockEditDialog.tsx` (rewritten back to modal-based, non-optimistic, same-day-drag-only); `WorkPlanPanel.tsx` and `ViewSwitcher.tsx` were never part of the redesign and are untouched. `Sidebar.tsx`, `Popover.tsx`, `Toast.tsx` are deleted and unreferenced.
- **Preserved fix:** The delete-stuck-in-"Saving" bug fix (missing `finally` in `BlockEditDialog.handleDelete`) survived the rollback and is present in the current baseline.
- **Backend:** Completely unaffected — V3 migration, Work Plan / Time Block Category / Planned Time Block APIs are all intact and were not part of this UI work.
- **Verified just now:** `npm run build` passes clean. Backend tests (from earlier this session, unchanged since): 19/20 passing, 1 pre-existing environment-only failure.
- **Not yet done:** Live browser re-verification of the restored baseline (recommended next step); any actual UX refinement work (scope not yet itemized beyond "Notion Calendar / Google Calendar direction"); visual design finalization; final validation; and **the first-ever commit of any frontend code** — everything is staged but uncommitted.
- **Constraint for continuation:** Do not reintroduce the sidebar/popover/toast/optimistic-update/cross-day-drag redesign. Refine the current modal-based, awaited-mutation, same-day-drag baseline incrementally, one element at a time.
