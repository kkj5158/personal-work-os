# Production Operations Reference

## Current MONEY corrections release — 2026-10-27

Owner-authorized corrections 01–03 are live. API `41ec1db1-9300-42fd-a115-f275b30f67aa`
and Web `bdf7ce04-5e01-433c-8c9d-1276a9e01051` are SUCCESS. Official Railway CLI
5.62.1 uploaded clean narrow candidate `14a722b5873492e6f72be5b621bb8a47ec0aa27c`,
retained as tag `money-corrections-20261027-prod`. CLI metadata does not expose
commitHash; use source manifests, deployment IDs and image digests in the
[release evidence](releases/money-corrections-prod-20261027-ko.md).

STUDY is retained. No migration or production financial test writes occurred.
Runtime validated 95 migrations at V100, active_profile=prod / db_environment=PROD.
Authenticated smoke verified the independent type column, 50 retained registered
rows, removal of seven source-only rows with all seven retained in Review/deferred
tabs, original category/type editors, and the same 20 sampled facts' digest.

Pending patch `2a4d8968-915d-4a49-9ba3-76188c0935f6` was not applied or changed.
Its old Web/API pins (`66e32b8`/`9fadeb8`) must incorporate this MONEY release
before future application, or they may regress these fixes. Git prod integration
`17fddea` also contains unpromoted WORKPAD code; it is not the uploaded candidate.

## Current MONEY unified Bookkeeping release — 2026-10-25

API and Web are deployed at `5146fa41f13f9ec2d284ac78b19a6ed24dae9d5d`,
a MONEY-only candidate based on the prior PROD branch. Other unpromoted DEV
Calendar/Sleep changes are excluded. API deployment
`1400d692-80df-4c7f-b127-d9b74883b4e4` succeeded before Web
`d80eafd9-8620-414c-860a-14f0f7eb45b0`. Flyway validated 95 migrations and
applied V100 from public v99; runtime confirmed active_profile=prod and
db_environment=PROD. Existing migration files are unchanged.

Normal owner-authenticated read smoke at `https://kafka-sys.life/money/bookkeeping`
confirmed the original four KPIs/three donuts, unified controls, legacy bookmark
integration, and the new API. Twenty sampled pre-existing financial facts retained
their before/after digest; this is not a whole-DB audit. No production test writes
were performed. Q01–Q34 remain 28 PASS / 6 PARTIAL; release is not completion of
the deferred automatic-linking/Android work. Keep V100 and recover forward if new
semantics have been used; do not blindly roll back to an incompatible server.
See [the Korean release report](releases/money-unified-bookkeeping-prod-20261025-ko.md).

## Current Calendar unified review release — 2026-10-24

Calendar daily input and weekly/monthly reviews are deployed at `https://kafka-sys.life/calendar`.
Both PROD API and Web were verified at `ecd8fbebb883034e00d67ea4df60d4293e5f4ae2`.
API deployment `379d4ff5-12c2-4cf1-bc61-95ae0d61e797` succeeded before Web
`365c1869-0f49-41c3-a422-fd2051970f0b`. Runtime logs confirmed PROD v94 → V96/V97,
then v97 with active_profile=prod / db_environment=PROD. Existing timetable code is retained.
This narrow release excludes unpromoted Sleep protocol v2/automatic producers/V90/V95 and MONEY changes.
Actual deployment source links and successful state were read back; a branch push alone is insufficient.
The Railway connector remained unavailable after reconnect, so the authenticated dashboard was used.
Authenticated day/week/month, timetable and Sleep host read smoke and six public health/security checks passed.
No production content writes were used for QA. Four visible blocks on the inspected date retained their IDs;
this is not a whole-database digest audit. See `calendar-unified-review/RELEASE_20261024.md`.
Rollback review may use the prior compatible API/Web `441722ef5293ad942bac34df71c23dd67cb9d120`,
while retaining V96/V97 and all newly entered annotations/reviews; never down-migrate or delete user content.
Before a later Sleep release, re-check the intentionally absent lower-version V90/V95 migrations.

## Current timetable release — 2026-10-24

