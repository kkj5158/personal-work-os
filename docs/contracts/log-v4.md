# LOG V4

LOG is the authenticated `/blog` feature, independently opened by the existing upper-right Blog entry. It has two visible navigation destinations (`내 피드`, `검색`), a 602px centered feed, profile tabs, inline post editing and the approved original-aspect carousel. The attached V4 HTML is retained under `docs/log-v4/reference.html`; it is a design oracle, not a deployed page or data seed.

## Identity and persistence

Spring Boot obtains the owner only from `CurrentUserProvider` (normal POS Supabase JWT in hosted environments). Every profile, post, reply, draft, upload and image read checks owner plus profile. Composite PostgreSQL foreign keys prevent cross-profile image/reply associations even below the API. Browser database roles have no LOG RLS policies. React renders text as text; imported HTML is never executed. A successful server save survives reloads and other devices. Foreground polling refreshes clean views/drafts every 15 seconds; local edits take priority. The active profile is a server preference, applied on reload/new devices.

V108 only creates LOG tables/indexes/constraints. It updates no existing business rows and changes no applied migration. `ddl-auto=validate` and Flyway clean protection remain unchanged. No profiles, sample records or legacy browser records are automatically created/imported.

Mutations serialize on the owner's LOG workspace row. Profile/post/reply/draft updates require the expected integer `revision`; stale writes return 409 and retain client input. Client-generated create IDs are idempotent. Posting can atomically consume the expected draft revision. Imported post content, flags, dates and replies commit together. A retried import returns existing records without overwriting them.

## HTTP contract

All routes are under `/api/log`, require the existing POS authentication, and return private/no-store responses. Wrong-owner/wrong-profile and absent identifiers both return 404.

|Route|Behavior|
|---|---|
|`GET /state`|Owner identity, live profiles, active selection, storage availability; no seed writes|
|`POST /profiles`|Create with UUID, name, handle, biography; handle unique case-insensitively within owner|
|`PUT /profiles/{p}`|Edit name/handle/bio/avatar with expected revision|
|`PUT /profiles/{p}/active`|Persist active profile|
|`POST /profiles/{p}/delete`|Expected revision and explicit confirmation; final profile cannot be deleted|
|`GET /profiles/{p}/posts`|Bounded offset pagination (`limit` 1–50, default 30), filter, profile-local post/reply search|
|`GET /profiles/{p}/posts/{id}`|One owned record, images and bounded reply preview|
|`POST /profiles/{p}/posts`|Create; optional expected draft revision; validated legacy envelope supports atomic import|
|`PUT /profiles/{p}/posts/{id}`|Inline text/image ordering update with expected revision|
|`PATCH /profiles/{p}/posts/{id}`|Set liked/saved/pinned/archived/reposted state with expected revision|
|`POST /profiles/{p}/posts/{id}/delete`|Expected revision and explicit confirmation|
|`GET /profiles/{p}/reply-feed`|Replies in reverse reply chronology with parent context and bounded pagination|
|`GET/POST /profiles/{p}/posts/{id}/replies`|Paginated replies / idempotent reply creation|
|`PUT /profiles/{p}/posts/{id}/replies/{r}`|Revision-checked reply edit|
|`POST /profiles/{p}/posts/{id}/replies/{r}/delete`|Revision-checked explicit deletion|
|`GET/PUT /profiles/{p}/draft`|Profile-specific persisted composer; revision-checked writes|
|`POST /profiles/{p}/images`|Validated private upload ticket and metadata reservation|
|`PUT /profiles/{p}/images/{id}/bytes`|Authenticated bounded binary proxy; hash/magic/type validation before S3 upload|
|`POST /profiles/{p}/images/{id}/complete`|Independent immutable snapshot copy/verification before READY|
|`GET /profiles/{p}/images/{id}`|Authorized image bytes, correct allowlisted MIME, no-store, nosniff, sandbox CSP|

Limits: 30 profiles; 50,000 characters per post/draft; 3,000 per reply; 5,000 replies per post; four PNG/JPEG/WebP images per post/draft; 18 MiB per image; 5 GiB reserved image storage per owner; 100 live upload reservations per hour. JSON bodies are bounded to 16 MiB and image bytes to 18 MiB, including chunked bodies. Handles use letters, numbers, dots or underscores (Korean supported). Names/handles/bios use the approved 40/32/300 character limits.

## Private storage and lifecycle

LOG reuses the approved existing S3 provider configuration, with isolated `log/{dev|prod}/{owner}/staging|final/{uuid}` keys. Existing `shared-desk` and `study` namespaces/defaults are preserved. `LOG_STORAGE_ENABLED` can override the inherited `SHARED_DESK_STORAGE_ENABLED`; no new credentials or bucket/CORS changes are required. The existing `SHARED_DESK_STORAGE_*` settings must identify the same environment as `app.db-environment`.

Uploads bind declared size, MIME and SHA-256. Only PNG/JPEG/WebP magic is accepted. Final snapshots are separate from replayable staging objects. Image bytes/data URLs never enter PostgreSQL or content localStorage. The frontend uses revocable authenticated memory blob URLs, shared only within the same owner/profile while mounted. Carousels and viewers contain the full image; desktop shows up to three, mobile one, with one-step arrows and end bounds.

Hourly bounded maintenance removes acknowledged staging objects after their signed upload lifetime, and unreferenced attachments after 24 hours. Profile deletion is explicitly confirmed, immediately hides the whole profile and blocks all its content/media routes. It retains data for 30 days before exact-key cleanup and profile purge. Handles remain reserved during retention. The last profile is protected. Maintenance never lists a bucket or deletes another feature's keys. Failed cleanup is retried; metadata is removed only after provider acknowledgements. `LOG_CLEANUP_DELAY_MS` controls the bounded maintenance interval.

## Legacy import and backups

The existing top-right LOG settings menu provides JSON export/import and a separately labeled browser-local import. Mobile retains the same layout and opens settings from the LOG wordmark. Import requires a visible profile/post/reply count preview and explicit confirmation. It adds records, handles profile handle collisions, preserves original dates/flags/replies and uploads valid embedded images through the same private pipeline. Unusable image references are reported before confirmation. No remote URLs are fetched. Old browser storage is never cleared by this feature.

Supported inputs: V1 `profile/posts/photos/comments` and string drafts; V2 single-profile drafts; V3/V4 multi-profile exports; native `POS_LOG_SERVER` version 4 JSON with embedded private media. Stable owner/profile/source identifiers make repeats idempotent; duplicate source IDs and oversized/invalid records fail preview instead of being silently truncated. Legacy formats without profile IDs use a separate name/handle-derived import identity. Import can resume completed records after interruption and never replaces existing server content by default.

JSON backups include all live profiles, archived posts, complete replies, drafts, flags and embedded image bytes. The browser exporter bounds embedded media to 100 MiB and the importer bounds a file to 140 MiB / 20,000 combined records; exceeding a limit shows an explicit error. Original local backups remain the recovery source if import stops. Server media and database backups continue to use existing infrastructure operations.

## Release and rollback

Integrate LOG with current DEV and verify its actual API deployment before pinning/deploying Web. Follow the repository's 2026-11-10 API branch-following policy and the owner-approved Railway CLI process for reviewed, environment-scoped Web source pins. Promote only the LOG delta when DEV contains unrelated unreleased features. Verify exact actual deployment SHA/ID/health and scoped UI/API behavior in each environment.

Rollback application code to the preceding successful source/deployment only after reviewing compatibility. Keep V108 tables, new content and object bytes; do not roll back or delete schema/data. A new forward migration is required for later schema changes. No manual browser-local import is part of deployment.
