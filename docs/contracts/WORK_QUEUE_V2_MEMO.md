# WORK QUEUE V2 memo and summary contract

The canonical attention lifecycle remains OPEN / COMPLETED / DISMISSED. Source
event status remains `source.intent`; a memo or summary never completes a WorkTask.

`POST /api/workflow/attention/items/{id}/memo` accepts `operationId` (UUID),
`expectedMemoRevision` (nonnegative integer), and `memo` (string). Owner browser
identity and existing DEVICE credentials may call it; PRODUCER credentials may not.

Memo limits are 4000 UTF-16 code units after CRLF/CR normalization to LF. Newlines
and tabs are accepted, other ISO controls and unpaired surrogates are rejected.
Whitespace is retained and an empty string clears the memo. Memo writes preserve
IDs, lifecycle timestamps, source keys, source references, linked tasks, and both
orders. Successful changed writes increment item revision, queue revision and the
independent memo revision. Unchanged content is an idempotent no-op.

The existing operation ledger handles response-loss retries. Replaying the same
operation returns its original result even after newer changes. A different payload
under that operation ID returns `IDEMPOTENCY_MISMATCH`. Normalized line endings
have the same replay identity. A stale memo revision returns HTTP 409
`MEMO_REVISION_CONFLICT` with `latest` (full current item) and `queueRevision`.
Clients must retain the unsent draft and show the current server memo; they must
never replace the expected revision and silently retry a conflicting edit.

Items append `memo` (default `""`), `memoRevision` (default `0`), `summary`, and
`summaryOrigin`. Existing Source JSON appends nullable `summary` / `summaryOrigin`.
The authorized existing create path accepts a provided nonblank summary of at most
1000 normalized UTF-16 units with an explicit supported origin: `SOURCE_PROVIDED`,
`LOCAL_EXTRACTIVE`, or `EVENT_METADATA`. It validates text as above and retains the
supplied provenance through snapshots, history, and operation replay. This is
producer/device supplied metadata: authorized completed-response extraction may
supply `LOCAL_EXTRACTIVE`; a structured event adapter may supply `EVENT_METADATA`.
The backend performs no scraping, inference, external AI call, or transcript
storage. Only the bounded excerpt is retained in the existing source JSON for the
attention item's lifetime. Missing source content falls back to the action title
with `TITLE_FALLBACK`; no content or provenance is invented. A navigation
target refresh preserves the existing summary. Duplicate source events neither
replace the original summary nor create a new attention item.

Legacy Source/Item constructors and old stored operation replies remain readable;
missing memo values default safely. Old clients may omit new create fields and
continue their existing lifecycle operations. Deploy the compatible backend and
additive memo migration before installing the V2 client. Applied migrations must
never be edited; the integration owner audits and finalizes the candidate migration
number before applying it to a shared environment.

The summary provenance extension requires no further migration or backfill after
V82. Deploy the compatible backend before clients start submitting
`LOCAL_EXTRACTIVE` / `EVENT_METADATA`: the earlier V2 backend rejects those origins.
`AI_GENERATED`, unsupported origins, and origin-only payloads remain invalid.

Warm conditional snapshots acquire a shared owner queue lock, protecting the
observed revision and attention rows against canonical writers while allowing
readers to overlap. An absent queue or unfinished lane bootstrap retains the
existing exclusive initialization path. Matching ETags use only the revision and
open-item display-heading projection; they skip full source/memo/item and lane
loading. The display hash remains sensitive to canonical project-name changes
outside attention. Full 200 responses are tagged from their actual returned
snapshot. Mutation locking, idempotency, ordering and bootstrap defaults remain
unchanged. This reduces redundant polling work; deployed latency requires separate
HTTP/native observation and is not established by compilation or concurrency tests.

Canonical order writes retain their computed UUID lists and owner queue lock, but
apply each nonempty list with one parameterized UPDATE FROM VALUES instead of one
round trip per item. Only the selected Stack or lane order column changes; item
revision, timestamps, source, memo, lifecycle, the other order and operation replay
semantics are unchanged. Empty lists perform no order update. Source-provided
summary bounds, owner/CAS checks and the existing 1000-open-item capacity remain
unchanged. This requires no migration or timeout/pool adjustment.
