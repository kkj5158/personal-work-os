# Supplemental Work (보강근무)

Implements the Supplemental Work portion of `docs/product/work-log-policy.md`.
See that document for the "why"; this one is "what's actually built" — mirrors
`docs/backend/work-time-entry.md`'s structure since the two domains are
close siblings with one deliberate difference in lifecycle.

## 1. Concept

Supplemental Work is additional actual-work time recorded **explicitly** by
the user, separately from ordinary `WorkTimeEntry` ("정규근무"). It is:

- Allowed under **every** Attendance status (working or non-working) —
  never inferred from clock times, never blocked by status.
- **Never** cleared or blocked by an Attendance status transition — this is
  the one deliberate asymmetry with `WorkTimeEntry`, whose presence
  outright blocks a working → non-working transition
  (`docs/backend/work-record.md` §12b). Supplemental Work has no equivalent
  guard anywhere in `WorkRecordService`.
- Counted into actual work totals and work-time goals, but **never** into
  `basicWorkMinutes` (stay/presence duration), which is derived purely from
  clock-in/clock-out.

## 2. Why a separate entity, not a `WorkTimeEntry.workType` discriminator

`WorkTimeEntry` carries regular-work-specific lifecycle assumptions baked
directly into `WorkRecordService`: no start/end fields, and its mere
presence blocks a working → non-working status change. Retrofitting a
discriminator would require conditionally suppressing that guard and every
other regular-work-only validation path per row — a strictly larger, more
error-prone change than a parallel table with its own service enforcing its
own (different) invariants. A separate `SupplementalWorkEntry` table makes
"must survive any Attendance transition" structurally impossible to violate
by accident, rather than a rule that has to be remembered at every call site.

## 3. Table

`supplemental_work_entries` — new in `V22__create_supplemental_work_entries.sql`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, client-assigned (same replace-all identity model as `WorkTimeEntry`) |
| `user_id` | UUID | Denormalized, `ON DELETE CASCADE` from `auth.users` |
| `work_record_id` | UUID | FK → `work_records(id)`, `ON DELETE CASCADE` |
| `category_id` | UUID | Composite FK → `activity_categories(id, user_id)`, `ON DELETE RESTRICT` — a **live** reference, never snapshotted (identical policy to `WorkTimeEntry.categoryId`) |
| `item` | VARCHAR(200) | Required, trimmed — same convention as `WorkTimeEntry.item` |
| `total_minutes` | INTEGER | `CHECK > 0`. **The aggregation source of truth** — never recomputed from `start_at`/`end_at` server-side, even when both are present |
| `start_at` / `end_at` | TIMESTAMPTZ | Nullable, always a pair (`CHECK (start_at IS NULL) = (end_at IS NULL)`), same-day only (`CHECK end_at > start_at`, no overnight rule in this version) |
| `memo` | TEXT | Nullable |
| `position` | INTEGER | `CHECK >= 0`, `UNIQUE (work_record_id, position)` — deterministic ordering, identical to `WorkTimeEntry` |
| `created_at` / `updated_at` | TIMESTAMPTZ | Standard audit timestamps |

No DB-level overlap constraint (no `btree_gist`/`EXCLUDE` in this codebase) —
overlap is enforced entirely at the application level, matching this
codebase's existing `PlannedTimeBlockService.validateNoOverlap` pattern.

## 4. Entity and service

`com.kafka.backend.supplementalwork.SupplementalWorkEntry` — no `@Version`
(like `WorkTimeEntry`, avoiding the client-assigned-id + optimistic-locking
pitfall documented on `WorkRecord`). `SupplementalWorkEntryService.replaceAll`
mirrors `WorkTimeEntryService.replaceAll`'s replace-all algorithm exactly
(id-matching claims an existing row, unclaimed rows are deleted, position is
re-derived from list order), with two additions:

- Same-day interval construction: `startTime`/`endTime` (bare `LocalTime`)
  are converted to `OffsetDateTime` via `AppTimeZone.toStored(workDate.atTime(...))`,
  matching `WorkRecordService`'s own clock-time handling.
