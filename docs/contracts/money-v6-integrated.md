# MONEY V6 — owner review, direct classification Save, registration lifecycle

## Scope and canonical identity
V6 retains the four KPI cards, three donuts, eight-column Bookkeeping ledger, anchored two-column category picker and four-stage AI workbench. Korean menu headings and the workbench registration-cancellation tab extend the existing UI. Foreign currency, savings, loan and gross/net policies are unchanged.

Cancellation sets the existing owned canonical money_transactions.excluded flag and increments its version. Restore clears it on the same transaction ID. Immutable raw notifications, transaction sources, classification events, recommendations and choices remain. A TRANSFER is one canonical fact containing both account directions; merged source legs cannot be independently restored. Completed Review decisions advance their referenced transaction version without reopening the original item.

## Guarded commands
- GET /api/money/review/owner/{rawId} returns trusted parser originals, a bounded financial graph fingerprint and eligible duplicate facts. POST explicitly selects REGISTER, TRANSFER or LINK_DUPLICATE with original requestId, fingerprint and current account/target versions. Original bank package, parser shape/version, source uniqueness, original currency/time/amount and owned active accounts remain mandatory. Over 500 surrounding facts/raws fails closed. Refund, loan and balance subtype corrections retain their dedicated paths.
- POST /api/money/ai/classification/recommendations/save directly saves eligible manual selections or AI drafts, after final category/dictionary/transaction/stamp/context/draft/owner checks. Each item independently commits. Ordinary UI does not call save-preview; filtered financial Review retains immutable server preview and confirmation. Candidate adoption is unconfirmed; only explicit successful Save creates classification feedback.
- GET /api/money/registration/{id}/context supplies loan context; POST /cancel or /restore requires requestId and displayed expectedVersion. Loan actions additionally require expectedLoanVersion. Restore requires the original cancellationId and unchanged canceled version. Command outcomes preserve request ID and payload hash.
- GET /api/money/registration/cancelled uses original transaction date in Asia/Seoul, search, account/category filters and 50-item pages. Effective title/memo/category at cancellation are retained in append-only cancellation evidence, including explicit nulls. GET /registration/{id}/history retains operation lineage.
- GET/PUT /api/money/ai/classification/recommendations/selection persists up to 10,000 distinct owned transaction IDs under the four allowlisted mode/kind scopes. Selection remains independent of page/date/filter.

## Financial dependencies
Active refunds must be canceled before their original expense. Restore the expense first; refund currency and remaining refundable amount are revalidated. Loan cancellation adds principal back and restoration subtracts it atomically with current loan version; negative remaining principal and invalid loan statuses fail closed. INITIAL_BALANCE and BALANCE_ADJUSTMENT cannot use this lifecycle. AI results returning after cancellation remain unconfirmed/protected, retain actual provider usage, and never learn automatically. Restoration requires explicit AI activity; existing valid classification remains.

## Migration and compatibility
V83 adds owner-scoped durable selections with a composite owned-transaction foreign key and RLS enabled. It relaxes only the prior LOAN_PAYMENT prohibition on excluded=true while retaining loan identity, splits, sum and balance-anchor financial constraints. It rewrites no existing rows. Applied migration checksums are immutable. Old readers already omit excluded facts; rollback the application without dropping history or selection data. Reintroducing the old loan exclusion constraint requires all canceled loan payments to be safely restored first.

## Refresh and performance boundaries
Verified authoritative BookRow responses patch loaded matching rows, then invalidate related Bookkeeping/monthly/statistical resources. Accounts, category dictionaries and tracking settings are not indiscriminately refreshed. Poll only the current run/activity and stop at terminal completion. PERF01 batched draft reads and PERF02 overlap summary statuses remain; READY is never Save authorization. PERF03 reuses verified reads only within the same owner-locked item transaction. PERF05 retains independent financial commits and actual owner locks.

## Verification evidence
Use the five MONEY_V6_*_KO reports and V6_TRACEABILITY_MATRIX_KO in the 20261013 V6 audit bundle for measured SQL, backend/API/native-browser coverage and actual release status. A synthetic HTML simulation or loopback dev authentication stub is not hosted DEV acceptance. Mandatory native authenticated DEV and backup/restore gates must pass before PROD promotion.
