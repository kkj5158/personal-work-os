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

### Coupang companion Web/shared API extension (2026-10-17)

The current extension uses earnings contract V4, with nullable schedule-only
wages, canonical expected-preset snapshots and separate date-free receipt
confirmation/history. New work or explicit reselection checks the selected
template version; memo/wage/receipt-only changes preserve historical snapshots.
Direct positive wage input on COMPLETED preselects the unsaved receipt toggle,
with deliberate manual OFF taking precedence until the editor is closed.
Stored wages and reads do not auto-confirm; one explicit Save persists the
work and marker atomically. There is no deposit-date/payment-list editor.

Date selection opens the work editor immediately, using a desktop dialog and
narrow sheet. Completed work prioritizes confirmed wage and receipt; time,
included incentive and memo can expand. Existing navigation, filters, focus,
draft protection and Sunday weekly inline details remain. Receipt totals are
work-date projections, independent from the unchanged confirmed weekly formula.
Historical payments and V2/V3 evidence remain read-only compatibility facts.
The historical receipt/date rules below apply only to retained old contracts.

See [the exact Android API handoff](../../ANDROID_API_HANDOFF.md) and
[Task 1 verification report](../releases/coupang-web-api-20261017.md).

### Owner-approved Coupang FIX-001/002 (2026-10-17, active web model)

The active editor uses `/earnings-calendar`, `/earnings-records/{id}` and
`/earnings-weeks/{sunday}`. Users directly enter confirmed daily pay and its
included incentive. `CONFIRMED_DIRECT_V3` stores the entered pay exactly; incentive
is informational and cannot exceed it. Existing `CONFIRMED_V2` records keep their
exact previously calculated pay, included incentive and historical components.
Both models contribute by work date. Weekly pay is confirmed daily pay plus only
special-work and weekly-rest allowances. The Sunday calendar retains inline totals
and the four-line breakdown; no daily deduction is subtracted a second time.

Unconfirmed original expected amounts stay read-only until explicit confirmation.
Warnings cover active historical working records only: past SCHEDULED/COMPLETED
and COMPLETED today in KST. OFF, CANCELLED, removed and upcoming scheduled records
do not warn or contribute wages. Original snapshots, V2 calculation evidence,
OFF transition/restoration identity and payments remain preserved. No bulk data
conversion or schema change is required. V84/V85 settlements retain their original
read-only evidence. See `MONEY_CALENDAR_V1_API.md` for exact compatibility fields.

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
