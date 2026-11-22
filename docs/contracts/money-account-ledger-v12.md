# MONEY account transaction ledger V1.2

`/money/ledger` is the account perspective on existing `money_transactions` and
`money_transaction_sources`. Owner financial-type decisions are recorded separately
from these cash facts. MONEY navigation places 계좌 거래장 immediately after
가계부 in 02 · 거래 및 장부. Opening balances and balance adjustment anchors remain in
their existing account/reconciliation tools, rather than ordinary movement rows.

## Read API

`GET /api/money/account-ledger` accepts required inclusive KST dates `from`, `to`,
optional single UUID `accountId`, `type`, `state=ALL|CONFIRMED|UNRESOLVED|RELATION_PENDING`, `search`,
`limit` and `offset`. Omit `accountId` for ALL; repeated parameters, comma-separated
accounts and `accountIds` combinations are rejected. Existing generic APIs retain
their original filter contracts. Results use stable occurrence-time/ID pagination.

`items` contains one active, unmerged canonical transaction per row. `signedAmount`
is negative for the selected source account and positive for its destination. ALL
shows a transfer once with a neutral amount. `accountCounts` counts the entire
matching result, before account scope and pagination. `summary.incoming/outgoing`
is available only for a single account in one currency; it is a period movement,
never an observed or reconciled balance. ALL has no combined balance.

`declaredFinancialType` records the owner's selection. Use `canonicalType`,
`meaningApplied` and `relationStatus` to distinguish its accounting effect and
remaining work. Confirmed savings totals use the transfer route and historical
account group membership. An unmatched savings intent may appear in the ledger
while the cash movement still awaits verification.

`GET /account-ledger/pending` uses the same period/account filters over existing
Review Required RAW queue rows. Unknown accounts remain in ALL only. RAW has no
confirmed financial type or incoming/outgoing total, and is never posted by this
view. Existing Review Required owns financial admission.

Gate 0 review links open `/money/ledger?transactionId=<uuid>`. The detail fetch
uses the owner-scoped canonical row endpoint independently of the visible page
and period. Opening the link performs a read. Financial meaning remains editable
through the existing ledger commands.

## Commands and editing

`GET /account-ledger/rows/{id}` supplies current canonical facts, source links,
classification projection, audit history and an evidence fingerprint.

`POST /rows/{id}/preview` accepts `{fingerprint, edit}` using the existing unified
financial command fields. The server executes normal validation in a rollback-only
nested transaction. Facts, debt, audit and durable outcome remain unchanged. The
returned preview token binds the exact draft and relevant target account, loan,
transaction and source versions. `POST /rows/{id}/execute` requires that token and
revalidates current evidence under the canonical owner lock. Durable request IDs
recover through `/bookkeeping/unified/outcomes/{requestId}`. An uncertain response
does not justify issuing a new request ID.

The ordinary picker sends a single `PATCH /api/money/account-ledger/rows/{id}/financial-type`
with `requestId`, `expectedVersion` and `financialType`. The response includes
`intentSaved`, `meaningApplied`, `relationStatus`, `currentVersion` and the row.
Replay the exact payload and request ID after a lost response. A same-row stale
version requires a fresh read and an explicit decision on the latest version.
The advanced editor still previews changes to financial facts and verified links.

The additive Flyway repeatable creates `money_owner_financial_decisions` keyed by
owner and transaction. Existing rows require no backfill. An unpaired debit
declared as TRANSFER retains its original outgoing leg. Pending loan repayment,
loan receipt and refund decisions preserve cash, original purchase and loan
principal until verified. For existing allocated or matched transactions the
ledger can persist a requested correction while keeping the verified effects.

`POST /rows/{id}/metadata` edits title/memo with expected transaction version,
fingerprint and durable request ID, retaining coherent Bookkeeping metadata and
audit history. Bank notification contents and source identities remain immutable.

`POST /rows/{id}/category` accepts request ID, expected transaction/classification
versions, fingerprint and explicit category. Only confirmed EXPENSE/INCOME qualify.
The scoped effective projection and existing classification persistence retain
direct protection, history and versions even outside statistical tracking. Saving
a category does not enable tracking or statistics. Bulk classification reuses the
existing bounded preview/commit workflow and reports exclusions.

REFUND reports its linked original expense category. Historical standalone refund
override JSON remains retained, but does not override the original category in the
effective reporting projection. Noncategorical types expose no category editor.

Connected-transfer amount/time/account corrections require the existing guarded
unlink/relink process; the ledger explicitly rejects unsupported direct changes.
Loan payment amount/time corrections retain their dedicated financial constraints.
Loan receipt conversion preserves the same cash row, validates loan version and
principal cap, and increases debt once. No synthetic reconciliation postings are
created and no owner production records are write-test fixtures.

## Validation boundaries

`node qa/account-ledger-owned.mjs` creates a fresh PostgreSQL18 cluster on loopback
55473 with a synthetic owner, full migrations, actual API18097/Web13017 and regression
tests. It never discovers shared database credentials. `--baseline` runs the baseline
subset; `--review-regression` uses the existing Review test gate on loopback55467.
All ports must be available; unknown processes are preserved.

Run `qa/account-ledger-browser.mjs` only through the verified existing TEAM KAFKA
Playwright provider after its current bootstrap/preflight. It refuses financial
fixtures without the exact local origin and synthetic account names. It does not
launch another browser/profile. Signal completion with the current owned run's
`stop` file; cleanup verifies process handles and ports. Report exploratory versus
exact-commit tests, skips, screenshots and deployed SHA/IDs separately.
