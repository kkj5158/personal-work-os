# POS LOG multi-image audit before implementation

Audit date: 2026-11-16, Asia/Seoul. Base DEV commit: f82d82e9b51f9f6bac13e44d63a440a1ba6393ad. Companion specification: POS_LOG_WEB_MULTI_IMAGE_UPLOAD_CODEX.md. Its requirements are applied within the owner's current browser, deployment, and data-preservation policies.

## Existing implementation

- Route `/blog`: `frontend/app/blog/LogApp.tsx` contains the profile-specific server draft and composer. `LogPost.tsx` contains inline text/media edits. Both already have a multiple file input, but upload sequentially before displaying a preview, enforce four images, and provide no external file drop target or individual upload retry.
- `LogMedia.tsx` provides authenticated private image loading, ordered attachment controls, original-aspect carousel and modal. Desktop displays at most three images and narrow screens one. This viewport rule is independent of attachment count and remains intact.
- `frontend/lib/log/api.ts` uploads by reserving an image UUID, sending authenticated bytes, then completing the immutable media snapshot. It validates declared type/18 MiB size and SHA-256. Existing callers include avatar selection and backup import.
- `LogService`, `LogController`, `LogStorage` and `LogMaintenance` implement authenticated ownership/profile checks, revision-checked writes, client UUID post idempotency, bounded upload proxy, independent final objects and reference-aware cleanup. Existing PNG/JPEG/WebP private storage uses the configured S3-compatible provider under `log/{dev|prod}/{owner}`. There is no need for another provider or public bucket.
- V108 creates normalized `log_post_images` and `log_draft_images` relationships. Both constrain ordered positions to 0..3. Eight LOG tables have RLS enabled without browser policies. Existing posts, drafts, profiles, replies and image objects must be preserved.
- `/api/log/state`, profile draft/create/update post routes, image reservation/bytes/complete/private-read routes are the existing API surface. All content/media requests use normal POS authentication and owner/profile scope; final save must only include READY image IDs.

## Changes and compatibility

1. Shared attachment interaction for composer and inline editing: immediate revocable previews, append from drop/picker, bounded concurrent uploads, count/order/remove, accessible reordering, validation and per-image retry/status. Suppress browser file navigation outside LOG's file targets while preserving ordinary text drops and other accepted targets.
2. Preserve stable upload reservation IDs across retries; guard final publish/save and navigation while attachments remain unfinished. Preserve existing draft revisions and optimistic edit checks, and prevent canceled/unmounted uploads from changing another editor or profile.
3. Raise the configurable server attachment cap to default 20, expose limits to the client, retain the existing 18 MiB per-file limit, and validate decoded image content and bounded dimensions on the server. Existing four-image/text-only records remain valid.
4. Add a forward migration widening only the ordered-position constraints. V108 and previously applied migration checksums remain unchanged. Inventory migration versions in DEV, PROD and active worktrees before assigning and applying the new version.
5. Extend focused frontend/backend/integration checks and use synthetic DEV identities for writes. Existing PROD journal records are read-only during verification.

## Deployment and rollback

Revalidated Railway project: `2b52b232-38b2-44b6-b97e-4caba54f90bc`. DEV environment `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`; PROD `c2c20488-311f-4b9e-9ec9-d79508123176`. API/Web service identities match the owner workflow. DEV URL: https://workflow-web-development-development.up.railway.app/blog. PROD: https://kafka-sys.life/blog.

Current APIs follow their environment branches without source pins under the later explicit `agent/API_AUTODEPLOY.md` owner policy. Web uses environment-scoped reviewed exact source pins. Preserve the later API-specific policy, acquire the common release lock, verify actual API SHA/deployment/health before Web, and deploy DEV before the scoped PROD promotion. Use the authenticated official Railway CLI; do not retry the known canceled connector deployment approval path. Preserve unrelated services, configuration and worktrees.

Rollback requires reviewing a compatible prior application version. Keep the widened constraints, newly attached media, and all user records; do not revert the database or delete image objects. An old four-image client cannot safely edit a new post containing more than four images, so a selective feature fix/revert retaining the expanded media contract is preferable to a blind application rollback.

## Initial observations and remaining proof

The approved TEAM KAFKA profile was reused through the documented bootstrap and official Playwright provider; authenticated deployed DEV LOG loads. No native Computer Use or personal profile access is permitted. Prior evidence reports a file-input assignment limitation, which must be probed afresh and reported honestly if it remains. Local process readiness is separate from browser connectivity. Test results, deployment IDs, checksums and exact limitation evidence belong in the final QA/handoff reports.
