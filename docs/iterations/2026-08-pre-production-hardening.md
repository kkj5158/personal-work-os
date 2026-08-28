# Iteration: Pre-Production Hardening (2026-08)

Status: complete, promoted to `prod` (commit `33d3682`).

This is a record of *what happened in this iteration and why it matters
going forward* — not a step-by-step transcript. For the durable facts this
iteration established, see `docs/PROJECT.md`, `docs/ARCHITECTURE.md`,
`docs/GIT_WORKFLOW.md`, and `docs/PROD_OPERATIONS.md`; those are the
current source of truth. This file exists so a future session can
understand *how* those facts came to be true without needing the original
conversation history.

## Scope

Following Work Log's MVP completion (see `docs/project/work-log-roadmap.md`),
this iteration addressed a Codex-run QA pass's confirmed findings, then two
further issues found after that pass, then the actual first production
promotion.

## What was fixed (durable lessons only — see git log for full diffs)

1. **Production authentication** — DEV's no-login convenience was not
   `@Profile`-isolated from prod; fixed by gating `DevSecurityConfig`/
   `DevCurrentUserProvider` to `@Profile("dev")` and adding a parallel
   `Prod*` pair that verifies a real Supabase JWT. See
   `docs/ARCHITECTURE.md`'s security section — this is now durable
   architecture, not iteration-specific.
2. **WorkTimeEntry-only optimistic locking** — a WorkRecord-only edit
   didn't always advance the aggregate's `@Version`; fixed via
   `entityManager.lock(..., OPTIMISTIC_FORCE_INCREMENT)`.
3. **Non-working `workScore` invariant** — backend now rejects a
   non-workday status carrying a score, rather than trusting the frontend
   alone.
4. **Future dates rendering as `미입력`** — the weekly/monthly table
   didn't distinguish "not yet arrived" from "elapsed with no record"; the
   donut already had this right.
5. **Frontend date semantics centralized on Asia/Seoul** — see
   `docs/ARCHITECTURE.md`; `lib/seoulDate.ts` is now the durable pattern.
6. **Frontend lint gate** — Work Log's own 4 genuine lint errors fixed;
   5 pre-existing Planning errors and 1 pre-existing Sidebar error were
   explicitly left alone as out of scope.
7. **Midnight day-rollover** — a tab left open across the Seoul day
   boundary no longer keeps treating yesterday as "today."
8. **`StartTimeCriteriaModal` partial-save consistency** — a sequential
   multi-row save could duplicate an already-succeeded row on retry after
   a later row failed; fixed by reconciling each row into state
   immediately on success, not only at the end of the whole batch.
9. **Unsupported HTTP method returning 500 instead of 405** — added an
   explicit exception handler.
10. **Category-deletion documentation drift** — canonical docs said
    "categories are never physically deleted," which had become false;
    corrected in place (not superseded by a new file).

Two further issues found after that pass, each fixed and promoted
separately:

- **Login open-redirect** via the `next` query parameter — fixed with
  `app/login/safeRedirect.ts`, an origin-comparison-based validator (not a
  regex blocklist). Now durable architecture — see
  `docs/ARCHITECTURE.md`.
- **PROD JWT verification failure (real production incident)** — every
  authenticated request returned 401 after the auth work above shipped,
  because the JWT decoder was never told to accept ES256 and silently
  defaulted to trusting only RS256. Root-caused via `javap` on the actual
  Spring Security jar on this project's classpath, fixed with one explicit
  `.jwsAlgorithm(SignatureAlgorithm.ES256)` call, and proven both ways (the
  regression test fails without the fix, reproducing the exact production
  error, and passes with it). This is now durable operational knowledge —
  see `docs/PROD_OPERATIONS.md` and `docs/ARCHITECTURE.md`. **The lasting
  lesson:** `NimbusJwtDecoder.withJwkSetUri(...).build()` has a silent
  RS256-only default; any future JWT decoder configuration in this
  codebase must set the algorithm explicitly.

## Production promotion sequence

1. `prod` branch created from the verified QA-complete commit (`c08e9b3`)
   — it didn't exist before this iteration.
2. A PROD deployment configuration preflight determined the exact env var
   contract, Railway build/start/port requirements, and Flyway/Hibernate
   behavior from current code (no live Railway/DB check performed) — now
   captured durably in `docs/PROD_OPERATIONS.md`.
3. A one-time historical Work Log data import (August 2026, 27
   WorkRecords / 24 WorkTimeEntries / 5537 total minutes) was prepared and
   validated against the V12 schema, with an explicit precondition guard
   and a post-insert self-verification block. **Not executed by any
   Claude session; not committed into this repository** (designed as a
   manual, once-off operator script using a `:PROD_USER_ID` placeholder,
   never a real UUID). Its actual execution status is unknown — see
   `docs/PROD_OPERATIONS.md`.
4. The ES256 fix (above) was found from real production traffic, fixed,
   and fast-forward-promoted to `prod` (`c08e9b3` → `33d3682`).
5. A full branch audit (`git merge-base --is-ancestor`, `git branch
   --merged`) found `prod` had received all of this work directly from a
   feature-branch chain, bypassing `dev` — `dev`/`main` remain behind.
   Superseded intermediate feature branches were deleted (local + remote);
   the active one was deliberately left alone. `stg` was evaluated for
   creation and left uncreated due to genuine ambiguity about its correct
   base while `dev` and `prod` are diverged. Full detail in
   `docs/GIT_WORKFLOW.md`'s "Current operational state" section.

## What is *not* durable from this iteration

Specific line numbers, exact test counts at each intermediate step, and
the moment-by-moment debugging narrative (e.g. a stale Turbopack dev-server
cache producing phantom console errors mid-session) are not reproduced
here — they were true at the time, not lasting facts about the system.
Consult `git log` on `prod`/`dev` for exact diffs if forensic detail is
ever needed.
