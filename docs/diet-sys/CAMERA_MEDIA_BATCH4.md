# DIET Camera media — Batch 4 DEV contract

2026-09-27. DEV only; no production promotion. Camera 0.4.0 / versionCode 4
uses the existing POS authentication, DIET projection and raster storage.

## Canonical data and transport

`V63__diet_camera_media.sql` adds owner-scoped `diet_camera_media` and rebuildable
`diet_camera_note_media` workspace-copy bindings. There are no photo groups or
stored presentation rows. The unique identity is `(owner_id, client_media_id)`.
Captured instant, frozen offset and SHA-256 are immutable. The date is the instant
at the captured offset, never upload time. A monotonic client revision reconciles
memo, Trash, restore and terminal purge intents. Old retries cannot resurrect a
purged identity. Equal revisions with different intent conflict.

Final timestamp-burned JPEG bytes use the existing `RasterMedia` validator and
`journal_media.data BYTEA`: bounded base64 JSON, 10 MiB / 40 MP, JPEG only for
Camera. This is the platform's existing transport/storage, not a new object store.
Canonical images are DIET-owned; NOTE copies are owned by their NOTE workspace.

All routes below are relative to `/api/diet/camera-media`:

| Method / route | Contract |
| --- | --- |
| GET `/session` | Server-derived owner and DEV/PROD environment; never accepts a client owner |
| GET `?date=YYYY-MM-DD` | Current owner's records, optionally by captured date |
| GET `/{clientUUID}` | Reconcile one stable identity, including terminal tombstones |
| GET `/{clientUUID}/image` | Owner-authorized JPEG, no-store, nosniff; 404 after purge |
| PUT `/{clientUUID}` | Full desired state: capturedAt, offsetMinutes, sha256, memo, deletedAt, revision, purge; data only on first non-purge creation |
| POST `/{clientUUID}/reconcile` | Retry pending projection and safe purge cleanup |

Responses include server/client IDs, capturedAt/offset/date, imageRef, SHA-256,
memo, deletedAt, revision, purgeRequested, purgedAt and projectionPending.
Memo is at most 4,000 characters. `CurrentUserProvider` supplies ownership:
existing fixed-owner DEV profile, existing verified Supabase JWT subject in PROD.
No alternate authentication or client-selected owner is introduced.

## Projection and deletion

DIET's existing NOTE setting is the only switch. OFF still allows canonical
uploads and mutations, but leaves NOTE content untouched and pending explicit.
ON/resync includes photo-only dates. Camera images use ordinary `:::images`
blocks, groups of at most three derived during rendering, through
`NoteSystemService.save` and its expected-version contract. Existing NOTE schema,
generic editor, renderer and responsive CSS are unchanged. Narrow NOTE layouts
remain one column; Camera's local list remains three columns.

Only bound Camera media references are managed. Other text, images and DIET
daily-note content survive reconciliation. Canonical mutation commits before
projection; projection failure leaves a durable retry state. Owner advisory and
settings/workspace locks serialize projection with Camera operations.

Soft delete removes the projection but retains pixels. Restore reuses the same
identity and workspace copy. Permanent deletion waits for removal from managed
NOTE content, and checks references across all NOTE content, including archived
or user-copied references, before deleting owned copies and canonical bytes.
OFF or a remaining reference may therefore block purge safely. A terminal
tombstone remains. No unrelated NOTE image or independent Android Gallery copy
is erased. The Camera retains local pixels until the server acknowledges purge.

## Validation and device handoff

DEV V63 applied and validated; already-applied MONEY V62 was preserved exactly
and incorporated from current origin/dev before final validation. No repair or
history edits. Targeted DIET/production-security tests, opt-in rollback PostgreSQL
Camera lifecycle tests, NOTE parser/editor tests and actual NOTE rendering pass.
The rollback lifecycle covers owner isolation, stale intent, photo-only resync,
OFF/ON, user content, shared-reference purge blocking and storage cleanup.

Galaxy Z Flip 6 / Android 16 verified in-place upgrade, preserved legacy files,
online creation, four-image native NOTE rows, retries, offline save/restart,
background upload, memo, Trash/restore, OFF/ON, purge and simulated HTTP 401
recovery. Native Supabase refresh is implemented; actual production login/expiry
and production distribution are Batch 5 gates. Physical capture was silent as
observed by the owner, using Expo's supported shutterSound=false option.

Full evidence, exact revisions, APK hash and controlled QA sample inventory are
in the Camera repository's `docs/BATCH_4_CLOSEOUT.md`. No final Drive pass or
Central Full QA is claimed in Batch 4.
