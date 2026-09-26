# CHECKLIST SYS + Shared Checklist Interaction

What is actually built for CHECKLIST SYS V1 and how WORK OS / DIET SYS consume
the same checklist interaction. Visual target: `docs/assets/checklist-sys/01–08`
(Drive `10_POS / 06_CHECKLIST_SYS / 65_UI_REFERENCE__CHECKLIST_SYS_WHITE_V1`).

## Architecture — shared interaction, product adapters (no storage merge)

```
CHECKLIST SYS canon
  └─ lib/checklist-core + components/checklist-core   (shared)
       ├─ app/checklist            CHECKLIST SYS adapter  (checklist_sys_* tables)
       ├─ app/worklog/checklistAdapter.ts  WORK OS adapter (checklist_daily_entries, attendance-scoped)
       └─ app/diet/ChecklistRecord.tsx     DIET SYS adapter (diet_checks, date-keyed)
```

WORK OS and DIET SYS persistence stayed where it was: the models differ
materially (WORK entries exist only per WorkRecord workday; DIET checks are
keyed by date), so unifying storage would have been a risky rewrite with no
user-facing gain. Only the vocabulary is mapped:

| Shared state | CHECKLIST SYS | WORK OS | DIET SYS |
|---|---|---|---|
| SUCCESS | `SUCCESS` | `PASS` | `SUCCESS` |
| FAILURE | `FAILURE` | `FAIL` | `FAILURE` |
| NOT_RECORDED | `NOT_RECORDED` | `UNRECORDED` | `UNRECORDED` |
| UNTOUCHED | no row | `UNSET` | `MISSING` / no row |

## Shared interaction (`ChecklistGrid`, `useChecklistMutations`)

- Rows = items, columns = dates. The cell is the only control (no per-cell
  button group). Click = SUCCESS, click again = clear. Right-click menu or keys
  `1/s` `2/f` `3/n` `0/Backspace` reach every state; arrows move, Shift+arrows extend.
- Drag = rectangular selection → shared Bulk Action Bar (성공/실패/기록 못함/초기화).
  One bulk action = one atomic write. Ctrl/⌘+Z or the toast undoes the last operation.
- Date header → "이 날짜 전체 기록 못함" (MarkDateAsNotRecorded). Storage is still
  item-level rows. Existing SUCCESS/FAILURE cells are never silently overwritten:
  a confirmation offers empty-only or overwrite-all with counts.
- Writes are local-first: optimistic overlay, one request in flight, later changes
  coalesced (latest state per cell) into the next batch, failure rolls back to the
  confirmed state, success patches the adapter's data (no refetch).
- FUTURE and INACTIVE (before start / archived interval / non-workday) cells are
  muted and never read as failures.

## Identity / Area V2 (2026-09-26 sixth pass)

Product source: Drive CHECKLIST SYS INDEX "IDENTITY / AREA NAVIGATION + MANAGEMENT V2" and Stack
"2026-09-26 SIXTH-PASS". Supersedes the Journal-first details below where they conflict.

- **Sidebar AREA = global directory**: every Area, always, grouped under its owning Identity
  (collapsible group header with count). Selecting an Identity scopes Journal but never hides other
  groups. The separate IDENTITY list is gone (the group headers are the Identity entries).
- **Identity & Area page = one hierarchy table** (`Classification.tsx`): Identity parent rows,
  indented Area rows; inline autosaving name/description, color, active item count, actions
  (`+ Area`, delete, 소속 select as the keyboard alternative to DnD). Inline creation rows.
- **DnD** (`IdentityAreaTree.tsx`, shared by sidebar and table): Identities reorder as groups; an Area
  reorders inside its Identity or is dropped among another Identity's Areas / on its header row,
  which moves ownership. Checklist items still reorder only inside their Area.
- **Area move API**: `PUT /api/checklist-sys/areas/{id}/move {parentId, ids}` — owner-scoped,
  validates the full target order first, then sets `identity_id` and applies the order in one
  transaction. Area id, items, records and archive periods are untouched. No schema change.
- **Color**: 16 presets + custom (native picker / hex) in a small popover. Any `#rrggbb` persists in
  `checklist_sys_identities.color` (already hex-validated); Area cues and item icons derive from it.

## Journal-first structure (2026-09-26 revision)

Product source: Drive `06_CHECKLIST_SYS/00_INDEX` + central Feedback Stack
"2026-09-26 FIFTH-PASS — CHECKLIST SYS JOURNAL-FIRST SIMPLIFICATION". Frontend-only;
no API or schema change (V51 already persisted all three orders and same-ID restore).

