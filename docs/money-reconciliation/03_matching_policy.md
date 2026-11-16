# Matching and financial policy

Source identity: original file SHA-256 plus normalized fingerprint. Normalization
removes layout whitespace and digit ambiguity immediately adjacent to redacted
account-number boundaries; the encrypted original and exact file hash stay intact. Row identity
has statement/page/original bank row number. Cash identity hashes owner-bound
account, bank occurrence seconds, direction, exact amount and bank after balance;
filenames and statement-relative row numbers are not cash identities. A unique
owner/account/cash-key claim prevents parallel/overlapping imports from posting
the same movement twice. Multiple source files may corroborate one effect.

Matching is deterministic. All candidates require owner, account side, KRW,
direction, exact amount and <=90 seconds. Source-backed confirmation additionally
requires notification after balance and account resolution, or comparable bank
merchant text. Score: immutable statement claim 100; matching notification
linked to fact 98; canonical confirmed owned transfer path 92; matching merchant
90; time+amount-only 60 (not confirmed). Select a unique highest qualified score;
a tie at that score or only non-confirmed candidates is AMBIGUOUS. A source
already linked to a mismatched fact is SOURCE_NEEDS_ACCOUNT_RESOLUTION, never a
new cash admission. No semantic confidence is inferred from an amount match.

DEFERRED_ALREADY_BOOKED attaches supporting evidence without a new effect and
preserves the source hold. NON_TRANSACTION events lacking verified parsed
movement evidence do not become statement cash. Ordinary notifications and
SOURCE_STATEMENT remain distinct; never forge Android payloads for imports.

Bank-PDF headers, totals, all sequential row numbers, reverse chronological order,
date range, final balance and every running-balance transition must validate.
Bank seconds are KST, converted to UTC Instants; notification minute precision
allows bounded comparison but does not rewrite occurrence time. Unknown values
remain unknown. Statement opening/final observations are independent of current
ledger anchors, and do not silently replace them. Observations at different
times cannot prove zero residual across accounts.

New verified cash remains UNRESOLVED until a separate evidenced meaning decision.
Loan wording -> LOAN_ALLOCATION_PENDING; savings/product wording ->
TRANSFER_PENDING_COUNTERACCOUNT; wallet top-up/self route ->
COUNTERPARTY_UNRESOLVED. Recognize bank cash without inventing loan principal,
interest, fee or receiver. Merchant wording is only LIKELY_EXPENSE. Existing
canonical commands perform actual financial confirmation/refund allocation.
Owned transfer endpoints must be real owner accounts. Endpoint completion fills
one missing cash leg on the existing opposite-side fact, never another inbound.
Overdraft cash, principal outstanding and loan interest remain distinct.

Every batch has an exact durable preview, full source/account/ledger snapshot,
expiry and fresh owner approval. Owner advisory lock plus unique cash claim and
durable original request replay serialize execution. Unknown outcomes are read
before retry. Atomic policy avoids unsafe partial linked-transfer/loan execution.
Preserve source amounts/times, archived records, protected owner metadata and
all audit history. No arithmetic balancing entries/checkpoints are permitted.

Preview balances use canonical ledger reconciliation, separately from the latest
bank display/observation. Historical bank cash before the existing ledger anchor
has a cashMovementDelta but no current-ledger delta. Dry-run output reports both
and preserves unknown ledger amounts as null. Policy changes invalidate previews.
