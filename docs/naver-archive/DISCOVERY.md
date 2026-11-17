# Naver archive discovery / plan — 2026-11-17

Actual start 13:00:36 KST; scheduled trigger 13:00:27. Initial implementation base
origin/dev `59a69f52`; primary checkout's older dirty dev is preserved. Local
handoff SHA256 C5C321A1EB144830B65D7AB79BDF1540C9A0589CAFD84C7F6E85909B760CEF31;
all six inner manifest hashes verified. README, scheduled contract, policy,
both complete specifications and HTML reference read before implementation.

The current code uses Next 16/React 19, Spring Boot 4.1, PostgreSQL/Flyway,
owner-scoped JdbcTemplate services (LOG), and Supabase JWTs in hosted-dev.
The local dev authentication stub is not appropriate for public hosting.
The five-space shell lives in spaceNavigation/globalTabs. Blog · LOG is `/blog`
with separate log_* tables and private LogStorage; it will remain unchanged.
ORBIT has an existing OAuth broker with encrypted SQLite grant storage and
request-bound signed MONEY entitlements. New diary writes need a separate
explicit scope; existing read/MONEY grants must not authorize diary writes.

WORK QUEUE V3.2 recovery is active in its own worktree; it authored V115.
Use additive V116 for archive tables, recheck remote versions before integration,
and acquire common `.git/pos-central-qa.lock` before integration/schema/release.
No shared files, ports, databases or credentials are taken over.

Plan: independent `/naver-archive` in KNOWLEDGE & LOG, `/api/naver-archive`
owner-scoped REST and the same service called by eleven typed diary MCP tools.
Separate posts/revisions/progress/import-batches/items/assets/workspace lock;
raw UTF-8 body preserved with SHA256, explicit nullable source date, stable
date/id ordering, guarded versions and idempotent requests. Rich HTML uses a
sanitized display copy; source HTML is private and never executed. Assets are
bounded private owner-scoped bytes, never remote-fetched.

Import: the real official export is absent. Compatibility remains
UNTESTED_PENDING_USER_ARCHIVE. Implement bounded ZIP intake and an explicitly
documented ORBIT interchange manifest for synthetic/owner-prepared records;
unknown official layouts return review/unsupported, not fabricated parsing.
Preview creates no posts. Execution requires exact immutable hash and explicit
confirmation, with durable per-item checkpoints and no overwrite of duplicates.

Impact checklist: only new archive tables/module plus additive shell/OAuth route
allowlists; preserve NOTE/Blog LOG/WORK/LIFE/FINANCE; no Naver HTTP/RSS/auth,
PROD action, real diary import, embeddings, telemetry or sharing changes.
Validate PostgreSQL persistence, auth/owner boundaries, malicious ZIP/HTML,
pagination, exact body roundtrip, conflicts, replay and separate progress;
frontend build/navigation/regression and approved TEAM KAFKA DEV screenshots.
DEV API before Web/MCP, exact tested SHA, observed deployment IDs/health;
report actual in-chat MCP availability separately from SDK tests.

Backup/rollback: additive forward-only schema, keep private archive/revisions;
application rollback leaves data intact. Existing platform backups are not an
independently verified archive restore. Prove restore with synthetic local DB;
do not dump real owner data. No hard-delete endpoint in this task.
