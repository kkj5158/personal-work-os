# MONEY Calendar V1 API

## Coupang hotfix 001–004: Sunday receivables and preserved deposit history

The web work calendar now uses `GET /pay-calendar?month=YYYY-MM` and
`GET`/`PUT /pay-weeks/{sunday}`. The original `/work` and Monday `/weeks` routes
below retain their deposit-based rules for compatibility and historical audit.
The two settlement bases have separate persistence; no old rows are moved,
rewritten or copied into the new allowance breakdown.

`pay-calendar` returns `gridStart`/`gridEnd` for complete Sunday–Saturday visible
weeks, `records` across that entire span (including adjacent months),
`archivedRecords` for removed OFF records in the same span, `weeks`, `summary`,
and `legacyWeeks`. Monthly `completedWorkdays`, `completedMinutes`,
`receivableAmount` and `scheduledAmount` use the nominal month only.
`receivableAmount` sums the daily expected amounts of COMPLETED entries;
`scheduledAmount` includes scheduled dates on or after KST today. Expected wages
remain receivables and are never described as confirmed bank receipts.

Each new pay week sums COMPLETED, non-removed work entries once by work date
from Sunday through Saturday. `totalPay` and `receivableAmount` are that same
gross amount; the four allowances are included components. `basePay` subtracts
them once. `workEntries` contains the underlying completed work records for
source tracing, `payments` is empty, and
`aggregationBasis` is `WORK_DATE_RECEIVABLE`. The old input fields
`expectedVersion`, `expectedTotalPay`, and four nullable allowances remain the
write contract. Missing allowances stay unconfirmed; zeroes explicitly confirm;
negative/excessive sums are invalid. Changes to work-date gross invalidate the
previous confirmation without losing saved components. Stale form totals return
409. New weeks do not assume a verified employer payroll cycle.

`legacyWeeks` is read-only, all-history Monday–Sunday deposit data, not a
current-month subset. It includes every saved legacy week (even zero totals)
and every deposit-derived legacy week with a positive total, complete original
payment IDs/dates/amounts and original allowances. Its basis is
`LEGACY_DEPOSIT_DATE` and `readOnly` is true. The old table and endpoints retain
their original accounting rules.

Work PUT now accepts omitted or null `payments`: this preserves existing deposit
rows exactly, with no DELETE/INSERT or other payment-table writes. The new web
editor uses omission. Explicit legacy payment lists retain the previous
replacement/correction semantics, including an explicit empty list.
An existing paid work record cannot change its work date in omitted/null payment
mode, because that would silently change the retained payment's work-date trace.
Explicit legacy payment corrections retain their previous date-edit semantics.

Templates GET appends one immutable virtual `🏠 휴무` catalog entry with
`builtIn: OFF`, template UUID `00000000-0000-4000-8000-000000000004`, and preset
UUID `00000000-0000-4000-8000-000000000005`. It is available to every
authenticated owner, has zero work/pay, cannot be edited, and never seeds a DB
row or duplicates on repeated reads/deployments.

Saving status OFF authoritatively clears template/preset references,
start/end/break/overnight values, duration and daily amount, and sets
`templateName` to `휴무`. Times are not required. Omitted deposits survive even
when a previously paid work record becomes OFF. On an actual non-OFF to OFF
transition, `offTransitionHistory` preserves the previous work payload. Each
snapshot excludes the preceding history list, so growth is linear. Edits retain
the history; switching back to work requires explicit template/time/pay choices
and never automatically restores stale values.

`POST /work-records/{id}/remove-off` with `{expectedVersion}` soft archives only
OFF records by setting `removed: true`, retaining UUID, prior payload, history
and deposits. Identical retries are idempotent; stale changes return 409. New
calendar reads exclude the removed record from `records` and expose it in
`archivedRecords`. Recreating that date reuses the archived UUID/current version
through the ordinary work PUT, which clears `removed`. The unique owner/date
constraint prevents silent overwrite with a fresh UUID.

V85 adds only `money_work_pay_weeks` with a Sunday constraint, owner foreign key,
unique owner/start pair and owner RLS. The existing Monday constraint and all
previous migrations remain immutable. Application rollback preserves all tables
and user data. This feature creates no financial income or other ledger facts.

## Original V1 endpoints and historical contract

All routes are under `/api/money/calendar`, use the existing authenticated owner,
and accept no owner override. Work management never writes financial ledger or
WORK OS attendance data. Money values are nonnegative KRW integers up to
999,999,999,999; payment amounts must be positive. Decimal numeric requests are
rejected by a controller-local parser, without changing other MONEY APIs.

## Financial calendars

