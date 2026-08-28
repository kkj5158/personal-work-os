# Leave Allowance

Implements the leave-allowance portion of `docs/product/work-log-policy.md`
(post-production iteration 1).

## 1. Table

`monthly_leave_allowances` — new in `V14__add_half_day_status_and_monthly_leave_allowance.sql` (the same migration that adds `HALF_DAY` to `work_records.status`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, client-assigned |
| `user_id` | UUID | Owning user |
| `leave_year` / `leave_month` | INTEGER | Together with `user_id`, uniquely identify one month (`uq_monthly_leave_allowances_user_month`) |
| `allowance_days` | NUMERIC(4,1) | 0.5-day granularity, enforced both by a DB `CHECK (MOD(allowance_days * 2, 1) = 0)` and in `LeaveAllowanceService` |

A row's mere existence (regardless of its value) means the month has been
explicitly configured — `0.0` and "no row" are different states, both
representable and distinguishable via the unique constraint.

## 2. Usage is never stored

`LeaveAllowanceService.computeUsedLeave(userId, month, excludeDate)` sums
`WorkAttendanceStatus.leaveConsumption()` (`PAID_LEAVE` = 1.0, `HALF_DAY` =
0.5, everything else = 0.0) across every `WorkRecord` in that month, fetched
via the existing `WorkRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc`.
`excludeDate`, when given, skips that one date — used so validating a
prospective new status for a date never double-counts that same date's
current (about-to-be-replaced) consumption against itself.

## 3. API

Base route `/api/leave-allowances`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/leave-allowances/{year}/{month}` | `LeaveMonthSummary(year, month, allowanceDays, usedDays, remainingDays)` — `allowanceDays`/`remainingDays` are `null` when unconfigured. |
| `PUT` | `/api/leave-allowances/{year}/{month}` | Body `{allowanceDays}`. Creates or overwrites the month's allowance; rejected if the new value is negative, not a half-day multiple, or below leave already used that month. |

## 4. Integration with `WorkRecordService`

`WorkRecordService.applyUpsert` calls
`LeaveAllowanceService.requireSufficientBalance(userId, workDate, request.status())`
after the workday/non-workday validation branch and before resolving the
on-time override. It is a no-op for any status whose `leaveConsumption()` is
zero. For `PAID_LEAVE`/`HALF_DAY` it:

1. Throws `InvalidRequestException` ("Configure this month's leave
   allowance first.") if `workDate`'s month has no configured row at all.
2. Otherwise computes usage excluding `workDate` itself, and throws
   ("Not enough remaining leave this month.") if `remaining < required`.

This validates against **the record's own month**, not whatever the current
calendar month happens to be — editing a historical date is judged by that
date's own month, which is what makes correcting a past record's leave
status behave sensibly regardless of when the correction is made.

## 5. `WorkAttendanceStatus.leaveConsumption()`

`HALF_DAY` was added to the enum alongside `WORK`/`EARLY_LEAVE` as a third
workday status (`isWorkday()` now returns true for all three). Each status's
leave consumption is a method on the enum itself (`BigDecimal`, `PAID_LEAVE`
→ `ONE`, `HALF_DAY` → `0.5`, everything else → `ZERO`) — the single source
both `LeaveAllowanceService` and any future consumer must use, rather than
re-deriving the mapping ad hoc.

## 6. Work-included → non-work entries guard

Introduced in the same migration/service change: `WorkRecordService.applyUpsert`
now rejects a transition from a workday status (`WORK`/`EARLY_LEAVE`/
`HALF_DAY`) to a non-workday one while the **existing persisted** record
still has `WorkTimeEntry` rows (`InvalidRequestException`, "Remove this
date's work-time entries before changing to a non-working status") —
mirroring the existing `clearClockTimes` guard rather than silently
deleting them via the incoming request's empty `workTimeEntries` list. See
`docs/backend/work-record.md` for the full before/after and why this is a
deliberate policy tightening for this iteration, not a bug fix.
