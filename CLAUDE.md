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