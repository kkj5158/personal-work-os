# Private owner archive

`/naver-archive` is independent of `/blog` (Blog · LOG). PostgreSQL is canonical;
REST, Web and thirteen typed MCP tools use the same domain service. Every lookup
uses the authenticated owner. Hosted DEV uses the existing Supabase JWT chain.
Local `dev` remains loopback QA only. No Naver network client, sync, RSS, embedding
or publication path exists.

## Content and concurrency

`bodyText` is verbatim, including CRLF and spaces; UTF-8 SHA-256 accompanies each
record and immutable revision. Raw `sourceHtml` is private and distinct from a
jsoup safelist display copy. Scripts/styles/embeds and remote images are removed.
Local image references are `asset:<uuid>`; image bytes are private owner-scoped
PNG/JPEG and fetched with normal authorization into temporary blob URLs. No
credentials or owner text are placed in URLs, shell preferences or telemetry.
Unknown source dates remain null, original visibility defaults UNKNOWN and new
entries default NEEDS_REVIEW. Date order is ascending then UUID, null dates last
in either direction; cursor is bound to filters. Korean text search is literal,
case-insensitive substring search, not external AI search.

Create/edit/archive/restore require UUID `requestId`. Edit/archive additionally
require `expectedVersion`. All mutations serialize on the owner's workspace row;
reused request IDs with a different payload conflict. Same-request replay returns
the original receipt. Use `/operations/{requestId}` after an unknown outcome,
then read the actual post/hash before telling the owner a write succeeded.
Progress and last-viewed position are stored separately from article version.
Revisions preserve source content; no permanent deletion endpoint is provided.
Retention currently lasts until an explicitly approved future owner deletion
workflow; no automatic purge is claimed. Platform disk/backup encryption follows
existing Railway infrastructure, without a new application-layer encryption claim.

## Import format boundary

Actual official Naver export: **UNTESTED_PENDING_USER_ARCHIVE**. No real export
has been supplied. This implementation deliberately does not invent a parser
for an unobserved Naver format. An unknown ZIP reports unsupported/review and
imports zero posts. The following explicit ORBIT preparation format supports
synthetic testing and later owner-prepared conversion after source inspection:

```json
{"format":"orbit-naver-archive/v1","posts":["posts/one.json"]}
```

Place that object in ZIP root `manifest.json`. Each listed UTF-8 JSON file has
the ordinary create fields except requestId, plus optional
`assets:[{"id":"<uuid referenced by sourceHtml>","path":"assets/image.png"}]`.
Required title/bodyText; optional timezone-aware originalPublishedAt or null.
Set fidelityStatus explicitly only when justified. Import provenance is always
OWNER_EXPORT. Original files/HTML remain private; ZIP checksum identifies the
immutable preview. Preview stores private candidates but creates no posts.
Execution requires exact batch ID, manifest SHA256, `confirmed:true` and request
ID after owner approval. It processes at most 50 items per call with committed
per-item checkpoints, receipts and resumable PARTIAL state. Existing exact
source IDs/URLs are skipped, never overwritten; body hashes are suggestions and
same titles never merge. Same batch replay never creates a second copy.

Limits: ZIP 8 MB compressed, 32 MB expanded, 1000 files, 500 posts, 2 MB/file,
20 images/post, PNG/JPEG at most 24 million pixels; reject traversal, duplicates,
nested archives, invalid UTF-8 and suspicious compression. Article fields at
most 500,000 characters, JSON request 1.1 MB (11.1 MB for import preview);
these are explicit rejections, never truncation. MCP broker input remains
64 KiB; larger imports use Web. Diary response cap is bounded; oversized calls
report OUTCOME_UNKNOWN rather than a truncated complete body.

## Delegated MCP and release

Fresh explicit `orbit:read:diary` and `orbit:write:diary` consent is separate from
existing `orbit:read` and MONEY writes. Broker rechecks grant revocation and signs
the exact method/path/query/body plus user-token hash; backend checks ES256,
issuer, environment, user/client, grant, purpose, 30-second expiry and exact scope.
Old read/MONEY grants cannot acquire diary access silently. No generic HTTP/SQL
or asset-fetch tool is exposed. Generated schema/catalog: `api.json` and
`mcp-tools.json`; regenerate with `node scripts/naver-archive-contract.mjs`.

DEV deployment is authorized; PROD deployment and real diary import are excluded.
Deploy API before Web/MCP at the tested exact SHA under the common release lock.
Preserve OAuth signing keys, encrypted grant vault, volumes and auth client IDs.
Application rollback stops new diary writes, restores prior MCP/Web/API sources
and retains additive tables/revisions. Never drop tables to roll back code.
Synthetic owned PostgreSQL backup/restore verification does not certify a real
owner-data backup; confirm the actual source backup/preview before real import.

Live MCP SDK tests, synthetic OAuth tests and an actual ChatGPT invocation are
distinct evidence. Installing code does not prove the in-chat catalog refreshed.
