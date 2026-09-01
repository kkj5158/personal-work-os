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

- **Work Log** — now three pages sharing one domain: `/worklog` (근무 기록:
  attendance tracking, clock-in/out, `WorkTimeEntry` time logging,
  `ActivityCategory` two-level catalog, absence backfill/correction,
  monthly/weekly views, a 12-week trend chart), `/worklog/checklist` (근무
  체크리스트: the Daily Work Checklist system), and `/worklog/attendance`
  (출결 관리: `AttendancePlan` plan-vs-actual, leave reservation, annual/
  monthly attendance summaries, a plan-and-actual calendar,
  `StartTimeCriterion` management). Runs entirely against the real Spring
  Boot backend and PostgreSQL — no mock data path remains. See
  `docs/product/work-log-policy.md` and
  `docs/product/work-attendance-management-design.md` for the confirmed
  product policy and `docs/project/work-log-roadmap.md` for the
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

## Current state, as of 2026-08-29 **[state]**

- A post-production feature batch (leave allowance + half-day leave,
  default start-time criterion, direct 24-hour time input, a Daily Work
  chart with targets, the Daily Work Checklist system, `ActivityCategory`
  drag-and-drop ordering/move, and a later continuation adding the
  `AttendancePlan` plan-vs-actual domain, leave reservation, plan-aware
  reconciliation, the 출결 관리 page, and `StartTimeCriterion` memo/delete)
  was implemented on `feat/worklog-post-prod-iteration-1` (branched from
  `dev`), pushed to `origin`, and left unmerged pending independent Codex
  review — see `docs/iterations/2026-08-post-production-iteration-1.md`.
  `dev`/`stg`/`prod` were not modified by this work. Migrations run through
  `V18` on this branch (not yet on `dev`/`prod`).

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
- `dev` and `stg` are now normalized to the same commit, containing
  everything `prod` has (that earlier gap is resolved) plus this
  repository's own documentation — which `prod` intentionally does not
  have; `prod` was not advanced merely to pick up documentation. `main` no
  longer exists (deleted, locally and on `origin`); GitHub's default
  branch is `dev`. See `docs/GIT_WORKFLOW.md`'s "Current operational
  state" section for the full history.
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
