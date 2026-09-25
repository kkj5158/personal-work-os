# MONEY SYS Batch 3 product contract

Implementation on `codex/money-sys-batch3`; deployment status is recorded separately in [the checkpoint](money-sys-batch3-closeout.md). This contract does not certify runtime or production readiness.

## Storage and ownership

`V55__money_v1_product.sql` was assigned after refreshing `origin/dev` and inspecting shared DEV history: V51 Checklist, V52 absent, V53 Diet, V54 MONEY. V55 was free. The migration adds product fields to existing accounts/transactions plus owner-scoped categories, explicit category rules, balance checkpoints, and correction history. Existing migrations are unchanged. No actual user accounts or notifications are seeded.

All product reads and writes use the authenticated/configured owner. Mutations take the same per-owner transaction advisory lock used by automatic processing. Existing version checks extend to accounts, transactions, categories, rules, and review actions. Production authentication is unchanged; DEV remains its existing configured-owner profile. No new ingest endpoint or shared production secret is introduced.

## Product behavior

- Accounts: CRUD/archive, provider and resolver identity, alias, emoji or bounded raster data image, optional funding account, cycle prevention, and balance checkpoints. Cash uses provider/role CASH and has no bank identity.
- Roles retain existing values and add fixed spending, liquid purpose savings, and purpose installment. These roles describe structure; they do not prohibit legitimate spending or transfers. All active purpose accounts remain visible in their appropriate grid. Actual monthly transfers are separate from the structural diagram.
- One canonical transaction represents a transfer. Manual income, expense, transfer, and refund support memo, category, account correction, versioned editing, and exclusion. Raw events and parse attempts are never editable through these APIs.
- Refunds offset consumption, never income. An optional linked original expense supplies category; included partial refunds cannot exceed its included amount or precede it. Changing the expense category synchronizes linked refunds with their own correction/version records. Resolve refund links before changing/excluding the original expense incompatibly.
- Explicit merchant rules match normalized, trimmed, case-insensitive exact counterparty text. Only a user's rule action creates a permanent rule. Rules apply to newly saved/posting expenses; a category correction alone does not create a rule or rewrite posted history.
- Monthly income excludes transfers/refunds. Consumption is expenses minus refunds. Savings movement counts net transfers across the boundary of final savings roles, excluding intermediate gateway hops and movement between final savings accounts. Account inflow/outflow includes internal transfers.
- Balance uses the latest manual checkpoint or a successfully posted, account-resolved notification balance, then later ledger deltas. Provenance identifies notification, manual, or calculation origin. No fake income/expense is inserted. A discrepancy against a previous manual checkpoint is surfaced for review; a new checkpoint preserves the earlier history.
- Review exposes unresolved raw evidence, uncategorized expenses, and balance discrepancies. Explicit confirmation can assign accounts and interpretation with one or two raw sources. Reprocess is restricted to eligible unposted evidence. Exclusion marks a raw event deliberately excluded. Ambiguity remains unresolved until the user acts.
- Transfer linking preserves both source sets and an append-only prior-state snapshot, excludes the merged row, and leaves one included transfer. Unlinking produces expense and income. Independent IN sources move only if separate OUT evidence remains; a single/combined notification stays with the original row and the new manual side refers to its correction. Source associations before correction remain in audit history.
- Parser versions remain `1.0.0`. Matcher `1.1.0` extends existing savings-route role compatibility to the new purpose roles; it does not widen bank-format recognition or ambiguity rules.

## API additions

All routes extend `/api/money`; existing raw notification ingest and idempotency remain unchanged.

| Routes | Contract |
| --- | --- |
| GET `/dashboard?month=YYYY-MM`, `/account-balances`, `/accounts/{id}/detail?month=YYYY-MM` | Owner aggregates, balance provenance, account flow/checkpoint detail |
| POST `/accounts/{id}/balance-checkpoints` | Amount, verifiedAt, note, expectedVersion; append-only checkpoint |
| GET/POST `/categories`, POST `/categories/defaults`, PUT `/categories/{id}` | One-level category setup, editing/archive, versions |
| GET/POST `/category-rules`, PUT/DELETE `/category-rules/{id}` | Explicit exact merchant rules; expectedVersion on modification/deletion |
| GET `/transactions` | **Response changes from array to `{items,total}`**; from/to KST dates, accountId, categoryId, type, search, includeExcluded, uncategorized, limit/offset |
| POST `/transactions`, PUT `/transactions/{id}` | Canonical manual creation/correction; expectedVersion on update |
| GET `/transactions/{id}/corrections` | Read-only prior ledger/source snapshots |
| POST `/transactions/{id}/link-transfer`, `/transactions/{id}/unlink-transfer` | Explicit versioned transfer corrections |
| GET `/review`, POST `/review/confirm` | Review queues and explicit version-checked interpretation |
| POST `/notifications/{id}/exclude`, `/notifications/{id}/reprocess` | Deliberate version-checked raw processing actions |
| GET `/connection-status` | Server receipt/backlog information; does not assert phone connectivity |

## Web routes and limits

`/money`, `/money/transactions`, `/money/flow`, `/money/review`, `/money/settings`, and `/money/accounts/{id}` use the shared POS shell. Dashboard category drilldown retains month/category in global tabs. Financial timestamps are displayed and entered in Korea time. Empty initial setup is shown only after a successful load; connection failures have a separate retry state.

The current detail dialogs offer recent eligible transactions (up to 200) for refund/transfer linking. Unknown external bank formats remain review-required under the existing conservative parsers. Image handling is a small square crop/data-image workflow, not an asset-management subsystem. Notification-derived balance is a checkpoint estimate, not a bank reconciliation feed. Server integration status cannot establish that the Android listener is alive.

The installed Android diagnostic POC remains USB/DEV-only and is not changed by this implementation. The Batch 3 resume scope explicitly defers authenticated Android PROD transport to a separate mobile follow-up; it is not a completion gate for MONEY Web V1 deployment. Direct phone-to-PROD ingestion must not be described as operational. No V1+ spending-habit or mobile product expansion is included.
