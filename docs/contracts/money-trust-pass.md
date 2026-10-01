# MONEY Trust Pass — reliability and real-use contract

Source: owner real-use stack 129 (P0 data correctness / P1 repetitive UX) and the Trust Pass brief.
Financial semantics of 30/75/125 and [money-financial-core.md](money-financial-core.md) /
[money-meaning-core.md](money-meaning-core.md) are unchanged; this document describes behaviour added on top.
No Flyway migration: every addition uses existing tables and columns.

Priority order for every decision here: no ledger corruption > trustworthy balances > conservative Review over a
wrong automatic classification > less repetitive work.

## Pipeline

```
raw notification (immutable)
 -> bank parser (unchanged grammars, version 1.0.0)
 -> not parsed? non-transaction gate
      - no transaction evidence  -> PROCESSED / IGNORED_NON_FINANCIAL   (audit only, restorable)
      - looks financial          -> REVIEW_REQUIRED, FORMAT lane
 -> account + transfer matcher 1.2.0 (unchanged, strict)
      - complete unique evidence -> one TRANSFER
      - explicit card payment / payroll after the wait -> EXPENSE / INCOME
      - everything else          -> REVIEW_REQUIRED, DECISION lane
 -> Review (explicit owner decision) -> canonical ledger
```

Automatic matching thresholds were deliberately **not** widened. Wider evidence is used only to *suggest* a pair
to the owner; it never posts a fact.

## Non-transaction gate (`MoneyNoiseFilter`)

Applies only to notifications no parser recognised. Package identity never proves a transaction. A text is
`NON_FINANCIAL` when any of these hold:

1. it starts with the legal advertising marker `(광고)` / `[광고]` (title or body);
2. it contains no amount token (`<digits>원`);
3. it contains promotion wording and no transaction wording (입금, 출금, 이체, 결제, 승인, 취소, 환불, 송금, 잔액, 납부, 인출, 충전).

Anything else stays a financial candidate. All verified bank shapes are regression-tested as candidates.
Ignored notifications keep their raw row and parse attempt, never reach the ledger, are listed by
`GET /review/ignored` and can be returned to Review with `POST /notifications/{id}/restore`
(only when no ledger source references them). Existing Review items are never reclassified automatically;
the owner can bulk-ignore them (`POST /review/ignore`, 1–100 versioned items, reason `USER_IGNORED_NON_FINANCIAL`).

## Review lanes

`GET /review/queue?lane=DECISION|FORMAT` (omitted = both; response adds `lane`, `lanes` open counts,
`transferPartnerId`, `transferCandidates`, `noiseSuspected`).

| Lane | Content | Counted in the Review badge |
|---|---|---|
| DECISION | transfer/account/unmatched decisions, possible internal transfers, refund link, loan split, category confirmation, restored items | yes |
| FORMAT | `UNRECOGNIZED_SHAPE`, `UNSUPPORTED`, `PARSER_ERROR`, `MISSING_PARSE_ATTEMPT`, `INCOMPLETE_CANDIDATE` | no (own tab count) |
| ignored (separate list) | `IGNORED_NON_FINANCIAL`, `USER_IGNORED_NON_FINANCIAL`, `USER_EXCLUDED` without ledger links | no |

`noiseSuspected` is computed for FORMAT rows on the returned page only; raw bodies are never part of the queue
response. The UI shows plain-language reasons and a stage list (detection → amount → direction → account →
transfer → reason). Internal codes appear only under System Information.

## Internal transfer correctness

Root cause of real-use contamination: when both sides of an owned transfer lacked automatic evidence, each
notification was confirmed alone in Review and defaulted to EXPENSE (OUT) and INCOME (IN).

* **Unposted pairs.** Two Review notifications with equal amount, opposite direction and Android post times
  within 600 s are a suggestion when each is the other's only candidate (`transferPartnerId`). The panel
  confirms both as one TRANSFER through the existing `POST /review/confirm` with two `rawIds`.
* **Server guard.** Two raw sources with opposite parsed directions can only be confirmed as `TRANSFER` with the
  parsed amount; any other type is rejected. A single-source confirmation that has a candidate shows a warning.
* **Posted pairs.** An included EXPENSE and INCOME on different owned accounts, same amount and currency,
  within 600 s, each other's only candidate, without refund links, appear as `POSSIBLE_INTERNAL_TRANSFER`.
  "Link" uses the existing `link-transfer` operation (correction history and both source sets preserved).
  "Not a transfer" (`POST /review/transfer-pairs/dismiss`) appends `TRANSFER_PAIR_DISMISSED` to the meaning
  audit for both rows; the ledger is unchanged and the suggestion does not return.
