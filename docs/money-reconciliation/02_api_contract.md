# Reconciliation contract v1

All routes: /api/orbit/money/v1/recon. Native owner ES256 JWT or existing
delegated OAuth + signed broker request entitlement is required. GET requires
orbit:read; every POST requires orbit:read and orbit:write:money, including
private intake and analysis. Closed exact tool schemas/OpenAPI are generated
from integrations/orbit-mcp/money-tools.mjs using scripts/orbit-money-contract.mjs.

Intake: POST intake-start {accountId,provider:IBK,format:PDF|CSV|XLSX,sha256,
byteLength}. Returns owner-bound uploadId and one-hour expiry. POST intake-chunk
{uploadId,index,base64}: contiguous zero-based chunks <=30000 bytes each; identical
chunk replay succeeds, different bytes conflict. POST import-preview {uploadId}
verifies hash, length, parser and continuity and persists encrypted original
evidence and immutable rows. No file path, model-selected remote URL, original
source download or account-balance write is exposed. Max 2 MB, 2000 rows,
40 intakes/day/owner. Encryption requires MONEY_RECON_SOURCE_KEY (32-byte base64
AES key); fail closed if unavailable. Preserve this key during redeployments.
Expired uploads remain private retained evidence; no unapproved deletion job.

Read: capabilities, statements (accountId optional), statement/rows/observation
(id=statementId), status (id=runId), candidate (id=rowId), history. Pagination
limit 1-50 and offset 0-10000. POST analyze {statementId} persists runId, current
owner/account/ledger/source snapshot and ranked candidates, without cash writes.

POST batch-preview {runId,items:[{rowId,action,...}]} accepts 1-50 exact unique
row IDs. REGISTER_CASH has no editable amount/time/type and recognizes canonical
cash with UNRESOLVED meaning. REGISTER_TRANSFER_RAW reuses the canonical Review V2 paired-source financial
decision with rawId, partnerId and otherAccountId; both original sources become
one transfer and each endpoint appears once. LINK_SOURCE requires exact matched transactionId
and expectedVersion and adds no cash. COMPLETE_TRANSFER requires owner-confirmed
endpoint evidence reason, existing opposite-side transactionId and expectedVersion;
it fills the missing endpoint on that original fact once. SET_MEANING delegates
EXPENSE/INCOME/REFUND/LOAN_PAYMENT with evidence, original-refund version or actual
loanId/version and exact principal+interest+fee to canonical financial commands.
Existing paired-RAW and paired-ledger transfer tools remain available unchanged.

Preview returns previewId, fingerprint, expiry, immutable targets, individual
cash impacts, canonical dry-run statistics before/after and per-account
before/delta/predictedAfter. It is APPROVAL_REQUIRED.
POST batch-execute {previewId,fingerprint,requestId,confirmed:true} is permitted
ONLY after the owner approves that exact fresh preview. Atomic execution checks
expiry, full account/ledger/raw/effect snapshot and canonical validation; no
target expansion, partial retry or hidden skip. The 10-minute preview expires.
NOT_APPLIED means no batch cash effects committed. UNKNOWN means recover using
money_get_operation_outcome and the original requestId; never create a new retry
request. Receipts and meaning audits preserve exact row/transaction/request IDs.

CSV/XLSX support the documented normalized IBK columns
no,time,out,inc,balance,desc,page. They validate continuity but cannot prove bank
header/totals authenticity. Their normalized fingerprint must be corroborated
by an imported bank PDF before posting. Formula/macro/DTD/ZIP expansion, encrypted
PDF, scans and unsupported layouts fail closed. Additional providers require
explicit adapters. There is no OCR or existing antivirus integration to reuse.

Recovery: immutable source/effect history is never deleted. Correct existing
financial meaning with current canonical guarded previews; transfer unlink/undo
uses existing canonical history/version checks. No general ledger delete/amount/
time/balance-adjustment tool or automatic source deletion is added.
