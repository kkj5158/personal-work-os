# Daily Work Checklist

Implements the checklist portion of `docs/product/work-log-policy.md`
(post-production iteration 1, REQ-05 — the largest single feature in that
batch). This document is "what's actually built"; see the product policy
doc for the "why."

## 1. Domain model overview

Six tables (`V16__create_checklist_schema.sql`), package
`com.kafka.backend.checklist`:

| Table | Purpose |
|---|---|
| `checklist_categories` | Single-level, management-organization-only grouping. Immediate-effect changes (no version history) — REQ-05 §10.5. |
| `checklist_items` | Permanent item identity — id, current category, drag-and-drop `position`, a one-way `deleted_at` tombstone. |
| `checklist_item_versions` | Effective-dated definition of one item: `effective_from`, `name`, `emoji`, `priority` (CORE/SECONDARY), `is_active`, optional `goal_override_percent`. |
| `checklist_global_goals` | Effective-dated shared default achievement goal, same immutability rule as item versions. |
| `checklist_daily_entries` | Both the per-day frozen snapshot AND the daily achieved/not-achieved result — one row per (WorkRecord, item). |

## 2. Permanent identity vs. effective-dated versions

`ChecklistItem` itself never changes name/emoji/priority/goal — every such
change creates or edits a `ChecklistItemVersion` row instead, keyed by
`effective_from`. The applicable definition **as of any date** is the
version whose `effective_from` is the latest one on or before that date
(`ChecklistItemVersionRepository.findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc`).
This is what lets a rename/re-emoji/re-classify preserve the same
longitudinal identity for analytics while still rendering historically
correctly.

**Immutability rule** (`ChecklistItemService.scheduleVersion`): a version
whose `effective_from` is strictly before today has already applied and can
never be edited or deleted. A version dated today or later can always be
freely edited in place (if a row already exists at that exact date) or
created; a version dated strictly after today can also be deleted
(`deleteFutureVersion`). Scheduling into the past (`effectiveFrom` before
today) is rejected outright. The same rule applies identically to
`ChecklistGlobalGoal` (`ChecklistGoalService`).

This is a deliberate engineering simplification over the letter of REQ-05's
"a version that has already begun applying cannot be edited" — a version
effective **today** is treated as still-editable (not yet immutable),
mirroring the same "today isn't confirmed yet" idea used for daily results
(§9 below). Without this, a same-day correction (e.g. fixing a typo minutes
after creating an item) would be blocked. Document this choice as a
reasonable, personal-app-appropriate call, not an oversight.

## 3. Category assignment is not versioned

`ChecklistItem.categoryId` is a plain, immediately-mutable column — unlike
name/emoji/priority/goal, category reassignment is not listed among the
effective-dated fields in REQ-05 §10.7, and REQ-05 §10.5 explicitly says
category changes take effect immediately. Deleting a category
(`ChecklistCategoryService.delete`) sets every member item's `categoryId` to
`null` ("Uncategorized") rather than deleting the items.

## 4. Max 6 simultaneously active items

`ChecklistItemService.MAX_ACTIVE_ITEMS = 6`. Enforced at the moment a change
would actually take effect **today**:

- `create()` — a brand-new item's first version is always effective today
  and active; rejected if the user already has 6 active items.
- `scheduleVersion()` — only checked when `active == true` **and**
  `effectiveFrom.equals(today)`; a future-dated activation isn't checked
  against the current count (it doesn't affect *today's* count) — a
  documented simplification, not exhaustively validated against every
  future date's own hypothetical count.

"Active as of today" is computed by resolving each non-deleted item's
version-as-of-today and counting `isActive() == true` — there is no
separate denormalized counter to keep in sync.

## 5. Daily snapshot + result (`ChecklistDailyEntry`)

One row per `(work_record_id, item_id)`, created once by
`ChecklistSnapshotService.ensureSnapshot(WorkRecord)`:

