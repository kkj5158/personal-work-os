# Architecture Reference

Durable architecture facts verified from the current codebase. This is *not*
a tutorial or a full API reference — for Work Log's actual product/API
contract, follow the canonical-document chain in `CLAUDE.md`'s "Work Log —
Canonical Documents and Precedence" section instead of this file. This file
covers cross-cutting structure that isn't specific to any one feature.

All facts below are **[verified]** by reading the repository unless marked
otherwise.

## Backend: modular monolith

One Spring Boot application, one Gradle project (`backend/`), organized as
domain-based vertical-slice packages under `com.kafka.backend`:
`activitycategory`, `common`, `plannedtimeblock`, `starttimecriterion`,
`workrecord`, `workschedule`, `worksettings`, `worktimeentry`. `common`
holds cross-cutting concerns: security config (dev/prod split, see below),
`CurrentUserProvider`, `ApiExceptionHandler`.

Persistence: Spring Data JPA + PostgreSQL, schema owned exclusively by
Flyway migrations (`backend/src/main/resources/db/migration/`, currently
`V1`–`V12`). `spring.jpa.hibernate.ddl-auto` is `validate` in every profile
(`application.yml`, restated in `application-prod.yml`) — Hibernate never
creates or alters schema; it only fails loudly if the entity model and the
actual schema disagree. **[policy, confirmed by code]**

## Recurring backend patterns worth knowing before touching this code

- **Client-assigned id + `@Version` needs `Persistable<UUID>`.** Every
  entity in this codebase assigns its own `UUID` id (never
  `@GeneratedValue`) rather than letting the database generate one. Combined
  with an optimistic-locking `@Version` column, this breaks Spring Data
  JPA's default new-vs-existing detection (`Persistable.isNew()` normally
  falls back to "is `version` null," which only works if a freshly
  constructed entity's `version` field is genuinely left `null`, not seeded
  to `0`). `WorkRecord` implements `Persistable<UUID>` explicitly and its
  constructor leaves `version` `null` for exactly this reason — see the
  class-level Javadoc on `WorkRecord.java` for the full failure mode this
  fixes (only reproducible against a real database, invisible to
  mock-based unit tests).
- **Snapshot vs. live reference.** `StartTimeCriterion` is a mutable,
  user-editable catalog. `WorkRecord` never live-joins back to it — it
  stores a frozen snapshot (`applied_criterion_id`/`applied_criterion_name`/
  `applied_start_time`/`applied_grace_minutes`) of whichever criterion was
  applied at save time, so editing or deactivating the original criterion
  later never retroactively changes an already-saved record's displayed
  lateness. `ActivityCategory` on `WorkTimeEntry`, by contrast, is a *live*
  reference (`category_id`, not snapshotted) — a category rename is meant
  to be reflected on every historical entry that references it immediately.
  These are deliberately different policies for two different foreign
  references on the same feature; don't assume one implies the other.
- **`ActivityCategory` is the single shared category model.** Two-level
  (root/child) hierarchy, shared across Planning, Work Log's
  `WorkTimeEntry`, and the future time calendar. Never create a
  module-specific category type. Physical deletion exists (added in the
  pre-production hardening iteration) but only when safe: an unused
  category may be deleted, an in-use one or a root with remaining children
  is rejected (400), never cascaded. See `docs/backend/activity-categories.md`
  §5c for the exact enforcement.
