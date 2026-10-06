# MONEY Web revision contract

2026-10-06 통합 개정: [MONEY 통합 웹 계약](money-integrated-web-20261006.md)의 승인된 공통 조회·배치·분류·복구·대화 규약을 함께 적용합니다. 기존 금융 사실 및 보존 화면 계약은 유지합니다.

Owner approved A1, A2 and A3 on 2026-10-04. This additive contract extends the existing MONEY financial, meaning, category and AI contracts. It does not change the ledger meaning of transfers, refunds, checkpoints or confirmed loan splits.

## Categories and icons

V71 adds owner-scoped `money_category_groups`, an optional root `structural_group_id`, typed category icons, and independent overview preferences. It creates no default groups and does not reassign existing categories. Existing category IDs, parent IDs and the persisted two-depth guard remain unchanged. Conceptual L1 is presentation metadata; existing roots are L2 and children L3. Both existing roots and children remain valid final transaction assignments. An unmapped root, or a root mapped to an archived presentation group, belongs in the UI fallback group. Archiving a structural group never archives its financial categories.

`GET /api/money/categories` adds `structuralGroupId`, `iconType`, `iconValue`. Existing `emoji` remains supported. Typed writes add `iconType` and `iconValue` to the existing category input. Legacy emoji values read as `EMOJI`; typed `EMOJI` writes synchronize legacy `emoji`. `ICON` values must be one of the bundled internal IDs. External URLs, unknown IDs and `ASSET` writes are rejected. The future asset seam has no upload lifecycle in this revision.

`GET/POST /api/money/category-groups`, `PUT /category-groups/{id}` expose `{id,name,kind,sortOrder,version,archived,iconType,iconValue}`. Input includes `expectedVersion` for edits. Group kind is immutable. `PUT /category-groups/order` takes `{ids,versions}` and includes each group of one kind exactly once. `PUT /categories/{rootId}/group` takes `{groupId,expectedVersion}`; null clears a mapping. A non-null mapping must target an owned active group of the same kind. Child mapping is rejected. These operations record meaning audit entries and do not rewrite financial facts or immutable AI history.

Category filters use a CSV of real IDs, `direct:<rootId>` or `uncategorized`. A plain root expands to its existing root and children; direct root matches only its own ID. Same-stage options use OR. The shared frontend resolves active structural/root/final stages by AND before submitting the resulting category IDs. It removes stale downstream choices when the upstream selection changes. These predicates run on the full server query, with the same predicate used for counts, pages, composition and trends. `accountIds=none` returns no results; omitted category selection imposes no restriction.

## Accounts and overview

`GET /api/money/accounts` adds `fundGroup`, `savingsSubtype`, `fundOrder`. `PUT /accounts/{id}/fund` takes the existing mobile `FundInput` `{fundGroup,savingsSubtype,expectedVersion}` and delegates to the canonical mobile fund service. It returns the existing `FundAccount` wrapper. Changing fund composition never automatically changes role, tracking or representative settings. Web role-group order continues to use account API order; fund order is a separate axis.

`GET/PUT /api/money/overview/preferences` returns `{accountIds,version}`. PUT accepts `{accountIds,expectedVersion}`. IDs are unique, owner-scoped, explicitly ordered and limited to ten. New selections must be active; previously selected archived accounts can remain until the owner removes them. No tracking preference is read or modified by this endpoint. Absent preferences are empty with version zero.

`GET /api/money/overview/current-stock` is independent of the selected analytics period and returns:

- `asOf`: current query time.
- `currencies`: rows `{currency,currentTotal,currentBalance,currentSavings,totalLoans,includedAssets,unknownBalanceCount}`.
- `scopes`: machine-readable inclusion definitions.
- `hasUnsupportedCurrencies`, `unsupportedCurrencyAccountIds`.

Current Total is existing included assets, including archived accounts, minus active confirmed loan principal. Current Balance is active included LIVING balances. Current Savings is active included SAVINGS balances. Total Loans is active confirmed principal. These scopes need not reconcile to one another. Account balance values reuse the canonical checkpoint/notification/effective-time ledger engine.

Account/checkpoint/loan currency is not persisted in the existing schema and their canonical basis is KRW. A non-KRW ledger fact makes its account's anchored stock calculation unsupported; it is omitted from the KRW valid-account subtotal and identified explicitly. Consumers must show a currency warning instead of presenting that subtotal as a complete stock total. No FX conversion is inferred. Period Overview and Bookkeeping return `currencies`, `hasMixedCurrencies`, `analyticsUnavailable`; any non-KRW fact disables their KRW analytics. Bookkeeping retains original item currency and pagination while its total becomes null and charts empty.

`GET /api/money/overview/spending-pace?from=&to=` returns `from,to,comparisonFrom,comparisonTo,asOf,current,previous,delta,buckets,unresolvedLoanPayments,currencies,hasMixedCurrencies,analyticsUnavailable`. Bucket `day` is a one-based elapsed day integer; `date` is a Seoul calendar date and current/previous are cumulative signed consumption. Full calendar-month selections compare the preceding month at the same elapsed day, clamped to that month's final day. Other selections compare an equal-length immediately preceding window at the same elapsed days. Current days are capped at today. Refunds reduce consumption; confirmed interest and fees are consumption; unresolved split payments remain explicit provisional metadata. Foreign-currency comparison windows disable analytics.

Ledger and Bookkeeping support server `minAmount` and `maxAmount`. Custom bounds are nonnegative KRW integers, both inclusive, and minimum cannot exceed maximum. For approved presets `[0,10000)` and `[10000,50000)`, clients send maximum 9999 or 49999. Refund magnitudes are filtered as positive amounts while their consumption contribution remains signed.

## Posted non-transaction review

`POST /api/money/review/non-transaction/preview` takes `{recordType:'TRANSACTION',recordId,expectedVersion,expectedOverrideVersion,expectedProjectionVersion}`. It returns `{fingerprint,accountImpacts:[{accountId,beforeBalance,afterBalance,delta,currency}],statisticsImpact:{incomeDelta,consumptionDelta},warnings,canConfirm}`. This read-only simulation invokes the exact canonical balance model while excluding the candidate fact and its notification anchors. A later checkpoint can therefore produce zero current balance impact. Linked refunds and unsupported currency prevent confirmation.

Posted `/api/money/ai/decisions` action `NON_TRANSACTION` now requires a nonblank `reason` and `impactFingerprint`. The server recomputes the preview under the existing owner money lock and rejects stale impact or versions before the audited correction. RAW ignore/restore behavior is unchanged. Ordinary Bookkeeping saves remain audit-only; only valid AI `CONFIRM` events are positive learning evidence. Existing AI undo/version, financial correction, transfer/refund and reconciliation guards remain in force.

## Validation ownership

`MoneyWebRevisionTest` exercises stock scopes, representative bounds, typed icons, amount bounds and period alignment without a database. `MoneyWebRevisionPostgresTest` validates V71 in a rolled-back isolated schema, root mapping/history compatibility, preference/tracking independence, full-query page/aggregate boundaries and later-checkpoint impact. Integration/QA owns migration application and execution of DB-enabled tests on the centrally managed runtime.