Date-free weekly timetables are deployed at `https://kafka-sys.life/calendar?tab=timetable`.
Group drag/resize DEV SHA: `f2ea8458650ffc8747300fa93997ebfd0f0c754d`;
narrow PROD SHA: `441722ef5293ad942bac34df71c23dd67cb9d120`.
The correction adds atomic group placement and full-group undo without a migration.
V91/V94 checksums remain 1621045375/294450930. All 43 stored PROD blocks, including
soft-deleted rows, retained the same content digest before/after deployment
(excluding creation_group_id: 98f6295cb587755aed0392893464d4e6). Read-only UI showed
42 active logical blocks; no production content writes were used for verification.
API health preceded Web deployment. The release sources are pinned to the
validated feature commits; a future branch push alone must not be treated as a release.
Inspect live source config and exact successful deployment metadata before changing a pin.
The previous group-aware PROD API/Web SHA is `da2454fbd4495a2cd83cbe348716a838fa615526`.
Application rollback to that version retains V91/V94 and user data, but restores
the old individual drag behavior. Do not roll API back before group support.

See [the timetable handoff](calendar-timetable-v1/HANDOFF_20261024.md) and its
`evidence/group-drag-20261024.json` for current observations and limits.
`group-edit-20261024.json` and `railway-after.json` describe earlier releases.
The current PROD PITR feature is disabled on the existing custom database image;
this release did not change that infrastructure setting.

Operational facts about the production environment, verified from current
repository configuration. This is not a live deployment status page — it
describes what the *code and config say should happen*, cross-referenced
with what has actually been confirmed during real operations in this
session where noted.

## Production contains real user data — read this before touching anything here

**[policy — the single most important rule in this file]**

- Production contains real user data. Never modify it casually, never as a
  side effect of an unrelated task, never without the project owner's
  explicit approval for that specific action.
- Schema changes happen only through new Flyway migration files
  (`backend/src/main/resources/db/migration/`) that `ALTER` existing
  structure. Never edit a migration already applied to a shared database.
  Never rely on Hibernate to create or change schema.
- `spring.jpa.hibernate.ddl-auto` must remain `validate` in every profile.
  This is currently true in both `application.yml` and
  `application-prod.yml` — if a future change ever sets it to anything
  else for `prod`, that is a serious regression, not a minor config tweak.
- A one-time historical data import must not be re-run. The August 2026
  Work Log import prepared during this iteration has its own precondition
  guard (aborts if matching rows already exist for the target user), but
  that guard is a safety net, not a substitute for treating the operation
  itself as strictly once-off. Its actual execution status against PROD is
  **[unknown]** to this session — confirm with the project owner before
  assuming it either has or hasn't run.
- `.claude/settings.local.json` must never be modified, staged, committed,
  restored, deleted, or overwritten.

## Environment variables **[verified from `application.yml`/`application-prod.yml`/`.env.example`]**

| Variable | Required in prod | Secret | Purpose |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | Yes | No | Must be `prod`. No default anywhere in code — startup fails loudly if unset. |
| `PROD_DB_URL` | Yes | No (but treat carefully) | JDBC URL, `jdbc:postgresql://<host>:5432/<db>`. |
| `PROD_DB_USERNAME` | Yes | No | — |
| `PROD_DB_PASSWORD` | Yes | **Yes** | — |
| `SUPABASE_JWKS_URI` | Yes | No (JWKS is a public endpoint by design) | `NimbusJwtDecoder.withJwkSetUri(...)` — JWT signature verification. |
| `SUPABASE_JWT_ISSUER` | Yes | No | Checked against every JWT's `iss` claim via `JwtIssuerValidator`. |
| `APP_CORS_ALLOWED_ORIGINS` | Yes | No | Comma-separated allowed origins for `/api/**`. Never hardcoded in `ProdSecurityConfig`. |
| `SERVER_PORT` | Yes (Railway-specific) | No | Not read by any application code directly — Spring Boot's own env-var relaxed binding maps it to `server.port`. Nothing in this codebase reads Railway's injected `PORT` automatically; this must be set to Railway's `${{PORT}}` reference in the Railway dashboard. |
| `APP_DEV_USER_ID` | Not applicable in prod | — | Dev-profile only; `DevCurrentUserProvider`/`DevSecurityConfig` are `@Profile("dev")`-restricted and cannot activate under `prod`. |

