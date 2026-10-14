# POS Railway migration operations, 2026-10-14

These are the reviewed scripts used for this owner-authorized migration. They are
scoped to Personal Work OS and its exact DEV/PROD IDs, not generic migration tools.
The closure and recovery rules are in `docs/infra/POS_RAILWAY_MIGRATION_20261014.md`.

Run copied scripts only from the protected `F:/artifacts/pos-db-migration-20261014`
workspace, or set `POS_MIGRATION_ARTIFACT_DIR` to that same protected location.
Database credentials, signing keys, password hashes, archives, generated role/ACL
SQL and captured row payloads stay there and never enter Git or command output.
Original and active configuration backups use Windows CurrentUser DPAPI; recovery
requires that Windows identity or the owner's authorized Railway secret access.

Do not rerun freeze, role creation, restore, delta import or Auth preparation on
the active environment. The completed migration receipts and original protected
signing configuration are not resettable input. `auth-prepare.mjs` refuses to
regenerate existing signing credentials; `apply-prod-row-delta.mjs` refuses import
after destination activation. A future migration requires a separately reviewed
scope, current backups and a new artifact directory/configuration.

Source inspection and original Supabase HTTP restrictions are separate from direct
PostgreSQL connectivity. The final PROD row delta used a consistent exported
snapshot and fetched only changed rows. Replica mode existed only inside one
inactive destination restore transaction; all 254 foreign keys were checked before
commit and the full source/destination row multiset was compared afterward.

Before starting GoTrue, compare the restored Auth migration history to official
`supabase/auth` v2.197.0, commit `4eee58f296d9698a1c2c0ae14d7a0b379c7622d3`.
The protected upstream checkout contains 75 migration files; seven legacy migration
IDs belong to the initial schema baseline. Back up the destination before any Auth
schema update. The actual startup reported no migrations to apply.

The `auth-api-acceptance` and expiry probes create explicitly disposable users via
the protected GoTrue admin credential. All login/session tokens used for acceptance
come from the actual password grant. No synthetic token proves login. Fixtures are
removed afterward. Owner login evidence comes separately from the browser and
GoTrue audit entries with original UUID/hash/identity comparison.

Android endpoint changes require checking the final APK, not only generated
BuildConfig. A stale Kotlin inline constant was detected in SLEEP and resolved with
full compilation (`:app:compileProductionKotlin --rerun '-Pkotlin.incremental=false'`).
APK checks compare the existing signing certificate, package, version, API/Auth
endpoints, public key, and absence of the actual signing/database secrets.

Supabase retirement is not authorized. Keep both original projects and account
configuration intact. After Railway writes resume, never switch to the stale
source without controlled reconciliation. SMTP/email-based signup verification
and password recovery are explicitly deferred; autoconfirm remains false.