- Overlap validation, run in list order as each entry is processed: a timed
  entry must not overlap any earlier timed entry already accepted in this
  same `replaceAll` call, nor the record's own authoritative regular-work
  interval (`regularStartAt`/`regularEndAt` — the record's real
  `clockInAt`/`clockOutAt` for this save, **never** derived from
  `WorkTimeEntry`, which carries no time-of-day at all). Touching boundaries
  are allowed (half-open interval test: `aStart < bEnd && aEnd > bStart`).
  An untimed entry (no start/end) is never overlap-validated. On conflict:
  `InvalidRequestException("기존 근무시간 HH:mm~HH:mm과 겹칩니다.")`.

Category validation (`resolveCategoryId`) is byte-for-byte the same
grandfather-unchanged-selections policy as `WorkTimeEntryService`: reject a
root, reject a newly-assigned inactive category, but never re-validate an
entry's already-existing (possibly since-deactivated) category reference.

## 5. WorkRecordService integration

`WorkRecordRequest.supplementalWorkEntries` / `WorkRecordResponse.supplementalWorkEntries`
+ `supplementalWorkMinutes` (sum, computed fresh, never persisted — deliberately
a **separate** field from `netWorkMinutes`, not folded together, so Regular
and Supplemental totals remain distinguishable in the API contract itself).

In `WorkRecordService.applyUpsert`, `supplementalWorkEntryService.replaceAll(...)`
is called **unconditionally** after the existing `workTimeEntryService.replaceAll(...)`
call — never gated on `request.status().isWorkday()`, and its presence is
never consulted by the working → non-working transition guard (§12b of
`docs/backend/work-record.md`), which continues to check only
`workTimeEntryService.findByWorkRecord(...)`. The same
`entityManager.lock(saved, LockModeType.OPTIMISTIC_FORCE_INCREMENT)` call
that already covers `WorkTimeEntry`-only edits covers Supplemental-only
edits too, since it fires once at the end of `applyUpsert` regardless of
which child table actually changed.

## 6. ActivityCategory delete-safety

`ActivityCategoryService.delete` additionally checks
`SupplementalWorkEntryRepository.existsByCategoryId` alongside the existing
`WorkTimeEntryRepository`/`PlannedTimeBlockRepository` checks — a category
referenced only by a Supplemental Work entry must be exactly as undeletable
as one referenced by a regular entry.

## 7. Attendance Calendar / Date Detail

No dedicated Calendar backend package exists for either Regular or
Supplemental Work (see `docs/backend/work-record.md` — the frontend derives
everything from `GET /api/work-records` range fetches). Supplemental Work's
per-date aggregate (`supplementalWorkMinutes`) and full entry list
(`supplementalWorkEntries`) already ride along on the existing
`WorkRecordResponse` returned by that same endpoint — no new endpoint was
needed for the Calendar's "보강 H:MM" indicator or Date Detail's actual-record
list.

## 8. Frontend integration

`frontend/app/worklog/supplementalWorkEntry.ts` (domain/draft/validation,
mirroring `workTimeEntry.ts`), `SupplementalWorkEntryEditor.tsx` (table
editor, mirroring `WorkTimeEntryEditor.tsx` with added 총시간/시작/종료
columns), `ActualWorkSummaryCard.tsx` (shared 실근무 = 정규 + 보강 summary,
breakdown line shown only when Supplemental Work is non-zero). Both the
unified record-edit modal (`WorkLogRecordDetailModal.tsx`) and the 일 (Day)
view (`DailyWorkLogView.tsx`) render the Supplemental section unconditionally
(never gated on the record's Attendance status, unlike the Regular section).
`selectors.ts`'s `getActualWorkMinutes` (regular + supplemental) replaces
`getNetWorkMinutes` everywhere "실근무" is displayed as a total — Attendance
Calendar cells, weekly/monthly tables, Weekly Summary, Work Trend/Daily Work
charts (via the existing trend/point selectors), Today Summary, and the
Attendance Management page's annual average — while `getNetWorkMinutes`
itself is untouched (still regular-only) for every place a
regular-vs-supplemental breakdown is needed.

## 9. Tests

`SupplementalWorkEntryServiceTest` (creation, category validation, multiple
entries, overlap — sibling and regular-interval, boundary-touch, untimed,
duration-never-recomputed, lifecycle edit/delete isolation, batch retrieval)
+ `WorkRecordServiceTest` additions (Supplemental Work never blocks or is
blocked by a status transition, replace-all is called unconditionally
across every major status, actual-work aggregation keeps Regular and
Supplemental separately summed, stay duration is never contaminated) +
`ActivityCategoryServiceTest` addition (delete rejected when only
referenced by a Supplemental entry).
