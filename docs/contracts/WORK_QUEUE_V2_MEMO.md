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
