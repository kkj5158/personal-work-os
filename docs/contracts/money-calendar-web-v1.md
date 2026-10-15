# MONEY Calendar Web V1

Owner-approved implementation scope: 2026-10-15. The original Calendar V1
proposal's `미승인` label is superseded by the explicit implementation/release
request. The four original reference files are preserved at
`F:/artifacts/money-calendar-web-v1-20261015/source`; unrelated Workflow calendar
artifacts are not requirements for this feature.

## Navigation and financial authority

Three independent routes belong to `03 · 달력` after Transactions/Bookkeeping:
`/money/spending-calendar`, `/money/income-calendar`, and
`/money/coupang-work-calendar`. Financial Management and Analysis are groups 04
and 05. Existing destinations and settings retain their behavior.

Spending and income calendars are read projections of the existing authoritative
MONEY bookkeeping query, including account tracking, category hierarchy and
historical references, exclusions, merges, transfers, refunds, loans, and foreign
currency restrictions. They do not create a separate recognition algorithm.
Refunds reduce spending on their own occurrence date. Refund-only dates do not
count as spending days. Monthly averages use elapsed KST calendar days for the
current month, full month length for earlier months, and no average for future
months. Calendar, detail, composition and summary use equivalent filters.

## Independent work-management domain

### Owner-approved Coupang Hotfix V2 (2026-10-15, active web model)

The active web editor uses `/earnings-calendar`, `/earnings-records/{id}` and
`/earnings-weeks/{sunday}`. A saved working day's confirmed pay is
`basePay + dailyIncentive - totalDeduction`; both scheduled and completed work
contribute independently of payment status. Weekly pay is the sum of confirmed
daily pay plus only special-work and weekly-rest allowances. The Sunday calendar
shows a prominent weekly total and an always-visible five-line breakdown.

Existing single `expectedAmount` values were forecast/net receivables, not
verified gross base wages. They remain visible with their original amount and a
review-required indication, excluded from confirmed totals until the user
explicitly enters the three components. Conversion preserves a server-generated
original snapshot and source timestamp; existing payment rows are untouched.
V84/V85 settlement values remain read-only historical sources and are never
silently reassigned to a day or added to the new calculation. Additive V86 stores
only the new two-allowance weekly model. The V1 rules below describe compatibility
endpoints and historical behavior; V2 supersedes them in the active work UI.
See `MONEY_CALENDAR_V1_API.md` for exact fields, conflict protection and recovery.

### Owner-approved Coupang hotfix 001–004 (2026-10-15)

The Coupang web calendar now uses Sunday–Saturday work-date weeks. Its gross
pay is the sum of each active COMPLETED work record's daily expected receivable
once, excluding SCHEDULED/OFF/CANCELLED and removed records. It is not proof of
bank receipt. Monthly work totals use only nominal-month dates; the returned
editable grid includes all adjacent-month dates in complete Sunday–Saturday rows.
The four weekly allowances are components of gross, never added again.

`/pay-calendar?month=YYYY-MM` and `/pay-weeks/{sunday}` implement this basis.
The additive V85 `money_work_pay_weeks` table stores these Sunday breakdowns.
Existing Monday deposit-date rows and endpoints remain unchanged. They are shown
as read-only historical records, including out-of-month history; old allowances
are not silently reassigned or prorated into overlapping Sunday weeks. The
original receipt-based rules below describe those retained compatibility APIs.

The work editor has no deposit-entry workflow. Omitting `payments` on PUT
preserves the exact existing payment rows; explicitly supplied legacy lists keep
their original correction semantics. No income transaction is generated.

A stable immutable virtual `🏠 휴무` template is included in the owned catalog.
It requires no GET-time database writes, seed migration, or duplicate rows.
Selecting OFF clears time, break, duration and daily receivable to zero. Explicit
working-to-OFF transitions retain the prior work facts in an audit snapshot and
preserve historical deposits. Versioned remove-off archives the OFF row rather
than destroying it. Recreating that date uses its archived UUID/version, so
concurrent data cannot be overwritten through blind date-based replacement.

Work-calendar queries do not schedule the shared 30-second TTL polling timer.
Initial reads, explicit mutation invalidation and expired foreground return still
load authoritative data. Existing rendered content/editor identity remains
mounted during revalidation; other MONEY pages retain their refresh policy.