- **Journal** (`/checklist`) is the working surface: record, add, edit, reorder, archive/restore.
  - Item name/icon → docked right `ItemPanel` (not a modal; grid, dates, filters, scroll stay).
    `체크리스트 추가` opens the same panel in create mode, which then continues as edit of the new id.
    Edits autosave (single-flight, newest draft wins, failure keeps the draft + 다시 시도) and patch
    the catalog locally — no catalog reload.
  - Hit targets: date cell = record, cell drag = range select, name/icon = panel, row ⋮⋮ handle =
    reorder within the same Area only (cross-Area drops are ignored; ownership never changes by drag).
  - (Superseded by V2 above: sidebar is now a grouped global Area directory with cross-Identity Area moves.)
  - Archived items: Journal `보관 N` toggle lists them in scope; the panel restores the same item id.
- **Identity & Area** (`/checklist/manage`) is the one classification page: Identity list (DnD) +
  selected Identity's inline form (name/description/color, autosave) + its Areas (inline name/
  description/owning Identity, DnD). Checklist items are not managed there.
- Removed standalone pages: item management (`/checklist/manage/items` → redirect `/checklist`) and
  archive (`/checklist/archived` → redirect `/checklist?archived=1`).
- **Color**: an item icon (and the Area cue in sidebar/classification) always uses the owning
  Identity's `color` (`identityColorOf`). `checklist_sys_areas.color` is still stored/required by the
  API but is no longer used as a cue in Journal/sidebar/classification (Progress by-Area bars still read it).
- Shared primitives stay opt-in: `ChecklistGrid` gained optional `onRowOpen` / `activeRowId` /
  `onReorder` / `GridRow.color`, `IconPicker` an optional `color`, `SharedSidebar` an optional
  per-section `content`. WORK OS / DIET SYS pass none of them and are unchanged.
- Identity edit bug: the PUT/update path itself was verified sound (controller binding test,
  real-Postgres service test, browser incl. Korean IME). What failed in use was reflection — Identity
  color never reached Area cues or item icons, and editing sat behind a "…" menu modal. Both replaced.

## CHECKLIST SYS persistence (Flyway V51 `checklist_sys_core`)

- `checklist_sys_identities` → `checklist_sys_areas` → `checklist_sys_items`
  (composite owner FKs, no cascades). `importance` ∈ CORE/SECONDARY/OPTIONAL is
  classification/filter only; `sort_order` is the explicit per-Area order.
- `checklist_sys_records (owner_id, item_id, entry_date)` stores
  SUCCESS/FAILURE/NOT_RECORDED; UNTOUCHED = no row. FK to items without cascade.
- `checklist_archive_periods (domain CHECKLIST|DIET, item_id, archived_on, restored_on)`:
  inactive interval `[archived_on, restored_on)`, one open interval per item.
- API `/api/checklist-sys`: `GET` catalog (incl. `archivePeriods`, `lastRecordOn`),
  `GET /records?from&to`, `PUT /records {changes}` (atomic; `state:null` clears;
  rejects future dates, pre-start dates, archived items and archived intervals),
  identity/area/item upserts, `/order`, `POST /items/{id}/archive|restore`.
  Identity/Area deletes are refused while children exist; items are never deleted.

## Archive / restore (Delete = archive)

| | CHECKLIST SYS | WORK OS | DIET SYS |
|---|---|---|---|
| Archive | `archived_on` + open interval | `deleted_at` (existing) | `active=false` + open interval |
| Restore (same id) | `POST .../restore` closes interval | `POST /api/checklist-items/{id}/restore` clears `deleted_at` (max-6 rule applies) | `POST /api/diet/items/{id}/restore` |
| Archived days in stats | excluded | no entries are created while archived | excluded (legacy inactive items without an interval: archived after their last record) |

A manually re-created item with the same name is a new, independent item.

## Rates (Progress)

Per active item-day (today counts only once recorded): completion =
S / (eligible − NR), failure = F / (eligible − NR), recording = (S+F) / eligible,
not-recorded = NR / eligible. Every item-day weighs the same; importance never
changes the math. Streak skips NOT_RECORDED and inactive days.

## Other endpoints added

- WORK OS `PUT /api/checklist-daily/entries/results {changes:[{entryId,result}]}`
  — mixed-result atomic batch (bulk, date-level, undo) with batched lookups.
- DIET `PUT /api/diet/checks {changes:[{date,itemId,state}]}` — atomic batch,
  memos preserved.
