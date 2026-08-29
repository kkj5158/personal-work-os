# Attendance Management — Confirmed Product Design

This document states confirmed product decisions for the Attendance
Management batch (post-production iteration 1, continuation): the
`AttendancePlan` plan-vs-actual domain, leave reservation accounting,
plan-aware reconciliation, the `출결 관리` page, and the small Work Record
refinements bundled into the same batch. It supersedes any conflicting
assumption in older historical documents (see `CLAUDE.md`'s document
precedence list).

**Precedence within this batch**: written confirmed requirements (this
document, and the original task brief they were captured from) define final
behavior and fields. The four visual reference images under
`docs/assets/worklog/attendance-management/` define layout, density, and
general presentation direction only — they never override a written
requirement or an already-confirmed domain policy (e.g. the exact PROD
attendance color palette, `docs/product/work-log-policy.md`'s work-included/
non-work status rules). Where an image and a written requirement disagree,
the written requirement wins.

## 1. Plan vs. actual — two separate domains

`AttendancePlan` (`com.kafka.backend.attendanceplan`) is a user's planned
future attendance for one date — entirely separate from
`com.kafka.backend.workrecord.WorkRecord` (the actual outcome). At most one
plan per `(user_id, plan_date)`. Plannable statuses are a strict subset of
the canonical `WorkAttendanceStatus` enum — `WORK`, `HALF_DAY`, `PAID_LEAVE`,
`DAY_OFF` — never a duplicate synonym enum. `SICK_LEAVE`/`EARLY_LEAVE`/
`ABSENT` are actual/unplanned-only outcomes and are never valid plan
statuses.

