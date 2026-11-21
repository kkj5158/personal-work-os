# MONEY financial-meaning quick confirm and evidence-first engine V1.1

Owner decision: Policy B (evidence-first), 2026-11-21.

## Financial invariants

- A bank notification is source evidence, not a confirmed consumption/income classification.
- Persisted provisional `type=EXPENSE|INCOME` and `meaning_state=UNRESOLVED` are independent.
- Owner direct decisions take precedence over future automation.
- No changes to raw event, amount, occurred time, real account legs or loan principal from simple type confirmation.
- Existing account-ledger `preview` / `execute` version, fingerprint, preview token and durable request ID safeguards remain mandatory.

## P0: quick confirm

The ledger projects `quickConfirmAvailable` for one-leg `UNRESOLVED` expense/outgoing or income/incoming transactions with a current, verified primary bank parse. The server checks the exact source, owner account, amount, currency, time, direction and conflicting links. The `QUICK_CONFIRM` action rechecks the same conditions in the canonical preview and execute path. The click fetches a fresh row, sends its fingerprint and version, and executes only the returned preview token. Recovery keeps the exact request ID. The row-inline editor retains the guarded transfer, savings, refund, loan and bank-fact operations.

This is manual owner confirmation, not automatic engine classification.

## P1: evidence-first engine

Owner decisions take precedence. Next, verify the normalized primary source and canonical cash fact. Cross-account transfer proposals need reciprocal unique matches and supporting bank evidence. A competing pair or protected counterpart requires review. The suggested pair remains subject to the canonical link operation. Loan and refund allocations stay in their existing guarded paths.

An owner can explicitly register an exact account/provider/merchant/direction rule using a current quick-confirm decision. A stale basis or superseded primary parse cannot support automation. Rule eligibility is independent of lifestyle categories. `AUTO_CONFIRM_ELIGIBLE` requires the approved rule and source. `PROPOSE_ONLY` includes supported cash or transfer suggestions. `REVIEW_REQUIRED` retains the cash fact when evidence is missing or conflicting. Model scores do not authorize writes.

## P2: Shadow & operational controls

The engine panel reads owner-scoped candidates, rules and status at `/api/money/financial-engine`. A Shadow run takes a consistent snapshot of up to 1,000 unresolved facts and stores row decisions, rule evidence, fingerprint and gross statistical projections. It writes only a run receipt. The historical preview GET also computes this projection without persistence. Caps and pagination are returned with the results.

Batch preview accepts 1–25 exact IDs, versions and same-direction provisional types. The 10-minute preview fixes the candidate evidence and canonical edit tokens. Execution requires its ID, fingerprint, confirmation and durable request ID. A changed fact, rule or canonical edit dependency cancels the entire batch. Historical execution always requires the owner's separate approval of that exact preview.

`app.money.financial-engine-auto-confirm` defaults to false. The hook is available only under `dev` or authenticated `hosted-dev` with the DEV database environment. Scheduler admission records ordinary cash as unresolved first. Auto-confirm requires a fresh notification and cash time, verified source, current rule, and no conflicting owner evidence. Existing canonical transfer handling stays in the bank matcher. The `prod` profile cannot enable the new automatic write path.

`R__money_financial_evidence_engine.sql` adds only owner-scoped rules, Shadow receipts and exact batch previews. It is independently deployable alongside different versioned migrations in DEV and PROD. Leave the metadata tables in place during an application rollback.

For verification: current MCP count of unresolved semantic meaning was 310 on 2026-11-21; scope must be independently verified. Three loan-split decisions were pending. Do not auto-correct existing production facts based solely on this count.

## Required release checks

Test simple manual confirmation and outcome recovery; wrong direction, missing source, stale version, different owner and linked transactions must not bypass guarded flow. Preserve source hash, account balance, loan split, refund caps, transfer uniqueness and owner protections. Isolated DEV/synthetic PostgreSQL tests first. Production only after latest-dev integration, full mandatory gates and deployment lock verification.

The [ORBIT tool inventory](orbit-money-tool-inventory-v1.md) documents the registered read routes and protected writes. The V1.1 handoff ZIP contains the design, product specification and QA matrix.
