# Personal Work OS - Claude Guidelines

## Project Overview
Personal Work OS is a personal productivity web app for managing:
- Projects
- Tasks
- Today view
- Work logs
- Attendance
- Work sessions / timers

The project is intended to grow long-term and may later include AI features and SaaS-style expansion.

## Tech Stack
- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: Spring Boot + Java 21
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Build: Gradle
- Repository: Monorepo

## Repository Structure
- `/frontend` - Next.js application
- `/backend` - Spring Boot application
- `/docs` - project documentation

## Architecture Rules
- Keep the backend as a modular monolith.
- Core business logic must live in Spring Boot.
- The frontend must not directly access business tables in Supabase.
- Frontend-to-backend communication should use REST APIs.
- Supabase is used mainly for PostgreSQL, Auth, and related managed infrastructure.
- External integrations should go through the backend when practical.

## Backend Rules
- Use clear domain-based packages.
- Prefer simple code over premature abstraction.
- Use JPA for persistence.
- Use Flyway for database schema changes.
- Never rely on Hibernate ddl-auto to create production schema.
- Add tests for important business rules.
- Run backend tests after meaningful backend changes.

## Frontend Rules
- Use TypeScript.
- Keep API access separated from UI components.
- Avoid putting business rules inside React components.
- Build responsive layouts for desktop and mobile.

## Security
- Never commit passwords, API keys, tokens, or secrets.
- Use environment variables for secrets.
- Do not expose database credentials to the frontend.

## Development Principles
- Build only what is currently needed.
- Keep the architecture extensible without overengineering.
- Avoid microservices, Redis, Kafka, vector databases, or other infrastructure unless there is a real requirement.
- Prefer incremental implementation and small commits.

## Validation Before Completion
Before considering a task complete:
1. Check affected code.
2. Run relevant tests.
3. Run build/type checks where applicable.
4. Verify no secrets are committed.
5. Summarize what changed.

## Work Log — Canonical Documents and Precedence
Before making any Work Log change (frontend or backend), read the canonical documents in this order. Where they disagree, the earlier document wins:
1. Confirmed product policy — `docs/product/work-log-policy.md`
2. API/domain contract — `docs/contracts/work-log-contract.md`
3. Backend persistence docs — `docs/backend/work-record.md`, `docs/backend/work-time-entry.md`, `docs/backend/activity-categories.md`, `docs/backend/start-time-criteria.md`
4. Frontend UI specification — `docs/frontend/work-log/work-log-ui-spec.md`
5. Historical handoff documents (e.g. `docs/backend/handoff-work-schedule-ui.md`, `docs/backend/time-work-management-v1.md`, `docs/backend/db-schema.md`) — record of past decisions only, not current policy where it conflicts with 1–4.

Current status and roadmap: `docs/project/work-log-roadmap.md`.

Key standing facts:
- `ActivityCategory` is the single canonical shared category model across Planning, Work Log, and the future time calendar — never create a module-specific category type.
- `StartTimeCriterion` is a mutable, user-editable catalog. `WorkRecord` stores a frozen historical snapshot (name + start time) of whichever criterion was applied — never a live join back to the catalog.
- Existing Flyway migrations (`V1`–`V6` and any migration already merged to `main`) are immutable. Schema evolution happens through new migration files that `ALTER` existing tables, never by editing an applied one.
- `.claude/settings.local.json` is local-only. Never read its contents into a decision, modify it, or commit it.

## Autonomous Development Workflow
- Work in isolated vertical slices: one complete, independently valid unit per commit.
- Autonomous implementation happens on `feature/*` branches, branched from `dev`. Never commit implementation work directly to `dev` or `main`.
- Any operation touching production data or a production deployment requires explicit user approval first — never assume it.
- Commit and push each stable unit to its feature branch as it completes; do not batch unrelated units into one commit.
- Genuine stop conditions (ask the user, do not guess): a direct conflict between confirmed product policies; a credible data-loss or irreversible-migration risk; a security/authorization problem; anything touching production; an unexpected migration version collision; a Git conflict that would require discarding user work; a new user-visible product decision not covered by canonical documentation.
- See `.claude/rules/git-and-safety.md` and `.claude/rules/validation.md` for the full operating rules.