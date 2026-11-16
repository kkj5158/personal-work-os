# POS LOG multi-image implementation

Implementation date: 2026-11-17, Asia/Seoul. Release status and actual deployment identities are recorded in `handoff.md` and `qa_report.md`.

## Behavior

The existing composer and inline editor now accept one or multiple dropped images and repeated multi-file picker selections. Selections append in order. Immediate local thumbnails show their positions, per-image phase/error feedback, accessible previous/next order buttons, removal and retry. The file-only outside-drop guard prevents accidental browser navigation without changing text drops. The existing Threads-inspired feed and original-aspect carousel remain; desktop shows at most three images, mobile one, independently of the total cap. Carousel keyboard arrows and swipe interaction are supported.

The default cap is 20 attachments, configurable on the backend through `LOG_MAX_IMAGES_PER_POST` (1–100). `/api/log/state` exposes the cap and the unchanged 18 MiB per-file limit. PNG, JPEG and WebP are supported; unsupported types, HEIC/HEIF, mismatched magic, corrupt files, oversized files and dimensions above 20,000 per axis / 40 million pixels receive explicit errors. Client compressed-header checks run before preview creation or decoding. Two bounded preview workers and two upload workers keep a stalled network from preventing the remaining thumbnails. Object URLs are revoked on removal, reset and unmount.

Image-only and mixed posts are supported. Pending/failed attachments block final publish/save until completed or removed. Navigation guards retain unsaved input. Removing/canceling an attachment aborts its transfer and ignores late completion. Editing preserves unchanged images, supports append/reorder/removal, and cancel leaves the persisted post intact.

## Persistence and ownership

The implementation reuses the authenticated `/api/log/profiles/{profile}/images`, `/images/{id}/bytes`, `/images/{id}/complete` and private read routes, existing database relationships, provider configuration and environment-specific object namespaces. No public bucket, credentials, storage provider or authentication changes were introduced. Browser content storage contains no image bytes. Private originals retain orientation/EXIF; there are no publicly served derivatives.

Upload retries reuse the same reservation UUID and exact immutable size/MIME/name/hash claim. An already READY reservation acknowledges completion; different claims conflict and wrong owner/profile remains hidden. Repeated bytes/complete calls cannot overwrite READY media. Full raster validation checks the immutable final snapshot before READY, including PNG chunk CRC and format endings. A single bounded decoder limits server memory pressure.

Posts remain client-UUID idempotent. The publisher retains its UUID through both post acknowledgement and authoritative draft readback, including a lost response. Inline edits retain expected revisions; a replay of the exact immediately previous successful payload returns the persisted result while differing stale writes remain conflicts. A legacy text-only update omitting `images` preserves its attachments.

Existing orphan maintenance remains reference-aware, bounded and exact-key scoped: unpublished uploads never create visible posts, failed/canceled orphans are reclaimed after the established retention period, and deleting one post does not remove a reused image. No historical READY image is rewritten or revalidated.

## Changed source

- `frontend/app/blog/LogApp.tsx`, `LogPost.tsx`, `LogAttachments.tsx`, `LogMedia.tsx`, `log.css`: composer/edit interaction and retained carousel presentation.
- `frontend/lib/log/attachments.ts`, `api.ts`, `backup.ts`: bounded queue, validation, stable upload/publish retries and backward-compatible backup bounds; associated tests cover behavior and failure recovery.
- `backend/.../log/LogService.java`, `LogImageValidation.java`, `backend/build.gradle`: cap, replay semantics, decoder bounds and official TwelveMonkeys WebP ImageIO dependency pinned at 3.13.0.
- `backend/src/main/resources/db/migration/V114__log_multi_image_attachments.sql`: widens only the two attachment-position constraints to 0–99. V108 and previously applied migrations remain unchanged. V112/V113 were occupied by concurrent MONEY releases before this migration was applied.
- `qa/log-multi-image-*.mjs` and `docs/contracts/log-v4.md`: hosted synthetic checks, preservation audit, exact fixture cleanup and updated API/storage contract.

## Rollback

Keep V114, new post/draft rows and media objects. Prefer a forward fix or a compatible application revision preserving the expanded attachment contract. A blind rollback to an old four-image API/client can read larger posts but cannot safely edit all their attachments. Never restore an older database, narrow constraints over new attachments, drop tables or bulk-delete objects.
