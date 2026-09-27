# MONEY Web Phase 1 request cache

Phase 1 foundation retained by Phase 2. This contract covers request reuse and session isolation; additive financial persistence is documented in money-financial-core.md. No Android changes or production promotion.

The MONEY layout owns a memory-only cache across MONEY route transitions. Leaving the layout releases it. In authenticated builds it remains empty until the existing Supabase session resolves. Identity is owner + Supabase session_id; token refresh preserves the same session. Logout, owner/login-session replacement and unmount clear entries and remount editor descendants. A late initial auth read cannot undo logout. DEV retains its existing fixed-owner profile. No token or response is written to storage.

Canonical keys sort query parameters. Same-key concurrent reads share a promise. Errors are recoverable on remount, another load or explicit refresh. Entry identity prevents an older request from overwriting refresh/invalidation or another owner's data. Retention is bounded to 128 inactive/active entries where inactive settled entries are evictable; active and pending entries are protected.

Financial projections expire after 30 seconds; account/category/rule references after 120 seconds. Visible resources revalidate on expiration and focus/visibility checks. Previous same-key data may remain visible with an updating indicator during refresh; failed refresh removes data and shows the error. New query keys never display a previous query's results. Explicit refresh invalidates all MONEY resources. Off-screen expired resources are fetched when requested. Selected editor form state is preserved during background refresh; server optimistic versions still reject conflicting saves.

## Mutation dependency matrix

| Mutation | Invalidated | Retained references |
|---|---|---|
| Transaction create/update/exclude; amount/type/time/source/destination/merchant/title/category/memo/refund link | All transaction lists/details/corrections, both Bookkeeping views/details, Overview/Flow, account balances/details, loan lists/repayment histories, Review, connection status | accounts, categories, rules |
| Bookkeeping sparse override or reset | Both Bookkeeping lists/summaries/details | ledger, Overview, balances and all references |
| Account create/edit/archive/role/inclusion/checkpoint | accounts, account details, transactions, Bookkeeping, Overview/Flow, balances, Review/raw notification interpretation, connection status | categories, rules, loans |
| Loan create/update/delete | loans/repayment history and Overview/Flow | accounts, categories, rules, ledger |
| Category create/update/archive | categories, Bookkeeping, Overview/Flow, rules | accounts, loans, ledger facts |
| Rule create/update/delete | rules (current contract applies to future transactions) | current ledger/projections, accounts, categories |
| Review approve/edit/defer/reject | Review, notifications/attempts, transactions/details/corrections, Bookkeeping, Overview, balances/account details, connection status | accounts, categories, rules, loans |

Financial dependencies are intentionally conservative within each family. For example memo-only corrections retain unrelated references, but still refresh ledger-derived projections because inheritance/search changes. Review defer/reject conservatively share the approval matrix. Bookkeeping meaning does not affect current ledger-based Overview. Returned entities are not patched into aggregate/query pages: revalidation preserves server filtering, order, pagination and totals. Existing panels close after successful saves.

Bookkeeping commits search plus offset zero together after 225 ms. Expense and income share the behavior. Clearing coalesces identically; period/kind/excluded-filter changes reset pagination. Resource-key isolation prevents slow old responses replacing newer rows/totals. Debouncing avoids obsolete requests; browser abort is not relied upon.

Refund candidates load only for a Transaction REFUND form, including switching type or using the linked-refund action. Ordinary INCOME/EXPENSE/TRANSFER panels have no support fetch. System information remains collapsed/lazy. No docked panel redesign.

Validation: focused cache/session/matrix tests plus existing MONEY tests. Managed money-performance suite uses an isolated 2,000-transaction fixture and three comparable browser samples, request counts, authoritative search rows/totals, delayed-response race, lazy refund and dirty close guards. Existing money-web-v1-1 Central QA remains the regression gate. Timing targets are reported rather than hard-coded into tests. No production latency claims.

Phase 2 keeps period/filter view state in the same session boundary (memory only). New flow, repayment, special financial detail and calculated-balance resources use the 30-second financial TTL. Balance creation uses the account mutation family; payment writes use transaction dependencies. Independent main-view requests start alongside references, but labels and forms wait for their required references.
