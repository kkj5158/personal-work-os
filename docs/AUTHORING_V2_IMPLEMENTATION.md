# Authoring V2 implementation

Baseline: dev `8a707e6` (2026-09-21). Scope: DEV only.

## Reconnaissance

Existing `authoring_sessions` stores unrestricted program keys, JSONB answers,
frozen program definitions, progress, source session references and completed
report snapshots. Resume uses the latest updated incomplete session for each
program. No migration is needed for new program keys or structured JSON answers.
Old sessions retain their frozen definition and original answer keys; only new
sessions receive the new definitions. Completed sessions remain immutable.

The Home has no clickable parent card, but asynchronous React busy state does
not synchronously exclude competing handlers. Its navigation handlers also lack
a shared guard, and buttons can implicitly submit an enclosing form. Fix the
action boundary first, then add the V2 content and structured editors.

## Implementation

- Quick Writing and Deep Authoring expose all six programs. Home claims actions
  synchronously, prevents implicit form submission, and excludes competing
  creation/navigation, including source-dialog double clicks.
- New definitions use `2026-09-21`; all three `2026-09-20` resources are unchanged.
- Recovery BASE and connected Reality/Future writing use integrated editors.
- Future stores 6–8 goals with stable IDs, ordering and five deep-dive fields.
- Past stores seven epochs with up to six experiences each. Event, effects and
  Critical stages edit the same nested answer; deselection preserves writing.
- Review requires an owned, completed Recovery/Reality/Future/Past source. It
  writes a separate session and report with source identity/date. Focus has one
  required and two optional fields. Source sessions remain immutable.
- Reports resolve virtual Goal/Past sections from their canonical answer and
  preserve raw writing. Existing Recovery export accepts the integrated BASE.

## Targeted validation

- Backend: 16 Authoring service tests plus one live DEV PostgreSQL integration
  test passed. The integration test rolls back all fixtures and exercises all
  six completion snapshots, nested JSONB round trips and Review source equality.
  The focused Review test also passed after the final three-focus assertion.
- Frontend: 14 focused tests passed, covering competing Home actions, all six
  new-start paths, source-dialog double clicks, resume, retained drafts,
  serialized autosave, stable goal reorder, Critical deselection and reports.
- Authoring/global-tab focused ESLint passed. Production Next build and its
  TypeScript check passed. No broad project regression suite was run.
- Browser: local production frontend on 3106 + DEV backend on 8086. All six
  entries; Quick start/completion/report/exit; Recovery BASE refresh and Home
  resume; Reality integrated writing refresh; Future Goal/Deep Dive refresh;
  Past event/effects/Critical deselection and reload; Review source read-only,
  independent save, three Focus fields and completed report passed. Console
  error log was empty. Full source-session equality also passed after Review.
- Browser uses the repository's existing DEV user provider and real DEV DB
  owner context. This is not a PROD/JWT login test. No authentication settings
  were changed.
- Flyway validated 47 migrations; DEV schema remained V47. No migration added.
- Nine exact smoke-session IDs (including the user's two explicitly disposable
  trials) were identified for cleanup; no pre-existing Authoring sessions were
  present at smoke start. Cleanup uses owner/ID/version/time guards.

## Boundaries

Past stops at Critical 10 and Report V1; later source questions are unavailable.
Quick's start-action CTA returns to Home for the user to act; no scheduler or
task is created. Review excludes Quick/Review as source candidates. OPS Recovery
application remains unavailable, with the existing structured export retained.
No LLM interpretation or rewriting is added. PROD: NOT DEPLOYED by this task.
