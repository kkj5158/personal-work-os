# Personal Work OS — Project Reference

Durable project facts for a session that has no memory of prior conversations.
This file answers "what is this project and what state is it in" — for *how
to work on it*, see `CLAUDE.md`; for architecture detail, see
`docs/ARCHITECTURE.md`; for Git policy, see `docs/GIT_WORKFLOW.md`; for
production operations, see `docs/PROD_OPERATIONS.md`.

Each fact below is labeled by how it's known:
- **[verified]** — directly confirmed by reading the current repository (code, config, migrations, Git history).
- **[policy]** — an explicit rule the project owner has stated; not derivable from code alone.
- **[state, as of 2026-08-28]** — the operational situation at the time this file was written. Re-verify before relying on it; it will drift.
- **[unknown]** — genuinely not verifiable from this repository or prior context. Do not fill this in by guessing.

## What this is

Personal Work OS is a personal productivity web app. **[policy]** Product scope
as stated in `CLAUDE.md`: Projects, Tasks, Today view, Work logs, Attendance,
Work sessions/timers. Intended to grow long-term, possibly toward AI features
and SaaS-style expansion later. **[policy]**

## What actually exists today **[verified]**

Only two product surfaces have real backend-integrated implementations:

- **Work Log** (`/worklog`) — the primary, MVP-complete feature. Attendance
  tracking, clock-in/out, `WorkTimeEntry` time logging, `ActivityCategory`
  two-level catalog, `StartTimeCriterion` lateness criteria with a grace
  period, absence backfill/correction, monthly/weekly views, a 12-week trend
  chart. Runs entirely against the real Spring Boot backend and PostgreSQL —
  no mock data path remains. See `docs/product/work-log-policy.md` for the
  confirmed product policy and `docs/project/work-log-roadmap.md` for the
  MVP-completion history.
- **Planning** (`/planning`) — exists as a route and shares the
  `ActivityCategory` catalog with Work Log, but this session has not
  inspected its feature depth or current completeness. **[unknown]**

Backend domain packages that exist (`backend/src/main/java/com/kafka/backend/`)
but whose product-facing completeness/status was not verified in this pass:
`plannedtimeblock`, `workschedule`, `worksettings`. Treat their maturity as
**[unknown]** rather than assuming they're either finished or unused.

## Tech stack **[verified]**

- Frontend: Next.js 16 (Turbopack) + TypeScript + Tailwind CSS + React 19.
- Backend: Spring Boot 4.1.0 + Java 21 (Gradle toolchain), Spring Security
  (OAuth2 resource server for prod JWT verification), Spring Data JPA,
  Flyway.
- Database: PostgreSQL via Supabase (separate DEV and PROD Supabase
  projects — see `docs/PROD_OPERATIONS.md`).
- Authentication: Supabase Auth. DEV uses a fixed configured user id with no
  login; PROD requires a real Supabase-issued JWT (ES256) on every
  `/api/**` request.
- Build: Gradle (backend, wrapper committed), npm (frontend).
- Repository: monorepo, `/backend` and `/frontend` as siblings.

## Repository structure **[verified]**

```
/backend   Spring Boot application (Gradle project root)
/frontend  Next.js application
/docs      Project documentation (this tree)
```

Backend domain packages (each a vertical slice, not a layer):
`activitycategory`, `common` (security/profile/CurrentUserProvider/
ApiExceptionHandler), `plannedtimeblock`, `starttimecriterion`,
`workrecord`, `workschedule`, `worksettings`, `worktimeentry`.

Frontend app routes: `app/login`, `app/planning`, `app/worklog`. Shared
libraries: `lib/api` (backend HTTP client, kept separate from UI
components per policy), `lib/supabase` (auth clients).

## Current state, as of 2026-08-28 **[state]**

- `prod` branch/deployment target is at commit `33d3682` — includes the
  full pre-production QA fix pass (see `docs/iterations/`), the login
  open-redirect fix, and the PROD ES256 JWT decoder fix.
- Per explicit user report during this session, the backend was deployed to
  Railway and receiving real authenticated production traffic when the
  ES256 JWT bug was found; the fix was applied and promoted to `prod`.
  **This session cannot independently verify Railway's live deployment
  state** — whether the running Railway instance has actually picked up
  commit `33d3682` yet is **[unknown]**; that's a deployment action outside
  Git.
- `dev` (and `main`, which mirrors it) are behind `prod` — they do not yet
  contain the work that shipped straight to `prod` in this iteration. See
  `docs/GIT_WORKFLOW.md`'s "Current operational state" section for the
  full explanation and the resulting `stg`-creation ambiguity.
- A one-time historical Work Log data import (August 2026, 27 WorkRecords)
  was prepared and validated on paper against the V12 schema, with an
  explicit precondition guard against accidental re-execution, but was
  never executed by any Claude session and was never committed into this
  repository (it was designed as a manual, once-off operator script, not a
  Flyway migration). **Whether it has since been run against PROD is
  [unknown]** to this session — do not assume either way, and do not
  re-run it without first confirming its actual execution status with the
  project owner.

## Non-goals confirmed for the current iteration **[policy]**

- No public signup, social login, anonymous login, roles/admin system, or
  MFA in production auth — Supabase project has public signup and
  anonymous login disabled; the login page is deliberately the only way
  in.
- No `stg` (staging) environment in the active promotion flow yet — planned,
  not yet built. See `docs/GIT_WORKFLOW.md`.
