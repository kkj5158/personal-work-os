# MONEY Review V2 — 2026-11-15

Authoritative task: owner-pasted request and explicitly designated ZIP `prompt/MONEY_SYS_REVIEW_AUTOMATION_INLINE_PROD_IMPLEMENTATION_20261115.md`. Older handoffs and HTML are reference only. Global policy read from Drive `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU`, modified 2026-10-25. Browser policy: laptop dedicated TEAM KAFKA profile only.

Baseline observed before editing: origin/dev `92c2e7a08e22927eee614f95f7b75927e2690f81`; origin/prod and successful Web/API `3688d67b611f8dfd58cf3c4654455170180e17fd`. Railway environments had no staged changes. Older `c9240a2` is an ancestor, not the current deployment. Unrelated main-checkout changes and active worktrees are preserved.

| Surface | Decision | Reason |
|---|---|---|
| Command outcomes, owner advisory lock, source uniqueness | KEEP | Existing durable retry and transactional boundary |
| Financial editor, canonical loan allocation/refund/savings services | KEEP / reuse | Existing financial contracts remain authoritative |
| Parser → scheduled matcher → posting | MODIFY | Admit safe unknown meaning as UNRESOLVED after existing wait; archive is detection-only |
| Owner financial review | MODIFY | Add optional complete decision; commit corrections/type/source pair in one transaction |
| Review table | MODIFY | Full-width expanded row; inline decision/impact preview |
| Batch preview/request/results | KEEP / MODIFY | Independent ordinary eligibility only; special rows go to inline decision; recover original outcome |
| DEFER / REOPEN | KEEP wire compatibility | Present as exclusion/restore of review obligation; never transaction.excluded |
| Historical migrations | KEEP | No rewriting applied migrations |
| Production bulk backfill/reinterpretation | DEFER | No authorization to rewrite existing financial data |

Safety: immutable raw/parse evidence; audited explicit corrections; tenant isolation; authoritative versions and evidence fingerprints; one canonical cash effect per source; archived partner requires explicit approval; no subtype inferred from free text; unresolved cash moves balances but not confirmed income/consumption/savings/loan/refund aggregates. Loan split and refund cap use existing services. Any failed financial operation rolls back the entire review command. PROD requires all mandatory finance and DEV gates.
