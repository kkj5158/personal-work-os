# Accounts and balance monitoring V3

Owner-approved scope: a single account table and a read-only reconciliation dashboard.
The existing ledger, financial editors, posting/deduplication policies and detailed
`GET /api/money/accounts/{id}/reconciliation-snapshot` remain authoritative and intact.
This change does not add or connect MCP tools.

## Evidence and comparison

`GET /api/money/reconciliation-summary` is the shared owner-scoped source for both
screens. It runs in a read-only repeatable-read transaction, loads evidence in batch,
and uses `MoneyProductService.ledgerDelta` with the existing per-account effective
posting time. It does not invoke the deep evidence/matching graph for every account.
Current balance retains the canonical `accountBalances` calculation. `calculatedAt`
is the calculation cutoff; `basisAt` is the underlying anchor time, not bank sync time.
Unknown and non-KRW balances are nullable, rather than displayed as zero.

The latest valid `observedAt` across bank observations, manual observations and
legacy checkpoint anchors selects the comparison instant. Contradictory amounts at
that instant, or at the calculation anchor instant, yield `CONFLICT`. Source arrival
order cannot resolve a contradictory tie. An actual observation is displayed ahead
of an anchor at a consistent tie only to label its provenance.

Manual observations never establish a ledger calculation anchor. A prior checkpoint,
otherwise the first earlier bank observation, supplies the canonical historical
basis. `ledgerAtObservedAt = anchor + ledgerDelta(anchorAt, observedAt)` and
`difference = observedBalance - ledgerAtObservedAt`. Later transactions do not
change this comparison unless their effective posting time is within that interval.
Existing excluded/merged facts are omitted; unresolved currency prevents comparison.
Relevant unposted/unresolved notifications prevent a verified match or mismatch.

Active-account counts map `MISMATCH` to 차이 있음; `MATCHED` and `MANUAL_MATCH` to
일치; all other reasons to 확인 필요. Archived accounts remain available in Accounts
but are excluded from dashboard counts. `independentVerification` describes a
comparable bank observation at its recorded time only: it is never a claim of a
current bank connection, freshness, or up-to-the-second verification. Manual agreement
is explicitly labelled 직접 확인. A manual anchor alone is always 확인 필요.

## Observation persistence and API

V109 adds `money_balance_observations`, `money_balance_observation_revisions`, and
`money_account_table_preferences`, with owner constraints/RLS and account/time indices.
No existing row is modified, no fixture is seeded, and no ledger checkpoint or
transaction is created by the observation service.

All observation routes are under `/api/money/accounts/{account}/observations`:

| Method / suffix | Behavior |
| --- | --- |
| GET | Chronological manual history, including cancelled records |
| POST | Create amount, observedAt, optional note/reason |
| PUT /{id} | Edit amount, time, note; expectedVersion required |
| POST /{id}/cancel | Soft cancel, expectedVersion required |
| POST /{id}/restore | Restore, expectedVersion required |
| GET /{id}/revisions | Immutable old/new values, reason, actor and recorded time |

IDs and ownership are server assigned. Origin is always `USER_MANUAL`; state is
`ACTIVE` or `CANCELLED`. Mutation and audit append are one transaction under the
existing owner advisory lock. Revision zero is CREATE. Editing/cancellation/restoration
increments only observation version; account version and ledger remain untouched.
There is no physical-delete endpoint. Account deletion eligibility includes even
cancelled observation evidence; archive is the normal lifecycle.

Amounts use server BigDecimal/NUMERIC(19,2), accept signed zero/negative values,
and reject excess precision/range. Timestamps are canonical instants and strictly
Observation JSON also includes `amountText`, the exact decimal string. History
display and edit/resave use that string so large amounts cannot be rounded by
JavaScript number parsing; the numeric `amount` remains backward compatible.
reject future observations. UI `datetime-local` inputs explicitly use KST (+09:00),
default when the input begins, and preserve the original instant on a note-only edit.
Server createdAt/updatedAt remain distinct from observedAt. Notes/reasons are at
most 500 characters. Version conflicts preserve UI drafts and require an explicit
latest-version refresh; uncertain network outcomes are never automatically reposted.

`GET /accounts/{account}/bank-observations` is a safe registered-source adapter,
returning amount/time/provenance without raw notification content. Pending bank
observations are represented in the monitoring summary; diagnostic evidence stays
available through the existing detailed read surface.

`GET/PUT /api/money/accounts/table-preferences` persist hidden columns per owner
with optimistic version checks. Scope/search/sort are session scoped. Account edits,
bulk changes and tracking/representative switches reuse the existing versioned APIs,
fund-history policy and tracking/representative limits. Partial bulk failure retains
the remaining selection and refreshes server state.

## UI and recovery

Accounts has 13 default columns with pinned identity and horizontal scrolling. The
drawer opens only on selection/deep link and retains the existing financial editors,
archive/restore, recent transactions and history. Observation entry is separate from
exceptional opening-balance/adjustment controls. The reconciliation page only reads,
filters, searches, refreshes and routes to account management; it has no write form.

Financial cache mutation invalidates the shared summary; its ordinary TTL/foreground
refresh also picks up server-side ingestion. Both pages consume the same summary.
No production test financial writes are required. Recover by compatible roll-forward;
do not drop V109 tables or erase observation/audit records after use. An older compatible
frontend/server can ignore the additive tables while preserving every new record.