`GET /ledger?month=YYYY-MM&kind=EXPENSE|INCOME&accountIds=...&categoryIds=...`
returns the existing bookkeeping response shape with complete, unpaged monthly
`items`. It uses the authoritative `MoneyWebService` effective projection and its
exact tracking, category, account, refund, loan-cost, exclusion and merge filters.
The existing foreign-currency boundary applies: unsupported currency makes KRW
analytics unavailable rather than fabricating a conversion or subtotal.

`summary` additionally contains `spendingDayCount`, `incomeDayCount`,
`transactionCount` (excluding refunds), `refundCount`, and
`averageDailySpending`. Refund-only dates are not spending days. Average uses
elapsed KST calendar days in the current month, full days in past months, and null
in future months. Existing transaction IDs support the ordinary detail panel.

## Templates

`GET /templates`, `GET /templates/{id}` and `PUT /templates/{id}`.
The client chooses a UUID before the first PUT and sends `expectedVersion: 0`.
The first saved version is 1. Payload fields:

- `name`, `durationMinutes`, optional paired `startTime`/`endTime` (`HH:mm`),
  `breakMinutes`, `overnight`, `shiftDescription`, `groupName`, `active`.
- `presets`: stable `{id, name, amount, active}` records.
- `defaultPresetId`: an active preset when the template is active.

Existing presets are deactivated rather than silently deleted. Default changes
affect new selections only. All edits require the loaded `expectedVersion`.

## Work and receipts

`GET /work?month=YYYY-MM` returns `{records, payments, weeks, summary}`.
Records are selected by work date; payments by deposit date. Week summaries cover
whole Monday–Sunday weeks intersecting the month, including boundary dates.

`GET /work-records/{id}` and `PUT /work-records/{id}` use stable client UUIDs.
Work payload fields are `expectedVersion`, `workDate`,
`status` (`SCHEDULED`, `COMPLETED`, `OFF`, `CANCELLED`), `templateId`, `presetId`,
`startTime`, `endTime`, `overnight`, `breakMinutes`, `durationMinutes`,
`expectedAmount`, `memo`, and `payments` (`{id,depositDate,amount}`).
The payment list is replaced atomically under the work version; IDs cannot be
reassigned to another work record. New UUIDs must be preserved across retries.
One work record per owner/date is enforced without using the date as its ID.

Completed and scheduled entries require a template/preset and a valid interval.
Overnight ending is explicit; total interval cannot exceed 24 hours and effective
duration must be positive after breaks. OFF/CANCELLED require zero expected
amount and have zero duration, with no template required. Future completion,
future receipts, advance receipts and receipts on non-completed entries are
rejected. Actual receipt amounts may differ from expected wages.

The work response includes historical `templateName`, `presetName`, `presetAmount`
and `templateSnapshot`. Keeping the same selection preserves historical values
when templates change or become inactive. `saveAsPresetName` explicitly adds a
new amount preset while preserving the existing default.

Monthly summary fields: `completedWorkdays`, `completedMinutes` (work dates),
`receivedAmount` (deposit dates), `outstandingAmount` (selected month's completed
work minus all receipts, clamped per work), and `scheduledAmount` (selected
month's scheduled dates on or after KST today). Thus 향후 예정 includes today and
excludes unfinished past schedules.

## Weekly allowances

`GET /weeks/{monday}` and `PUT /weeks/{monday}` use calendar weeks, not a verified
employer payroll cycle. PUT requires loaded `expectedVersion` and
`expectedTotalPay`, plus four nullable fields: `specialWorkAllowance`,
`weeklyHolidayAllowance`, `publicHolidayAllowance`, and `incentive`.
The expected total protects a form from concurrent payment changes even when the
allowance version itself has not changed.

`totalPay` counts unique deposit-dated payment rows once. `basePay` is total less
the four allowances. Missing fields remain saved but unconfirmed; four explicit
zeroes confirm no separate allowances. Negative or excessive allowance sums are
invalid. A later receipt-total change preserves all allowance values and returns
`needsReview: true`, `allowancesConfirmed: false`, and `basePay: null` until
explicitly reviewed and saved with the current total/version.

## Concurrency and migration

Owner-scoped advisory transaction locks serialize this domain's mutations.
Optimistic conflicts return existing HTTP 409 errors; drafts can retrieve the
owner-scoped latest record for comparison. Identical retries of the most recent
PUT replay the saved result without creating duplicate receipts or presets.
Changed retries cannot bypass version checks. Read-only response fields in a
frontend draft are ignored; historical snapshots always come from the server.

V84 adds `money_work_templates`, `money_coupang_work_records`,
`money_work_payments`, and `money_work_weeks`, with owner foreign keys,
unique constraints, a deposit-date index and JWT-owner RLS policies. It changes
no existing tables or data. It is backward compatible with existing clients.
Rollback is to the previous application version while preserving these additive
tables and their records; do not drop tables containing user data.
