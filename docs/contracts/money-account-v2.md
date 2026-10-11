# MONEY V2 account management

Owner-approved decisions 009 and 016–033 (2026-10-11, Asia/Seoul).

Accounts use the persisted `fundGroup` to display 생활비 → 저축·적금 → 기타.
Within each group the API's existing order remains intact. Structural role,
savings subtype, tracking, assets, statistics and overview representatives
remain independent. AccountIcon continues to render the persisted emoji/image.
One-field account updates carry the latest expected version and preserve all
unrelated identity and presentation metadata. A failed save retains the draft;
the UI must receive server acknowledgement before showing completion.

V80 adds `money_account_fund_group_history`. Existing account groups receive a
`-infinity` baseline that freezes the pre-V2 classification. New accounts receive
the same baseline. An account fund-group or subtype change appends the new
classification at the server's `clock_timestamp()`; clients cannot backdate it.
History is append-only through application commands. Historical savings queries
select the latest owner/account history row with `effective_at <= occurred_at`,
including both endpoints of a transfer. A change never rewrites prior rows or
automatically reclassifies prior transactions. A historical reclassification
command is outside this implementation.

`GET /api/money/accounts/{id}/fund-history` returns owner-scoped history newest
first. `effectiveAt: null` represents the baseline; finite times are the exact
server effective times. Existing versioned fund update APIs append through the
database trigger, including mobile callers.

`GET /api/money/accounts/{id}/deletion-eligibility` returns `allowed` and human
readable `reasons`. `POST /api/money/accounts/{id}/delete` requires
`expectedVersion`, acquires the same owner advisory lock as account commands,
locks the row, and rechecks every transaction, checkpoint, funding, loan,
tracking, representative, rule, processing-history and recommendation-scope
reference before deletion. Historical/merged/excluded transactions still block
deletion. Fund changes after creation also block deletion. Only an unreferenced
account may be deleted; its isolated fund history cascades. Ledger records are
never cascaded or deleted. Archive/restore reuse the existing versioned command.

New registration uses the mobile account endpoint to save the independent fund
group alongside required legacy bank identity. Duplicate names or bank hints
within the same provider are rejected under the owner lock, including archived
accounts. New V2 accounts start without tracking or representative membership
and with assets disabled until the owner enables them after registration.