`WORK`/`HALF_DAY` plans carry a `startTimeCriterionId` (must be
active and non-archived at the time it's newly selected); `PAID_LEAVE`/
`DAY_OFF` plans carry none. Unlike `WorkRecord`'s applied-criterion
snapshot, a plan's criterion reference is **live**, not frozen — a plan is
inherently tentative until it becomes an actual `WorkRecord`, at which point
`WorkRecordService`'s own snapshot logic takes over.

**A plan is never deleted just because its date became actual.** It remains
as historical "what was planned" context, readable in Attendance History
alongside whatever the actual outcome turned out to be. Only an explicit
user delete (via the Quick Plan Popover, restricted to today-or-future
dates) removes a plan row.

**Why not extend the existing `workschedule`/`worksettings` domain**: that
domain (`WorkSchedule`/`WorkSettings`/`EffectiveWorkScheduleService`) is a
recurring weekly-pattern/hours template used only as the absence-backfill
scheduler's eligibility check (`PlannedStatus.WORK` → "this date was
supposed to be a work day"). Its own `PlannedStatus` enum has no `HALF_DAY`,
includes `SICK_LEAVE` (never a valid plan outcome), and stores raw
`plannedStartTime`/`graceMinutes` rather than a `StartTimeCriterion`
reference — a different shape and job from a per-date, criterion-aware
attendance plan a user directly edits. Repurposing it risked regressing the
already-working absence backfill; `AttendancePlan` is deliberately a new,
separate domain instead. The legacy domain is untouched and still serves
its original fallback role (§3).

## 2. Leave reservation accounting

Configured monthly leave allowance (`monthly_leave_allowances`, unchanged
schema) is now accounted for as:

```
configured = confirmed usage + planned/reserved usage + available
```

- **Confirmed usage** — actual `WorkRecord` leave-consuming statuses
  (`PAID_LEAVE` = 1.0, `HALF_DAY` = 0.5), computed exactly as before
  (`LeaveAllowanceService.computeUsedLeave`).
- **Planned/reserved usage** — the sum of leave-consuming `AttendancePlan`
  rows in the month, **excluding any date that already has an actual
  `WorkRecord`** (that reservation has been superseded by confirmed usage —
  see `LeaveAllowanceService.computePlannedLeave`). This is what makes
  "plan → actual" transitions never double-count:
  - Plan `PAID_LEAVE` → actual `PAID_LEAVE`: reservation stops counting;
    confirmed +1.0.
  - Plan `HALF_DAY` → actual `HALF_DAY`: reservation stops counting;
    confirmed +0.5.
  - Plan `HALF_DAY` → actual `ABSENT`/`WORK` (a no-show or a corrected
    actual that isn't leave-consuming): reservation stops counting either
    way, confirmed leave consumption is whatever the actual status's own
    `leaveConsumption()` says (zero, for `ABSENT`/`WORK`).
  - Plan deleted: reservation released immediately (it's simply gone from
    the sum on the next read — nothing is stored to "release").
- **Available** = `configured - confirmed - planned`. Both `WorkRecordService`
  (writing an actual leave-consuming status) and `AttendancePlanService`
  (writing a leave-consuming plan) validate against this exact same pool via
  one shared method, `LeaveAllowanceService.requireSufficientBalance` — both
  exclude the date being written from both sums first, so editing a date's
  own existing plan/actual never double-counts its own prior state against
  itself. `configure()` (setting the monthly allowance) similarly rejects a
  new value below `confirmed + planned`.

`LeaveMonthSummary`/`LeaveMonthSummaryDto` expose `usedDays`, `plannedDays`,
and `remainingDays` (= available) alongside `allowanceDays`. An unconfigured
month (`allowanceDays == null`) still blocks any new leave-consuming plan or
actual, same as before.

## 3. Reconciliation (plan-aware, scheduler + catch-up)

`AbsenceBackfillService` (name and scheduler/config kept — see its own
class doc for why) now resolves each missing past date in this order:

1. **An `AttendancePlan` exists for that date**:
   - `PAID_LEAVE`/`DAY_OFF` → confirm an actual `WorkRecord` with that same
     status (not an absence).
   - `WORK`/`HALF_DAY` → confirm an actual `ABSENT` (a no-show).
2. **No plan at all** → falls back to the legacy schedule-based check
   (`workschedule`/`worksettings`, unchanged): the recurring weekly pattern
   said this date was a planned work day → `ABSENT`. Otherwise the date is
   left alone.

Never touches a date that already has a `WorkRecord` (whatever its origin
or however it was later edited) — `AbsenceRecordWriter.createIfMissing`
re-checks existence inside its own `REQUIRES_NEW` transaction and treats a
unique-constraint race as "already created," same idempotency guarantee as
before, now parameterized by the resolved status instead of hardcoded to
`ABSENT`.

**Scheduler + catch-up, not midnight-only**: the scheduled job
(`app.absence-backfill-cron`, default daily 01:00 Asia/Seoul) recomputes the
*entire* bounded window (`app.absence-backfill-window-days`, default 90;
`[today - windowDays, yesterday]`) fresh on every run — a missed run (DEV/
PROD offline at the scheduled time) is transparently caught up by the next
run, with no separate "catch-up mode" needed. Today and future dates are
never touched (the window's upper bound is always yesterday).

## 4. MISSING / no-record semantics

`미입력` is not a persisted status — it's a derived UI condition ("no
`WorkRecord` exists for this date"), consistent across day/week/month/
annual/calendar/history views:

- Future date, no record → not MISSING (represented only by
  `AttendancePlan`, if one exists).
- Today, before it elapses, no record → not MISSING, no automatic absence.
- Past elapsed date, no record → a reconciliation/manual-correction target.

## 5. Historical no-record create flow

The Work Record page's week/month tables now let a past/current 미입력 row
be clicked (`onCreateRecord`), and the 일 (Day) view shows a `근무 기록
생성` button when the selected date has no record — both open the existing
`WorkLogRecordDetailModal` with a fresh in-memory draft (`buildDraftRecord`,
already used for "today before first save") rather than a new modal or a
new create endpoint. Opening the modal creates nothing; only Save calls the
existing `PUT /api/work-records/{date}` upsert, which already applies every
normal domain validation (leave allowance, work-included/non-work rules,
criterion selectability, work-time entry constraints) unchanged.

**Future actual creation is blocked** — `WorkRecordService.applyUpsert`
rejects `PUT`/upsert when no record exists yet for a date after today
(`InvalidRequestException`). This guards *creation* only: an already-existing
future row (there should be none in normal use) can still be edited/
corrected, never permanently locked out.

## 6. Attendance Management page (`/worklog/attendance`, `출결 관리`)

Canonical place for attendance administration — leave configuration,
planning, attendance-wide statistics, and `StartTimeCriterion` management.
`근무 기록` (Work Record) remains daily execution/record editing; its
toolbar's criteria-management button and top-of-page leave-allowance button
were removed (relocated here), but its daily-operational controls (Today's
own criterion selector, the read-only "이번 달 연차" glance strip) were not
— only *management* entry points moved, not daily use.

Page structure, top to bottom: annual summary (actual-attendance donut +
monthly stacked 지각/조퇴/결근 bar chart + a restrained on-time-rate/average-
work-time/average-score KPI row) → selected month's leave card (configured/
confirmed/planned/available, stacked bar) + monthly attendance-count summary
→ one plan-and-actual calendar (three view modes: 계획 + 실제/계획만/실제만;
a combined cell always shows plan/divider/actual, even when one side is
blank — the divider is a confirmed visual requirement) → Attendance History
(날짜|계획|실제|메모 only, ordinary `WORK`/`DAY_OFF` excluded unless plan/
actual disagree in a way that surfaces a special event, whole row clickable
→ reuses `WorkLogRecordDetailModal`) → `StartTimeCriterion` management
(inline table, not a modal — memo column, delete button).

**Data fetching**: two range fetches per selected year
(`GET /api/work-records?from&to`, `GET /api/attendance-plans?from&to`) cover
the annual summary, monthly summary, calendar, and history sections at
once — never one request per date. The annual/monthly aggregates
(donut composition, monthly abnormal-attendance counts, on-time rate,
average work time, average score) are all computed client-side from that
one year of already-fetched records, the same pattern the existing 12-week
trend chart already used — a dedicated aggregate endpoint was judged
unnecessary for a personal, single-user app at this data volume.

**Quick Plan Popover**: small, anchored to the clicked calendar cell — date,
status, criterion selector (WORK/HALF_DAY only), Save, Delete. Opening it
never writes anything. Leave-consuming plans are validated against §2's
shared pool server-side. Calendar cell selection (pale-blue highlight) plus
Ctrl+C/Ctrl+V duplicates a plan's payload onto another selected date
(in-memory clipboard only, no persistent clipboard system) — disabled while
focus is inside any input/textarea/select/contenteditable, so normal browser
copy/paste inside the popover's own controls is never hijacked.

## 7. `StartTimeCriterion` — memo + archive-vs-hard-delete

Adds an optional `memo` (schema/entity/DTO/API/UI). Adds a real `DELETE`
endpoint (previously none existed — deactivation was the only "removal").
Delete distinguishes:

- **No usage history at all** (no `WorkRecord.appliedCriterionId`, no
  `AttendancePlan.startTimeCriterionId` references it) → physically removed
  from the table.
- **Has history** → archived instead: a one-way `deleted_at` tombstone (same
  pattern already established by `checklist_items`), which forces
  `isActive`/`isDefault` false, is hidden from normal management/selectors,
  and is never treated as a normal reactivatable inactive record (`update()`
  rejects touching an archived row). Deactivating/archiving the current
  default transfers default to another active criterion, the same
  deterministic rule (lowest `sortOrder`, then name) already used elsewhere.

`WorkRecord`'s own applied-criterion snapshot columns are unaffected either
way — they were never a live foreign key (see
`docs/backend/start-time-criteria.md` §6) and remain fully readable
regardless of the source criterion's later archival.

## 8. Work Record refinements bundled into this batch

- **Fast date-jump** (§23): the toolbar's range text is now a button that
  reveals a native `<input type="date">` popover; picking a date maps onto
  whichever range the current period unit (일/주/월) displays. No new
  date-picker dependency.
- **Daily Work chart area fill** (§24): translucent fills (different
  opacities per series) beneath both 체류 시간/실근무 lines in Time mode,
  rendered under the existing line strokes — calculations, target baseline,
  curve rendering, tooltips, and non-work gaps are all unchanged.

## 9. Explicitly out of scope for this batch

Checklist refinement/redesign was **not** performed — `/worklog/checklist`,
its matrix table, checkbox interaction, ordering, and analytics content are
unchanged; only shared components already reused by both areas (none, in
this batch) would have required verification. Also out of scope: complex
recurring attendance plans, a schedule-pattern builder, a range planner,
half-day AM/PM variants, leave carryover, a global unified Settings page.
See the iteration record under `docs/iterations/` for the full punch list
and any deferred follow-ups.