Coupang work records, expected wages and manually confirmed receipts never
create or modify MONEY income transactions or WORK OS attendance. Work dates
and deposit dates remain separate. Month work metrics use work dates; received
amounts and Monday–Sunday comparison totals use deposit dates, including payments
for work outside the selected month/week. These are comparison weeks, not an
assertion about the employer's payroll cycle. Advance payments and allocations
of one payment across multiple work records are outside V1.

Templates contain nested amount presets, one explicit active default when the
template is active, optional paired default start/end times, duration, breaks,
overnight end, shift/group description and active state. Presets are deactivated
rather than removed. Work records preserve template/preset snapshots; later
catalog edits do not rewrite history. A per-day expected amount edit does not
change a preset. Saving a new preset requires explicit user input and preserves
the default selection.

Work statuses are `SCHEDULED`, `COMPLETED`, `OFF`, `CANCELLED`. V1 enforces one
record per owner/date while permanent identity is a UUID. Completed future work,
future receipts, receipts before the work date, nonpositive receipts and receipts
on noncompleted records are invalid. Effective duration subtracts breaks and
requires explicit next-day ending for overnight work. Partial and multiple
payments have stable individual UUIDs. Atomic work updates validate every payment
owner and association. Duplicate payment IDs and date collisions are rejected.

The weekly hierarchy is total received pay, then base pay, then four editable
allowances: special work, weekly holiday, public holiday and incentive.
`basePay = totalPay - sum(four allowances)`. Allowances are components, never
added to total pay again. KRW amounts are nonnegative integers, receipts positive.
Missing allowance fields remain unconfirmed; four saved zeros explicitly confirm
no allowances. A payment change invalidating an existing breakdown requires
review while preserving entered allowance amounts.

## Persistence and API

Additive Flyway `V84__money_calendar_work.sql` creates `money_work_templates`,
`money_coupang_work_records`, `money_work_payments`, and `money_work_weeks`.
Template/preset snapshots and editable aggregates use JSONB; payments remain
individually identifiable relational rows. No existing financial table is
rewritten or dropped. Foreign keys, owner/date uniqueness, indexes and RLS are
part of the migration. Existing JPA `validate` and Flyway clean protection remain.

All routes below use the existing authenticated current-user provider and
server-side ownership checks under `/api/money/calendar`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/ledger?month=YYYY-MM&kind=EXPENSE\|INCOME` | Full monthly bookkeeping projection; optional accountIds/categoryIds |
| GET | `/templates` | Owned template catalog |
| PUT | `/templates/{uuid}` | Create/update template with nested presets |
| GET | `/work?month=YYYY-MM` | Work records, receipts, monthly metrics and weeks |
| PUT | `/work-records/{uuid}` | Atomic work record and payment list update |
| GET | `/weeks/{monday}` | Deposit-date total, allowance state and receipt trace |
| PUT | `/weeks/{monday}` | Save four allowance fields |

Writes carry `expectedVersion` (`0` for creation); weekly writes also carry the
loaded `expectedTotalPay` to prevent confirming an unseen payment-total change.
They use owner-level transaction
coordination, preserve unsaved client drafts on failure/conflict, and replay an
identical immediately preceding committed request without duplicate effects.
Stale changed requests conflict. Standard authentication and Android financial
API contracts are unchanged.

## Release and recovery

Use actual Railway PostgreSQL/GoTrue environment identities in
`docs/infra/POS_RAILWAY_MIGRATION_20261014.md`; older Supabase runtime descriptions
are historical. V84 is applied by normal backend startup Flyway through Railway
deployment. Validate existing migration checksums and the single intended pending
migration before deployment. Never repair/clean applied history.

`qa/money-calendar-preservation.mjs`, `qa/money-calendar-release-audit.mjs` and
`qa/money-calendar-backup.mjs` use the existing credential-safe Railway transport.
Set `POS_MIGRATION_ARTIFACT_DIR=F:/artifacts/pos-db-migration-20261014` as required by
that transport. Evidence and private financial archives belong under
`F:/artifacts/money-calendar-web-v1-20261015`, not Git. Archive listing verification
is not a claim of full restore validation.

Roll back application behavior with a scoped forward revert on the latest
release, preserving subsequent unrelated work and the additive V84 tables. Do
not drop calendar data or restore a stale whole database over newer user writes.
Use the pre-release receipts and established isolated DB recovery process for
any separately approved data recovery.