- **Migrations are immutable once applied to a shared database.** Any
  Flyway migration already applied to the DEV or PROD Supabase project must
  never be edited — schema evolution is always a new migration file that
  `ALTER`s existing structure. This is about *applied state*, not about
  which Git branch a migration file happens to be merged into (see
  `docs/GIT_WORKFLOW.md` — `dev`/`main`/`prod` are currently diverged, so
  "merged to `main`" is not a reliable proxy for "applied to a shared
  database" right now).

## Backend security: DEV/PROD profile split

Two mutually-exclusive `@Profile`-gated configurations, both implementing
the same `CurrentUserProvider` interface so every downstream ownership
check is identical regardless of which one is active:

- **`DevSecurityConfig`/`DevCurrentUserProvider`** (`@Profile("dev")`): no
  login. `/api/**` is `permitAll()`. The current user id comes from a fixed
  `APP_DEV_USER_ID` env var (must be a real row in the DEV Supabase
  project's `auth.users`).
- **`ProdSecurityConfig`/`ProdCurrentUserProvider`** (`@Profile("prod")`):
  every `/api/**` request must carry a valid Supabase-issued JWT.
  `/actuator/health` stays public. The decoder is built manually via
  `NimbusJwtDecoder.withJwkSetUri(SUPABASE_JWKS_URI)` — deliberately not
  `issuer-uri` (which would trigger OIDC discovery Supabase may not fully
  expose) — with explicit signature (JWKS), expiration, and issuer
  (`SUPABASE_JWT_ISSUER`) validation. **The decoder is pinned to
  `SignatureAlgorithm.ES256` explicitly** — `NimbusJwtDecoder`'s builder
  silently defaults to trusting RS256 only if no algorithm is configured,
  which caused a real production outage (every real Supabase token
  rejected) before this was fixed; see `docs/iterations/` for the incident
  writeup. Do not remove or loosen this without understanding why it's
  there. The verified JWT's `sub` claim becomes the current user's UUID via
  `ProdCurrentUserProvider`.
- Profile isolation (dev config can never activate under `prod` and vice
  versa) has dedicated regression coverage:
  `SecurityProfileIsolationTest`.

CORS: `APP_CORS_ALLOWED_ORIGINS` (comma-separated), never hardcoded in
`ProdSecurityConfig`. See `docs/PROD_OPERATIONS.md` for the full env var
contract.

## Frontend architecture

- API access is kept separate from UI components (`lib/api/*`, not called
  directly from inside components without going through this layer).
  **[policy, confirmed by code]**
- `lib/supabase/` holds the auth clients (`client.ts` browser,
  `proxyClient.ts` for `proxy.ts`, `env.ts` for `isAuthRequired()`/
  `getSupabaseEnv()`). Auth is gated on `NEXT_PUBLIC_APP_ENV === "prod"` —
  never inferred from `NODE_ENV`, since a local `next build`/`next start`
  also reports `NODE_ENV=production` and would otherwise accidentally lock
  out local testing.
- `proxy.ts` is this Next.js version's rename of `middleware.ts` — see
  `frontend/AGENTS.md`. It redirects an unauthenticated request to
  `/login` and back, only when auth is required.
- The login page's `next` redirect-target query parameter is validated
  against an open-redirect via `app/login/safeRedirect.ts` — only a
  same-origin internal path is ever honored; anything else (absolute URL,
  protocol-relative, `javascript:`/`data:`, etc.) falls back to
  `/worklog`. See `docs/iterations/` for why this needed fixing.
- Work Log's frontend product-date semantics are centralized on
  Asia/Seoul via `lib/seoulDate.ts` (a constant +9h shift — Supabase's
  region has no DST, so this is exact, not an approximation) rather than
  scattered browser-local `Date` usage, so "today"/"this week"/"future
  date" classification agrees with the backend regardless of the viewer's
  own timezone.
- No test runner (Jest/Vitest) is installed in this frontend as of this
  writing. Where pure logic needed regression coverage during this
  iteration, small Node-runnable assert scripts were used instead (e.g.
  `lib/seoulDate.test.ts`, `app/worklog/criteriaSave.test.ts`,
  `app/login/safeRedirect.test.ts` — run directly via
  `node <file>.test.ts`, Node 22.6+). This is a pragmatic choice for a
  pre-production pass, not necessarily the intended long-term testing
  strategy — **[state]**, revisit if the project adds a real test runner
  later.

## Deployment topology **[verified from config, not from a live check]**

No Railway/Nixpacks/Docker config file exists in this repository — Railway
project configuration (Root Directory, `SERVER_PORT` env var binding) lives
in the Railway dashboard, not in Git. See `docs/PROD_OPERATIONS.md` for the
full deployment contract as last determined from the current code.
