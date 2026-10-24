# Production Operations Reference

## Current timetable release — 2026-10-24

Date-free weekly timetables are deployed at `https://kafka-sys.life/calendar?tab=timetable`.
Creation-group correction DEV SHA: `6727184a5ce9a1530b63bdcd26b41e8af30e825a`;
narrow PROD SHA: `da2454fbd4495a2cd83cbe348716a838fa615526`.
V91 checksum remains 1621045375. Additive V94 checksum 294450930 was read back
successfully in both databases. Original batch receipts recovered 40 PROD blocks
into 8 groups; all 42 existing block IDs, contents, versions and timestamps are
unchanged (digest excluding creation_group_id: 8b89ab36b9033b29e8ade76fab187a2f).
API migration/health preceded Web deployment. The release sources are pinned to the
validated feature commits; a future branch push alone must not be treated as a release.
Inspect live source config and exact successful deployment metadata before changing a pin.
The previous PROD Web SHA is `1ca2a136cbf5961ba731520866c941761bd262fe`.
Web rollback keeps the new group-aware API and V91/V94 data. The previous API
does not detach individually edited group members; prefer a compatible forward
fix rather than exposing old API writes against active groups.

See [the timetable handoff](calendar-timetable-v1/HANDOFF_20261024.md) and its
`evidence/group-edit-20261024.json` for the correction's observations and limits;
the older `evidence/railway-after.json` describes the initial release only.
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
