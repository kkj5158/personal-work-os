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

Direct native Naver ZIP import remains unsupported. An unknown ZIP reports
unsupported/review and imports zero posts. The offline inspector below
recognizes the SmartEditor export layout and checks the original files against
the importer limits. The Web, REST and MCP preview endpoints accept this
explicit ORBIT preparation format:

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

The owner explicitly authorized DEV and PROD application release on 2026-11-17.
Real diary imports still require a separate exact-preview owner approval.
Deploy API before Web/MCP at the tested exact SHA under the common release lock.
Preserve OAuth signing keys, encrypted grant vault, volumes and auth client IDs.
Application rollback stops new diary writes, restores prior MCP/Web/API sources
and retains additive tables/revisions. Never drop tables to roll back code.
Synthetic owned PostgreSQL backup/restore verification does not certify a real
owner-data backup; confirm the actual source backup/preview before real import.

Live MCP SDK tests, synthetic OAuth tests and an actual ChatGPT invocation are
distinct evidence. Installing code does not prove the in-chat catalog refreshed.

## Native HTML preparation (review mode, 2026-11-17)

Unknown ZIPs/folders return HTML file counts, sizes and hashes with zero staged
items and zero committed posts. Password-protected or split archives must first
be extracted by the owner in an approved local environment; no password input,
Naver login, network request, or automatic import is implemented.

`python -B scripts/naver_native_prepare.py SOURCE INSPECTION_OUTPUT` inspects an
owner-selected unpacked directory locally. Inspect `review-report.json`, then
explicitly select preparation using a **different output directory**:
`python -B scripts/naver_native_prepare.py SOURCE PREPARED_OUTPUT --prepare
--report-sha256 <exact inspection hash>`. Preparation is not permission to import.
The tool never calls the API. Existing outputs cannot be overwritten. It streams
one bounded article at a time and emits independent stored ZIPs of at most 50
posts and 7.5 MB estimated payload (hard final ZIP cap 8 MB), with per-batch hashes.
Keep the final report and completed batches for replay/resume; reselecting the
same ZIP reuses the server's durable batch. A failed local preparation has no
completion report and must be inspected before using any partial output.

The SmartEditor reader recognizes `index.html` in the exported
`YYYYMMDD_<post-id>_<title>` directory. It reads the title, category, structured
body paragraphs and image references from the export and records component order,
embed references and original SHA-256. The folder date is a review hint.
Publication timestamps and canonical URLs require explicit HTML metadata.
The legacy preparation mode excludes an entire post if original HTML or an
attached image exceeds a legacy limit. The original source files stay intact.

### Chunked native upload

Add `--native-v2` to both inspection and preparation to generate
`*.orbit-native.zip` files. Their `orbit-naver-archive/native-v2` manifest
references the original HTML once, through `sourceArtifact`, and each image
entry includes its exact `sha256`. The client selects a prepared ZIP through
the normal authenticated archive screen.

- Each stored ZIP is at most 24 MB with up to 50 posts. The original HTML
  and post JSON each have a 2 MB file limit. Image files have a 12 MB limit and
  a 120-million-pixel validation limit. Images exceeding the 24-million-pixel
  display limit stay as byte-exact downloads with a preview warning.
- `GET /imports/native-upload` discovers the signed-in owner's incomplete ZIP.
  `PUT /imports/native-upload/{sha}/{part}` accepts `totalBytes` and
  `chunkBase64`. Parts are zero-based and exactly 750,000 bytes except the
  last. Replaying the same part is safe. A changed part conflicts.
- `POST /imports/native-upload/{sha}/preview` verifies the assembled ZIP
  and per-file hashes, then creates the normal private batch and removes
  its temporary parts. Repeating the operation returns the same batch ID.
  One incomplete ZIP per owner is accepted. The 24-hour window starts at
  the first part. Expired bytes are removed at the owner's next part upload.
  The owner can discard unfinished parts with `DELETE /imports/native-upload/{sha}`.
- Native v2 stores original HTML as an authenticated attachment. It builds
  the reader view from sanitized source markup. External resources are never
  retrieved by the importer. The existing execute path requires explicit
  confirmation and the exact preview hash. Delegated OAuth cannot use the
  chunk endpoints.

Paths above are relative to `/api/naver-archive`. The existing Web ZIP and
MCP request limits stay in effect for the legacy format.

The generic review adapter recognizes explicit HTML title/body and optional
`article:published_time`, `article:section`, and canonical Naver `og:url` evidence.
It never guesses dates or categories from filenames. UTF-8/BOM and explicitly
declared CP949/EUC-KR are decoded strictly. Extracted text is **not** claimed to be
verbatim native diary text; every converted post remains NEEDS_REVIEW. Unknown,
empty, corrupt or oversized documents are reported instead of fabricated.
The local source directory is read-only. Original HTML bytes and SHA-256 travel
with the batch and are retained as immutable private octet-stream attachments;
decoded sourceHtml remains separate from sanitized display HTML. Missing,
unsupported and remote media are flagged and never fetched. Only bounded decoded
PNG/JPEG images become display assets, in original HTML order. Relative paths
must resolve inside the selected directory; symlinks and escapes are rejected.

Prepared JSON extends v1 with optional `sourceArtifact:{path,sha256,encoding}`
and `assets:[{id,path,sourceRef}]`. Source bytes/hash/strict decoding must match
sourceHtml before staging. Existing v1 packages remain supported. Title-only
edits preserve mapped private image references. Original source downloads use
authenticated `/assets/{id}`, attachment disposition, no-store, nosniff and a
sandbox CSP; they never execute as the application origin.

The Web import panel supports ZIP and bounded unpacked-folder inspection, counts,
bytes, source date range, unknowns, duplicate candidates, per-post text preview,
exact archive hash approval, and checkpoint resume. No selection commits posts.
`GET /imports/{id}/items/{index}` returns one private staged text candidate to a
normal POS owner JWT; it is deliberately outside the delegated MCP allowlist.
MCP's existing thirteen tools retain their independently consented diary scopes.
Large native exports use local preparation; server zip-bomb/RAM limits are not
increased. The local tool caps the source inventory at 100,000 entries / 2 GB
and per-file reads at 2 MB, and never loads the entire export into memory.
