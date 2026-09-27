# MONEY Web Phase 2 financial core

Source: MONEY current policy 75, UIREF specification 80, V1.1 baseline 30,
Phase 1 closeout 95. Base DEV b280f1d9fd666bc1ee5c07cc3b2694bfd68578e1.
PROD promotion is not authorized for this phase.

## Implementation sequence and gates

1. Add auditable opening/reconciliation facts and linked loan payments; validate
   arithmetic, owner isolation, raw-evidence preservation and migration on an
   isolated synthetic schema.
2. Share visible filter controls and the existing docked panel; implement ledger,
   account cards/actions and loan history without changing Bookkeeping/Review UI.
3. Build Overview and relationship-first Flow Explorer on one financial analysis
   contract. Measure aggregate round trips and account-scoped history.
4. Run focused suites, managed Central QA, exact-revision performance samples and
   seven implementation captures; integrate DEV only through repository gates.
5. Update Drive closeout/INDEX and clean owned resources. No Prompt 3 or PROD.

## Persistence decisions

V59__money_financial_core.sql was checked against refreshed origin/dev, every active worktree and shared DEV history. Canonical V58 was latest, with Flyway validate PASS (57 versions; V52 absent). The additive V59 checksum is -918664272. Isolated schema tests passed before shared application. No applied migration is edited.

* INITIAL_BALANCE and BALANCE_ADJUSTMENT are ledger facts linked to immutable
  absolute balance checkpoints. Checkpoints are the point-in-time balance anchor;
  their ledger representations are never added a second time as balance deltas.
  Reconciliation retains calculated and verified values and the signed difference.
  Economic correction uses a new auditable reconciliation, never silent history
  replacement. Existing checkpoints are preserved without retroactive rewriting.
* LOAN_PAYMENT is one financial fact with an owned loan FK. A known split must
  have nonnegative principal, interest and fee summing exactly to the payment.
  All three null means unresolved; no allocation is inferred. Only confirmed
  principal reduces remaining liability. Confirmed interest/fee contribute to
  consumption; principal contributes only to the separate loan-repayment branch.
* Loan edits cannot silently overwrite principal after repayment facts exist.
  Repayment corrections retain previous financial details in correction history.
  History derives running remaining principal from the current remaining amount
  plus confirmed recorded principal, ordered by financial date/id. This is a
  recorded-history basis, not invented pre-enrollment loan history.
* Ordinary transaction editing and Bridge posting cannot create special types.
  Dedicated owner-locked/versioned operations preserve raw source links.
* Analysis excludes opening/reconciliation facts. External income, net
  consumption (including linked refunds), savings-boundary movement and confirmed
  loan principal are distinct measures. Internal savings hops contribute zero;
  reverse boundary movement is signed recovery.

## Performance and safety

Retain owner/session cache, financial TTL 30s/reference TTL 120s, 225ms search
debounce and lazy provenance/refund support. Add resource dependencies rather than
global invalidation. Synthetic QA only; no deletion/reset of real financial data.
Reference images guide composition; text supersedes stale account tables, negative
loan accounts, generic transaction creation/bulk selection and old loan splits.

Account notes are optional versioned metadata. The account-history response is account-scoped and returns at most the latest 50 rows with its total; opening/reconciliation facts are visible in history but excluded from inflow/outflow statistics. Confirmed loan interest/fees also feed the existing Bookkeeping expense projection without exposing principal as consumption.