```java
if (!record.getStatus().isWorkday()) return;
if (dailyEntryRepository.existsByWorkRecordId(record.getId())) return; // idempotent
// else: snapshot every active-as-of-workDate item, up to MAX_ACTIVE_ITEMS
```

Called from `WorkRecordService.applyUpsert` immediately after
`repository.save(record)`, on every save (not just transitions) — the
idempotency check (`existsByWorkRecordId`) is what makes this correct for
every case without any special-casing:

- **First-time creation as a workday status**: no entries exist yet →
  snapshot is taken.
- **Non-work → workday transition**: same — no entries exist yet (assuming
  this date never had a workday snapshot before) → snapshot is taken.
- **Workday → workday** (e.g. `WORK` → `HALF_DAY`): entries already exist →
  no-op, preserved untouched.
- **Workday → non-work → workday again** (the "restore" case, REQ-05
  §10.10): entries from the *first* workday period still exist (never
  deleted) → the second transition back to workday also no-ops, which is
  exactly "restore the preserved results without duplicating them," for
  free.

Each `ChecklistDailyEntry` freezes `name`/`emoji`/`priority`/`goal_percent`
at snapshot time — an item's later rename/re-emoji/goal change never alters
how an already-snapshotted day renders, matching the same
snapshot-vs-live-reference principle as `WorkRecord`'s applied
`StartTimeCriterion` (as opposed to `WorkTimeEntry.categoryId`, which is
live — see `docs/ARCHITECTURE.md`).

## 6. Applicability is never stored

Whether a `ChecklistDailyEntry` currently counts toward evaluation/
statistics is **always** derived live from its parent `WorkRecord.status`
(`isWorkday()`), never a stored flag on the entry itself. Consequences:

- If attendance later changes to a non-work status, every entry for that
  date automatically becomes non-applicable — nothing needs to be updated
  on the entries themselves.
- If attendance later changes back to a workday status, applicability is
  automatically restored, and (per §5) the very same preserved rows are
  reused rather than re-snapshotted.
- `ChecklistDailyService.getForDate`/`setAchieved` and
  `ChecklistAnalyticsService` all resolve applicability this same way, by
  joining/filtering against the corresponding `WorkRecord`'s status — there
  is exactly one source of truth for this, never a second flag to drift out
  of sync.

## 7. Daily result semantics ("today isn't confirmed yet")

`ChecklistDailyEntry.achieved` is a plain boolean — there is no third
"pending" stored state. The "today unchecked = pending, past unchecked = not
achieved" distinction (REQ-05 §10.9) lives entirely in how callers interpret
an unchecked row for a given date, not in extra storage:

- `ChecklistDailyService` doesn't need this distinction at all — it just
  reads/writes `achieved` for whatever date is requested.
- `ChecklistAnalyticsService.computeDailyAchievements` explicitly **excludes
  today** from every aggregate (`if (date.equals(today)) continue;`) —
  today is never a "confirmed" day for period-rate purposes, regardless of
  how many of its items are checked.

No midnight scheduler exists (or is needed) to "finalize" yesterday's
unchecked items into a confirmed-missed state — the date-aware exclusion at
query time already produces the correct answer without ever writing
anything.

## 8. Achievement calculation — equal-day weighting

The single most important calculation rule (REQ-05 §10.12), enforced in
`ChecklistAnalyticsService`:

> Period achievement rate = the **mean of each valid day's own achievement
> rate** (achieved/applicable that day), never a pooled
> total-achieved/total-applicable count across days.

This is why `computeDailyAchievements` first produces one `DayAchievement`
(achieved/applicable count, split by CORE/SECONDARY) per valid day, and
`meanRate`/`overallTrend` then average those **per-day rates** — a day with
6 active items never outweighs a day with 2. A day contributes to the
aggregate only if it has at least one applicable item that day; a fully
inactive day (no applicable items) or today are excluded entirely, not
counted as a zero.