Frontend variables (consumed by the deployed frontend, not the backend):
`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Database

- Standard PostgreSQL JDBC URL, `driver-class-name: org.postgresql.Driver`.
- No SSL mode or connection-pooler preference is hardcoded anywhere in
  code — whatever `PROD_DB_URL` specifies is used as-is.
- **Caveat, not enforced by code:** a Supabase *transaction-mode* PgBouncer
  pooler URL can misbehave with Hibernate's prepared-statement usage.
  Session-mode pooler or a direct connection is the safer choice for this
  stack.
- Flyway: enabled, default migration location (`classpath:db/migration`,
  unoverridden), `clean-disabled: true` in every profile — Flyway `clean`
  must never be reachable in prod. Timetable V91 was applied on 2026-10-24;
  always inspect current files and live history before assigning a new version.

## Supabase JWT verification contract

- Signature: verified against `SUPABASE_JWKS_URI` via `NimbusJwtDecoder`,
  **explicitly pinned to `SignatureAlgorithm.ES256`**. This pin is
  required, not cosmetic — Supabase signs with ES256, and
  `NimbusJwtDecoder`'s builder silently defaults to trusting RS256 only
  when no algorithm is configured. Omitting this caused a real production
  incident (every real Supabase token rejected with a 401) — see
  `docs/iterations/` for the writeup. Do not remove this pin.
- Issuer: `JwtIssuerValidator` against `SUPABASE_JWT_ISSUER`.
- Expiration: `JwtTimestampValidator`, standard.
- No service-role or JWT-secret-based verification anywhere in this
  codebase — only the project's own public JWKS endpoint and issuer
  string. Never introduce a service-role key into the backend's JWT
  verification path.
- The verified JWT's `sub` claim becomes the current user's UUID via
  `ProdCurrentUserProvider` — parsed with `UUID.fromString`, throws (never
  silently defaults) on an invalid subject or missing authentication.

## Health and networking

- `/actuator/health` is public (no authentication) — used for platform
  health checks. `/api/**` requires authentication. Everything else is
  `denyAll()`.
- CORS origins: `APP_CORS_ALLOWED_ORIGINS`, single origin
  `https://your-frontend-domain.example` (exact scheme+host+port, no
  trailing slash), multiple origins comma-separated. Updatable at any time
  via env var + restart — no code change or redeploy of application code
  required.

## Railway deployment **[verified from repository config, not from a live Railway check]**

No `railway.json`/`nixpacks.toml`/`Procfile`/`Dockerfile` exists in this
repository — Railway project settings live in the Railway dashboard.

- **Root Directory** must be set to `backend` (this is a monorepo).
- **Java 21** (Gradle toolchain in `backend/build.gradle`).
- Gradle wrapper is committed (`backend/gradlew`), so build autodetection
  is plausible but not guaranteed reliable for a Spring Boot Gradle
  project. Deterministic fallback build command: `./gradlew bootJar`.
  Deterministic fallback start command:
  `java -jar build/libs/backend-0.0.1-SNAPSHOT.jar`.
- **`SERVER_PORT`** must be set to Railway's `${{PORT}}` reference — see
  the environment variable table above. This is a Railway dashboard
  configuration action, not something fixable in code alone.

## Current state, as of 2026-08-28 **[state]**

Per explicit user report during this session, the backend was already
deployed to Railway and receiving real authenticated production traffic
when the ES256 JWT decoder bug was discovered (every `/api/**` request
returning 401 despite a valid login and working CORS). The fix
(`.jwsAlgorithm(SignatureAlgorithm.ES256)`) was applied, tested, and
promoted to the `prod` branch (commit `33d3682`). **Whether the running
Railway instance has been redeployed with that fix is [unknown]** to this
session — promoting a Git branch is not the same as Railway actually
redeploying from it, and this session has no way to check Railway's live
state. Confirm directly with the project owner or the Railway dashboard
before assuming production is currently healthy.

## Verified narrow MONEY hotfix release — 2026-10-15

The production web service (`5818a578-b7a2-443a-aaad-ce10f6bb708c`) and API service (`e46b58f4-e829-430f-a4c4-b27e24d46f19`) both use repository `kkj5158/personal-work-os`, branch `prod`, pinned commit `95c0e54afd7c4bc97f8cd223607a1b5c05a74e3c` after this release. Exact-commit pins were already used before the hotfix; a branch push alone does not establish a deployed release. Inspect actual source config and successful deployment metadata, update the intended exact source SHA through the approved release process, and verify health/smoke. Do not assume that a staged source SHA, a branch HEAD, and the actual deployment SHA are the same.

This narrow release includes category color autosave and authoritative manual classification only. It contains no migration or Calendar V84. DEV already has Calendar V84 and separate preserved Calendar test fixtures; do not copy its schema/data into PROD as part of this hotfix. See [the release report](releases/money-priority-color-hotfix-20261015.md) for exact SHAs, regression and browser evidence.
