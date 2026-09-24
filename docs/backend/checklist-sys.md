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
