# Authoring V2 implementation

Baseline: dev `8a707e6` (2026-09-21). Scope: DEV only.
Integration refresh: R3 `565cef0`, merged without conflicts in `d8bcedf`.
Authoring implementation commits: `8b824f6`, `fcfa5f2`, `67b1bbd`, `d867355`.

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
- After the R3 shared-tab refresh, all 26 Authoring + global-tab model/component
  tests passed and the integrated production frontend build/TypeScript passed.
  One existing shared-tab test emitted a non-failing React `act` warning.
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
  trials) were deleted after verification; no pre-existing Authoring sessions were
  present at smoke start. Cleanup used owner/ID/version/time guards and an
  explicit transaction; the empty Authoring list was verified in the browser.
  Owned test servers and browser tab were stopped after smoke.

## Boundaries

Past stops at Critical 10 and Report V1; later source questions are unavailable.
Quick's start-action CTA returns to Home for the user to act; no scheduler or
task is created. Review excludes Quick/Review as source candidates. OPS Recovery
application remains unavailable, with the existing structured export retained.
No LLM interpretation or rewriting is added. PROD: NOT DEPLOYED by this task.

## Responsibility program (자립과 책임 글쓰기)

Key `responsibility`, definition `authoring/responsibility/2026-09-23.json`,
Deep Authoring group. The theme is fixed (social and economic responsibility,
independence, commitments to others, and the joy and meaning of that life);
only the situation varies, stored per session as the `situation` answer. There
is one definition for every situation; no topic framework was added.

- Flow: an unnumbered preparation step (`situation`) and seven sections in
  order `current_share`, `adult_agency`, `social_commitments`,
  `economic_independence`, `joy_and_meaning`, `difficult_moments`,
  `responsibility_commitment`. Sections 1–6 each have one FREE_TEXT editor with
  the supporting questions as read-only helper text. Section 7 has six FREE_TEXT
  fields: `acceptedResponsibility`, `socialPrinciples`, `economicStep`,
  `joyMeaning`, `difficultyResponse`, `firstActionAndReview`.
- Completion requires `situation` and the six closing fields (any nonempty text,
  including “아직 정하지 못함” or “확인 필요”). Sections 1–6 stay optional.
- Runner support is generic and opt-in through question metadata: `gate` marks
  a first-section question that must be answered before later sections open and
  turns that section into an unnumbered “준비” step; `context` shows the answer
  as a collapsed summary on later sections; `placeholder` renders an example
  that is never saved. Programs without these keys are unchanged.
- Definitions gain optional `subtitle` (Home card) and `reportTitle` (report
  heading, here “나의 자립·책임 약속”). Frozen definitions without them read as null.
- Report: situation, then the six closing fields (joy/meaning included), then
  the raw writing of sections 1–6. Built by the existing `reportSections`
  snapshot; no report code changed. The program is an eligible Review source.
- No migration: `program_key` is unconstrained and answers are JSONB.

Validation (2026-09-23, commit `fcdabb2`): `AuthoringServiceTest` 18/18, focused
frontend tests 24/24, `tsc`, focused ESLint and production `next build`
passed. DEV browser smoke on the real DEV database covered the Home card,
the situation gate, rapid section changes, refresh, completion right after the
last closing edit, report reload, a second session with a different situation,
duplicate-click New Start and Review source listing. Its three sessions were
deleted by exact ID.

## Home groups and Library

Every current definition declares `group`: `QUICK`, `CORE` or `TOPIC`;
`AuthoringDefinitions` rejects any other value at startup. Home renders
Quick Writing, Core Authoring and Topic Authoring in that order from
`authoringGroups` (`frontend/lib/authoring/types.ts`) and registry order, so a
new Topic program only needs `"group": "TOPIC"` in its definition. Frozen
session definitions may lack `group`; UI grouping always uses the current
`/programs` registry. No migration.

`/authoring/library` lists every owned session from the existing
`GET /sessions` with status, program and program-name filters and
updated-time sorting. Rows (`SessionRow`, shared with Home's five-item recent
list) reuse the existing runner, full and report routes. The sidebar
(`AuthoringSidebar`) has Home and Library; Library is its own AUTHORING tab.

## Korean names, grouped Library, session title and memo

Visible program names live in each current definition's `title` (다시 시작하기,
삶의 중심 되찾기, 지금의 삶 들여다보기, 앞으로의 삶 설계하기, 나를 만든 시간들,
변화와 방향 돌아보기, 성중독과 삶의 회복 - 자유롭고 온전하게 살아가기,
자립하는 삶, 책임지는 삶). Program keys, routes and frozen definitions are
unchanged; `Session.programTitle` returns today's name, so older sessions also
show it. Home groups read 빠른/핵심/주제 글쓰기.

Library has no program dropdown. It renders group → program → session for
sessions matching the status filter and a search over title, memo and
program name; empty groups and programs are hidden.

`V49__authoring_session_title_memo.sql` adds nullable `title` (one line, max 200)
and `memo` (max 5000). They are session metadata, never answers or report
content. In-progress sessions save them with the answers through the existing
`PUT /sessions/{id}` autosave queue. Completed sessions use
`PUT /sessions/{id}/metadata` (`expectedVersion`, `title`, `memo`), which bumps
the version and `updated_at` but leaves answers, report and `completed_at`
untouched. Blank values are stored as null; legacy rows need no backfill.

## Content revision (2026-09-24) and Library shelves

All eight programs have a `2026-09-24` definition; the registry serves only
these to new sessions. Content versions: 다시 시작하기 V2, 삶의 중심 되찾기 V3,
지금의 삶 들여다보기 V3, 앞으로의 삶 설계하기 V4, 나를 만든 시간들 V2,
변화와 방향 돌아보기 V2, both Topic programs V2. Each stage asks one concrete
question with a short guide. Reports reuse the authored answers and lead
with the practical result (first action, plan, standards). No removed
field is asked for again.

- Sections may carry a `prompt` shown above several labelled fields (Reality
  and Review decisions, the Topic plan A/B stage).
- GOALS reads `minItems`/`maxItems`/`requiredFields`/`plan`/`planGuides` from
  metadata. New Future sessions use 1–5 goals with one `plan` field each.
  Definitions without these keys keep the 6–8 deep-dive rules.
- Past EXPERIENCES/EFFECTS read `itemPrompt`/`itemHelp`; the new Past
  completion requires only the seven epoch names, so highlights are optional.
- Recovery triage uses 지금 처리하기 / 나중으로 미루기 / 이번에는 내려놓기. The
  export counts 지금 처리하기 rows as `must` and leaves removed fields (level,
  axis, today, tomorrow, notYet) null instead of inventing them.
- Responsibility keeps a compact, required `situation` in its first stage with
  no separate gated step; its report no longer uses a pledge title.

Existing sessions keep their frozen definitions. Old drafts resume on their
original stages, completed reports are unchanged, and older Reality reports
still work as a Future or Review source.

Library body is three full-width shelves (빠른/핵심/주제 글쓰기). Each shelf
contains program blocks in an auto-fit grid (two columns on desktop, one on
mobile). A block shows its record count and latest update. Rows show the
custom title, or `YYYY.MM.DD 작성` when untitled, and blocks with more than
three records expand inline. Unfiltered, empty shelves stay with a short
note; status or search filters hide empty shelves.