* Ambiguous candidates (more than one) are never suggested as a pair. Historical data is not rewritten by
  migration; repair is one explicit, audited owner action per pair.

Alternatives rejected: widening the automatic 10 s / 90 s window (false-positive risk on real money),
a `PENDING` ledger state (schema and every projection would change), automatic historical relinking.

## Balance evidence and reconciliation

* A balance change is ordered by the **account's own observation time**: the post time of that account's bank
  notification when present, otherwise the ledger time. Minute-precision provider times previously could
  place a same-minute fact before a notification balance anchor.
* Sources confirmed in Review keep their parse attempt, so their bank-reported post-balance is balance
  evidence for the account the owner confirmed (only when the hint resolves to one of the fact's accounts).
* `GET /reconciliation` (read-only) returns per account: latest verified balance (`observedBalance`, `observedAt`,
  `observedSource` NOTIFICATION | MANUAL), ledger-only balance at that time (`ledgerBalance`), `difference`,
  the anchor (`basis` MANUAL = latest owner-verified checkpoint before the observation, else
  FIRST_NOTIFICATION; `basisAt`, `basisAmount`), the displayed balance and `hasInitialBalance`.

| Status | Meaning |
|---|---|
| MATCHED | ledger explains the bank balance exactly |
| MISMATCH | a fact is missing/duplicated between anchor and observation |
| ANCHORED | the latest verified balance is the owner's own checkpoint |
| UNVERIFIABLE | one observation and no anchor; register an opening balance |
| NO_OBSERVATION | no verified balance at all |

* `POST /accounts/{id}/reconcile` `{observedAt, observedBalance, expectedLedgerBalance, note, expectedVersion}`
  accepts the bank balance: it appends a checkpoint and a `BALANCE_ADJUSTMENT` whose `calculated_balance` is the
  ledger-only value and whose amount is the difference. Stale inputs are rejected (409). Only allowed for
  MISMATCH. `BALANCE_ADJUSTMENT` and `INITIAL_BALANCE` remain excluded from income, consumption and savings.
* Review diagnostics list the same MISMATCH rows. A difference is never hidden automatically.

## Opening balance lifecycle

* `PUT /accounts/{id}/initial-balance` replaces the opening balance (remove + recreate in one transaction).
* `POST /accounts/{id}/initial-balance/remove` unsets it. The account, later facts and later checkpoints are
  untouched; the account returns to "opening balance unknown".
* Both append a full snapshot (`INITIAL_BALANCE_REMOVED` / `INITIAL_BALANCE_REPLACED`) to the meaning audit
  with the account as subject before deleting the opening row and its checkpoint. Refused when correction
  history references the row. Account optimistic version is required.

## Archived accounts

* Hidden by default on Accounts ("보관 계좌 보기" toggle), in ledger/Review account filters and in every
  new-fact account picker.
* A historical fact keeps and displays its archived account; editing it is allowed while the account
  reference is unchanged. New facts, or moving a fact onto an archived account, are rejected. The same rule
  applies to correcting an existing loan repayment.

## Category kind

Transaction and Review forms use the shared searchable picker restricted to the dictionary of the fact type
(INCOME → income, EXPENSE/REFUND → expense). Changing the type clears an incompatible category.

## 가계부 editing

* Detail panel autosaves sparse overrides: text debounced 700 ms and flushed on blur, selections immediate.
  One request is in flight at a time and the newest value is always sent afterwards, so an older response
  cannot overwrite a newer edit. A failed save keeps the typed value, blocks leaving until retried
  ("다시 저장") or reloaded from the server, and is the only state treated as unsaved.
* Title, memo and category are editable in the table (Enter save, Escape cancel, Tab / Shift+Tab save and move).
  The row open in the panel is read-only in the table to avoid two editors on one version.
* Ledger amount, accounts, type and time are not inline-editable; bookkeeping overrides never change the
  canonical transaction.
* Review and 가계부 keep a docked panel column on desktop (≥1151 px) with an idle placeholder, so selection and
  saves never reflow the list. After a Review decision the next row is selected.

## Validation

`MoneyTrustPassPostgresTest` (isolated schema, rolled-back synthetic owner), `MoneyNoiseFilterTest`,
frontend `autosave.test.ts` / `review.test.ts`, managed suites `money-trust` (full acceptance) and
`money-trust-focused`. See the iteration closeout for exact results.