Core/Secondary rates follow the identical principle, computed independently
per day and then averaged — no priority weighting anywhere (CORE does not
count as "2×"; see `ChecklistPriority`'s doc comment).

## 9. Resolution / bucketing

`ChecklistAnalyticsService.resolveResolution(from, to)`: `≤31` days → DAILY,
`≤186` days (~6 months) → WEEKLY (ISO week, Monday start), otherwise →
MONTHLY. Used identically by the Overall Trend and Individual Item Tracking
endpoints. A bucket with zero valid days simply produces no point (Overall
Trend) or a `state: "NO_DATA"` point (Individual Item Tracking) — the
frontend renders both as a gap, never a bridged/zeroed line.

## 10. API surface

| Base route | Purpose |
|---|---|
| `/api/checklist-categories` | CRUD + `/reorder` (full sibling-set reorder) |
| `/api/checklist-items` | CRUD, `/active-count`, `/{id}/versions` (GET history, PUT schedule, DELETE future), `/{id}/parent` (move category), `/reorder` |
| `/api/checklist-goal` | `/history`, `/current`, PUT (schedule), DELETE `/{id}` (future version only) |
| `/api/checklist-daily` | `/{date}` (GET — `{date, applicable, entries[]}`), `/entries/{entryId}/achieved` (PUT — toggle), `/matrix?from&to` (GET — batched range read backing the checklist record table; see §12) |
| `/api/checklist-analytics` | `/overall`, `/by-item`, `/item/{itemId}` — all take `from`/`to`; `by-item` also takes `priority`/`includeDeleted` |

## 11. Known frontend scope trims (not backend gaps)

The backend supports all of the following; the frontend built in this
iteration intentionally simplifies some of them — see
`docs/product/work-log-policy.md`'s "Current milestone vs. deferred":

- A full search/category emoji picker (frontend uses a curated quick-pick
  grid plus free-text entry instead).
- True multi-series overlay in the Overall Achievement Trend chart (a
  toggle switches between Overall/Core/Secondary instead of layering them).

## 12. Checklist matrix (batch range read)

`ChecklistDailyService.getMatrix(from, to)` — added to back the 근무
체크리스트 page's checklist record table (`app/worklog/ChecklistMatrixTable.tsx`),
closing the "week/month compressed checklist cell" gap noted in earlier
iterations. Reuses the existing entities/repositories entirely; no new
migration.

- **Rows**: one per `WorkRecord` that exists in `[from, to]` (same
  "no row = no data, filled in by the frontend" convention as the Work
  Record table) — `{date, status, applicable, cells[]}`, where `applicable`
  is `status.isWorkday()` and `cells` is whatever `ChecklistDailyEntry` rows
  that `WorkRecord` actually has (frequently none, for a date whose
  snapshot predates a given item's creation).
- **Columns**: the union of every `itemId` that appears in at least one
  entry across the whole range — never just the currently-active items.
  Display fields (name/emoji/priority) come from the item's current
  effective-dated version when the item still exists; for a deleted item,
  from the most recent historical entry snapshot within the range instead
  (`ChecklistMatrixColumn.deleted`).
- **Column order**: sorted by the exact same compound key the checklist
  management screen already groups/orders by — `(category.position, then
  item.position within that category)`, "Uncategorized" last. `item.position`
  alone is never a valid global sort key: it's scoped per category. This is
  the same `position` field `ChecklistItemService.reorder` writes, so
  management order and matrix column order are always one value, never two
  models kept in sync by convention.
- **A missing cell for an applicable row is not a failure**: the frontend
  renders it identically to a non-applicable row (`—`), since it means the
  item wasn't part of that date's snapshot at all (didn't exist yet, or
  wasn't active as of that date) — not that it was checked and missed.

Column drag-and-drop reordering (frontend) is scoped to within one
category's sibling group and reuses `PUT /api/checklist-items/reorder`
unchanged — a flat cross-category order isn't expressible via that
endpoint without either a schema change or a surprising implicit category
move on drag, and neither was judged worth it for this pass. After a
successful reorder the frontend simply re-fetches the matrix; it never
computes or caches column order itself.
