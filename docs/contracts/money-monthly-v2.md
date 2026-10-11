# MONEY monthly savings read contract

`GET /api/money/bookkeeping/savings?from=YYYY-MM-DD&to=YYYY-MM-DD`
returns `totals`, `items`, and `total`. Dates are inclusive Seoul calendar dates.
Optional `destinationAccountId`, `search`, `limit` (1–200), and `offset` affect
only the deposit rows and their count. The UI requests 50 rows per page.

Savings is a read projection of non-excluded, non-merged canonical `TRANSFER`
records between two owner accounts. Source observations are not joined, so
multiple notifications for one transfer cannot multiply contributions. At each
transaction's occurrence time, both endpoint groups come from the latest
`money_account_fund_group_history.effective_at` at or before that instant.

`gross` is LIVING/OTHER → SAVINGS deposits. `withdrawals` is SAVINGS →
LIVING/OTHER withdrawals. `net = gross - withdrawals` may be negative.
SAVINGS → SAVINGS and general → general transfers contribute zero. External
income/expense, balances, refund matching, savings purposes, and withdrawal
return links are outside this projection.

`composition` groups gross deposits by destination account. Unknown historical
groups or any non-KRW boundary transfer make aggregate amounts unavailable
(`null`) and composition empty; deposit rows retain their currency. No current
account group fallback or currency conversion is performed. The historical
baseline migration freezes the existing classification at V2 rollout; subsequent
group changes affect transactions occurring at or after their effective instant.

Monthly income/expense totals and category composition reuse the existing
bookkeeping/tracking contract without table filters. Chart selections affect
only the lower table, and chart centers always show their month totals.
