# NAVER RSS discovery (2026-11-21)

The fixed owner source is `https://rss.blog.naver.com/yozo990.xml`. This feature
discovers public RSS entries and keeps unverified excerpts in a separate private
review queue. **It does not automatically archive full article bodies or images.**
The live reference `224481843682` supplied 359 characters ending in an ellipsis,
without `content:encoded` or media. A full faithful source was not demonstrated.

## Source permission and fidelity

The observed official NAVER search policy §4(4) explicitly permits publisher
enabled RSS collection despite robots restrictions. Blog help describes search
permission and external sharing settings as conditions for external RSS readers.
This is a bounded RSS permission, not permission to fetch arbitrary article pages,
private/friends-only content or image hosts. No cookies, credentials, browser page
scraping, redirect following, CAPTCHA handling or access-control bypass is used.

- https://policy.naver.com/rules/search_policy.html
- https://policy.naver.com/policy/disclaimer.html
- https://help.naver.com/service/5593/contents/15408?osType=COMMONOS
- https://help.naver.com/service/5593/contents/15555?osType=COMMONOS
- https://docs.railway.com/cron-jobs

The notice `https://help.naver.com/notice/noticeView.help?noticeNo=27243` was not
retrievable during verification. No behavior is inferred from that notice.

The observed feed contains 50 entries, no pagination, no `content:encoded`, and
36 ellipsis descriptions. Title/category/date/ID are source metadata; descriptions
are unverified excerpts and all media remain incomplete. Changing feed bytes alone
is not proof of an article revision: item fingerprints compare normalized source
metadata and excerpt instead. Reporting/logging excludes private prose and raw XML.

## Architecture and contracts

Additive Flyway V123 creates owner-scoped RLS config, RSS item, and durable run
tables. Existing archive posts, revisions, assets, imports and read progress are
not written by polling. Queue identity is `(owner, NAVER_RSS, yozo990, external ID)`.
Poll receipts include request IDs, counts, feed hash, and before/after item hashes
and states. The fixed source is HTTPS/HTTP1.1, bounded to 2 MB / 100 items, with
5-second connection, 15-second response and 20-second body limits. XML entities,
DOCTYPE and external schemas are disabled. Untrusted markup is stripped.

The supported existing API scheduler is used instead of adding a Railway Cron
container. Its private single-thread scheduler uses `0 */10 * * * *` UTC
(equivalent to Railway `*/10 * * * *`), leaving existing MONEY/LOG/STUDY scheduler
beans unchanged. A transaction-scoped PostgreSQL source advisory lock prevents
overlapping requests across replicas. Each owner/10-minute bucket has a stable
request ID. Manual requests also require request IDs and wait at least 60 seconds
between actual polls. 429 Retry-After is respected; transient failures back off
with jitter. 401/403 and redirects persist a policy circuit and disable polling.

Feature flag `APP_NAVER_RSS_SYNC_ENABLED` defaults to false. Owner configuration
also defaults to disabled. No unsupported full-text feature can be enabled by
this flag. An authenticated owner can enable/disable discovery in `/naver-archive`.
Normal owner JWT authentication applies to `/api/naver-archive/sync`:

| Operation | Route |
| --- | --- |
| Status | GET `/sync` |
| Pending queue, keyset pages | GET `/sync/items?limit=20&cursor=...` |
| Enable/disable, requestId + expectedVersion | POST `/sync/config` |
| One-shot poll, requestId | POST `/sync/run` |
| Explicit existing-post association, postId + version + requestId | POST `/sync/items/{id}/link` |
| Explicit source-edit acknowledgement, sourceSha256 + requestId | POST `/sync/items/{id}/ack` |

The existing archive summary API includes `rssSync`, so the current MCP
`naver_diary_archive_summary` can report sync health without new MCP write scopes
or routes. All these reads remain private/no-store.

## Baseline, duplicates and completion

All existing source IDs, including archived posts, are compared on every poll.
On the first run, unmatched entries older than seven days are `BASELINE_ONLY`;
they are recorded as observations, never historically imported. Recent unmatched
entries become `PARTIAL_NEEDS_SOURCE`; missing publication dates remain unknown.
Every later poll rechecks the complete feed, not a timestamp high-water mark.
Missing feed entries are never deleted. Poll interruptions beyond the current
feed's oldest publication time latch a coverage-gap warning. Latest-N feed
retention and private/friends-only posts remain unavoidable blind spots.

Legacy posts without IDs are suggested only by exact URL/body hash, a sufficiently
long normalized text prefix, or title plus exact publication timestamp. Title
alone never merges. Ambiguous cases remain `POSSIBLE_DUPLICATE_REVIEW`. Explicit
association uses the existing archive version check, audit/revision service and
request replay, preserving body, date, asset bindings and read progress. Existing
canonical URLs are not migrated; future verified yozo990 URLs preserve the blog ID.
Source metadata/excerpt changes on linked entries become `SOURCE_EDIT_REVIEW`;
they never overwrite the owner's full body or edits. Acknowledgement requires the
current RSS hash and an explicit owner action.

The queue's manual-completion button opens a blank-body existing editor using
source metadata. It never pre-fills an excerpt as a full body. Owner HTML/image
ZIP completion uses the existing preview/approval import, PDF/manual text uses the
existing owner-input editor. The normal fidelity review remains explicit. Import
or manual completion links by the verified source ID on the next poll. Do not
label a summary or an externally hotlinked image as a complete archive.

## Operations and release

One source/owner makes at most 144 scheduled requests/day plus bounded manual
checks (observed feed about 78 KB, approximately 11.2 MB/day before protocol
overhead). A private daemon scheduler thread shares the existing API and DB pool;
no extra service/container or persistent cron process is provisioned. Actual
monetary cost is unmeasured; usage-based CPU/network/storage still apply. Receipts
are retained (about 52,560 scheduled rows/year/owner); no archive/receipt deletion
job is introduced. Two environments double scheduled source requests when enabled.

Validate parser/security, owned PostgreSQL integrity, UI and build before DEV.
Apply V123 only if the latest repository and live Flyway inventories have no
collision. Deploy API first, verify successful exact commit and health, then pin
Web to that commit. Preserve branch-following API configuration and the shared
release lock. Validate authenticated DEV with actual RSS and repeated polls,
then promote only this feature to latest PROD; DEV-only migrations stay in DEV.
Capture server-side aggregate hashes before/after without exporting database rows.
Verify an actual scheduled receipt; a deployed timer alone is not execution proof.

Disable owner discovery or set the global flag false to stop future polls without
deleting data. For code rollback, use the established task-scoped source deployment
process after checking newer work; retain additive V123 tables and receipts. Never
reset the database or run a down migration. A policy circuit requires an operator
to recheck current rules and restore configuration deliberately; UI cannot bypass it.
Use the platform's existing recovery/backup procedures for real data incidents.
