# WORK QUEUE owner management and MCP v1

The owner console uses `/api/orbit/work-queue/v1/` and the existing ORBIT POS
Streamable HTTP broker. This adds no parallel queue, general SQL/HTTP proxy,
hard-delete API, source-task completion or chat key-issuance operation.

## Authentication and discovery

Reads require `orbit:read`. Writes require a fresh explicit
`orbit:write:work-queue` grant, checked in the broker and a signed 30-second
request entitlement checked by the API. The proof binds the authenticated
upstream owner/client, exact method/path/query/body, active OAuth grant and API
audience. Existing grants are never silently expanded. MONEY and diary scopes
cannot authorize queue writes. Producer/device bearer grants do not authorize
these owner-console routes. Normal POS owner sessions retain their existing
authorization. Responses are private/no-store; source text is untrusted data.

The generated `work-queue-mcp-tools-v1.json` records the closed schemas. New
server discovery, real MCP transport invocation, ChatGPT catalog discovery and
an actual ChatGPT in-chat invocation are separate release evidence states.

## Fixed routes and operations

|Tool|Method / route|
|---|---|
|work_queue_list|GET list|
|work_queue_get_summary|GET summary|
|work_queue_get_item|GET item|
|work_queue_create_item|POST create|
|work_queue_edit_item|POST edit|
|work_queue_move_item|POST move|
|work_queue_hide_item / work_queue_restore_item|POST hide / restore|
|work_queue_preview_bulk_change|POST preview|
|work_queue_execute_bulk_change|POST execute|
|work_queue_get_operation|GET operation|
|work_queue_list_connections|GET connections|
|work_queue_restore_connection / work_queue_revoke_connection|POST restore-connection / revoke-connection|

All writes carry a UUID `requestId`. Repeating the same normalized payload
returns its durable original receipt; changing it under the same request ID
conflicts. `get_operation(requestId, offset, limit)` resolves outcomes without
repeating writes. UNKNOWN never means success or authorization for a new ID.
Bulk receipts retain all outcomes privately and expose at most 100 per page
(50 on initial execution), with outcomeCount, nextOffset and complete.

List filters include NORMAL/HIDDEN view, text, projectId, sourceKind, source,
event, group and KST dates/from/to or an ISO createdBefore exclusive bound.
Cards include compact provenance, exact item/memo revisions and generation;
memo/source bodies require get_item. NORMAL includes OPEN and COMPLETED.
Ordering is createdAt DESC, id DESC. Owner/filter/revision-bound keyset cursors
reject changed feeds rather than silently skipping rows. Global and filtered
totals are separate and read from one repeatable-read snapshot.

Manual create accepts title, optional memo/projectId and HTTPS source metadata.
It cannot create or complete a WorkTask. Edit supports only explicit title/memo
field masks: omitted stays unchanged, memo:null clears, and title cannot be
empty. Item and memo revisions are checked independently. Group transitions
use ACTIVE/DEFERRED/COMPLETED; REOPEN restores a completed item's prior group.
Completion is human acknowledgement, distinct from producer response intent.

## Reversible immutable batches

Preview accepts HIDE, RESTORE or MOVE with an allowlisted target group. It
freezes up to 2000 exact owner IDs, versions, source generations and lifecycle
metadata in the database, with fingerprint, capture time and ten-minute expiry.
It returns counts, exclusions and a small ID sample, never all source bodies.
Execution requires that exact preview/fingerprint plus confirmed=true and a
request ID. All versions are checked under the owner queue lock before writes;
a conflict rejects the whole batch with a durable conflict receipt and no
automatic target refresh. Expired or already executed plans cannot expand or
replay under another request ID. Empty eligible snapshots are successful no-ops.

Hiding OPEN or COMPLETED changes only that row's lifecycle/revision metadata.
The private hidden-state journal retains the prior OPEN/COMPLETED state,
completion timestamp, active group, lane/orders and source identity. It does
not reorder surviving rows or erase creation time, memo, source key/generation
or tombstones. Restore returns the original lifecycle/group; legacy hidden
OPEN records remain restorable. A RESTORE preview with batchId uses only the
membership of that executed HIDE batch. Producer retries still deduplicate
against hidden records and cannot resurrect the same event identity.

The 2026-11-17 owner cleanup is one authorized execution, not a recurring
policy. Its bound is `createdBefore=2026-11-17T15:00:00Z`, corresponding to
2026-11-18 00:00 Asia/Seoul. Membership is captured after release immediately
before execution. Backdated arrivals after that snapshot are not members.
Already hidden records and post-cutoff records are excluded. Actual release
reports must record live counts and restorationBatchId, never reuse historical
244-item counts as execution constants.

## Protected local-key possession and client repair

No persistent secret/hash is returned by connection tools. Registration and
lastUsedAt do not prove delivery. Restore requires an eligible non-revoked
producer, exact connection name and a short-lived possessionProofId.

The normal owner-only, nondelegated
`POST /api/workflow/attention/devices/{id}/possession` flow returns a one-time
challenge. A local helper that safely holds the existing key computes HMAC-SHA256
over the exact returned message using SHA256(secret) as key. The API compares
against its stored verifier, verifies the challenge once, and the management
restore consumes that owner/credential-bound proof within five minutes.
Challenge material is not proof by itself. MCP callers cannot assert possession
with a boolean, retrieve a verifier, issue keys or revive a revoked grant.
Revoke is exact-ID/name scoped and idempotent. Windows uses the existing
PKCE/state/install-ID/loopback secure pairing flow; a valid registration is
still not a collector delivery test.

## Migration and safe recovery

V117 adds owner-bound operations, previews, hidden-state and possession tables
with RLS enabled; it updates no existing queue data or credentials. Applied
migrations are immutable. Preserve nullable persistent credential expiry and
the existing OAuth volume/master key. A compatible roll-forward is preferred:
an old API that cannot read nullable expiry must not be blindly redeployed.
No automated data/credential reversal is authorized by a deployment rollback.
