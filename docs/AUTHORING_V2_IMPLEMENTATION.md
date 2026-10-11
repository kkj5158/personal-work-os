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

## 지금의 삶을 누리기 (present-life), content V1

Source: Drive `25_SPEC__PRESENT_LIFE_AUTHORING` (V1, content lock 2026-09-24).
Key `present-life`, definition `authoring/present-life/2026-09-24.json`, group
CORE, registry position between `reality` and `grounded-future`.

- Seven stages: six writing stages, then 묵상을 마치며. Each writing stage has
  one editor; 이 삶에 머물러 보기 uses 24 rows. Its ten contemplation prompts
  and closing instruction are helper text, not inputs.
- Optional compact values (`minimumEffort.actions`, `disrupting.avoid/reduce/limit`)
  are short FREE_TEXT fields marked `omitWhenEmpty`. The report hides them when
  unwritten and never derives them from the prose.
- `completionKeys` is empty and no field is required. The SPEC's completion
  criteria are the self-check stopping rules.
- Report title 나의 충분히 좋은 삶; seven sections in SPEC order.
- Eligible Review source. No migration, no program-specific backend code.

## Library wide layout (UI reference V1)

Source: Drive `65_UI_REFERENCE__AUTHORING_LIBRARY_WIDE_V1` (+ PNG), under the
INDEX and 60 Current Policy. Frontend only: no API, schema or migration change.

- The Library main area is no longer the 1300px Home column: width 100% up to
  1760px, 20–32px side padding (16px on mobile).
- A summary strip under the controls counts the whole library at runtime:
  total, 작성 중, 완료, and programs that have records. Filters don't change it;
  a status line shows the filtered count instead.
- Shelves keep Quick/Core/Topic order with a category cue (⚡/🧭/🎯), a short
  description, program and record counts, a collapse toggle and a light tint
  (cream/blue/violet). Program grid: 3 columns from 1440px, 2 from 960px, 1 below.
- Program cues come from `programEmoji` in `lib/authoring/types.ts` (keyed by
  program key, decorative, `aria-hidden`). Home still uses its lucide icons.
- Library rows show a text status badge (작성 중/완료) beside the title and the
  modified time below. Home rows keep the inline status text.
- A category with no records shows one compact note plus 글쓰기 시작하기 (to
  Home), never empty program cards. Filtering still hides empty shelves.

## 반복하고 싶은 현재와 도달하고 싶은 미래 (present-future-identity), content V1

Content defined with the owner on 2026-10-01 (Drive SPEC in `08_AUTHORING`).
Key `present-future-identity`, definition
`authoring/present-future-identity/2026-10-01.json`, group TOPIC, last in the
registry. It uses the shared session, autosave, completion and report code;
no migration.

- Seven numbered parts over fifteen stages: 01, 02, 03, 04-1…04-5, 05-A…05-C,
  06-A…06-C, 07. A section may now carry `label` (replaces the positional
  number) and `part` (group heading in the stage list and eyebrow). Frozen
  definitions without them read as null and keep positional numbering.
- Five identities are one answer, `identities`: exactly five rows
  `{id, name, meaning, description, effort, strategy, adjustment}` with fixed
  IDs. `IDENTITIES` (stage 03) edits name and one-line meaning. Each 04-n stage
  holds one virtual `IDENTITY_WRITING` question (`sourceQuestionKey`, `index`,
  `parts`) that edits that row's four writing fields, so writing cannot move
  between identities. The name is editable on both stages and each part header
  repeats it, because the page scrolls as a whole.
- Every other stage is one question, one guide and one editor. Guide bullets
  and the stage 07 sentence starters are helper text. Stage 02 adds three
  optional compact values marked `omitWhenEmpty`.
- `completionKeys` is empty and nothing is required. A stage's ✓ ignores
  `omitWhenEmpty` values (this also applies to 지금의 삶을 누리기).
- Report: six sections in authored order; each identity item shows its name,
  meaning and four raw texts. No summary, score or inference.
- Eligible Review source (backend whitelist and Home list).

Validation (2026-10-01): Authoring backend tests 27/27 including the DEV
PostgreSQL rollback test; frontend Authoring and tab tests 47/47; focused
ESLint; production `next build`. The full backend suite also ran: every
non-database test passed, and 65 PostgreSQL-backed tests in other suites
failed on the shared DEV pooler's 15-client limit while other local servers
were running. DEV browser run (Chromium, local frontend, DEV backend and
database): 54 of 55 checks passed, covering start, typing then immediate
next, refresh, five identities kept apart, title/memo, Library, continue,
completion, report, full view, rejected late and stale saves, Review source
listing, an existing program, and a 390px viewport. The remaining flag was
the console noise from the two deliberately rejected saves.

PROD (2026-10-01): dev `66d11d1` promoted as prod `4694568`; Railway backend
deployment `21c98ad2-9546-4f13-bcf8-29a2fead8822` and frontend deployment
`ccff85a9-6301-459d-8ae8-7393af940554` both succeeded on that commit. Backend
health UP, unauthenticated API 401, frontend 200. Four minutes later an
unrelated WORK FLOW promotion (prod `7d40656`, which contains `4694568`)
replaced them with backend `5b8a0d0a-cf53-4dda-b37f-3ae75dc96562` and
frontend `bed0ea0e-126d-4b5f-ae04-c835e364c00d`; the smoke below ran after
that deployment was created. Signed-in smoke with one
`[QA]` session: Home card under 주제 글쓰기, start, autosave, refresh
restore, five identity slots, identity 1 and 2 writing kept apart across
next/back and refresh, Library block and program-name search, continue,
full view, completion and Report all passed; an existing 삶의 중심 되찾기
report still opened read-only. Authoring API calls returned 200. Every PROD
page, including `/worklog`, logs one 401 resource error in the console; it
predates this change and was not investigated here. Screenshots and the list
of test sessions left in DEV and PROD are in
`docs/assets/authoring-sys/evidence/present-future-identity-20261001/`.

## 돈을 벌며 살아가는 방식 (earning-a-living), content V1

Content locked by the owner on 2026-10-02 (Drive SPEC
`90_SPEC__EARNING_A_LIVING_AUTHORING` in `08_AUTHORING`). Key
`earning-a-living`, definition `authoring/earning-a-living/2026-10-02.json`,
group TOPIC, last in the registry (fourth 주제 글쓰기 card). It uses the shared
session, autosave, completion and report code; no migration.

- Nine stages numbered positionally: 01–08 and the close (09, 지금부터 해볼 것).
- 01–03, 05, 06, 08: one main question, one guide, one wide editor
  (`FREE_TEXT`). Guide bullets are helper text, never inputs.
- 04 uses the one new question type, `FIELD_ROWS`: fixed rows declared in
  `metadata.items` (`minimum`, `stability`, `choice`) and optional free-text
  fields declared in `metadata.fields` (`amount`, `reason`, `check`). The
  answer is a list of `{id, <field>: text}`. The backend accepts only declared
  row IDs and field keys and only strings; the amount is free text, so
  "확인 필요" or a range is valid and nothing is parsed, calculated or filled
  in. One written field marks the stage ✓; nothing is required.
- 07 puts the main question and guide on the section (`prompt`,
  `description`) above two separate editors, `support` and `growth`.
- Close: three optional `FREE_TEXT` fields. No task, calendar, reminder or
  MONEY SYS record is created from them.
- `completionKeys` is empty and nothing is required.
- Report: nine sections in authored order. Income levels and their fields
  appear only when written. No summary, score or inference.
- Eligible Review source (backend whitelist and Home list).
- The definition has no `guidance` (프로그램 안내) text because none was locked.

## 나의 성향과 커리어 (career-temperament), content V1

Content approved by the owner on 2026-10-11: Drive proposal
`100_PROPOSAL__CAREER_TEMPERAMENT_AUTHORING_V1` in `08_AUTHORING`, Section D
with the Section F recommended defaults. Key `career-temperament`, definition
`authoring/career-temperament/2026-10-11.json`, group TOPIC, last in the
registry (fifth 주제 글쓰기 card). It uses the shared session, autosave,
completion and report code; no new question type and no migration.

- Seven stages numbered positionally: 01–06 and the close (07, 다음 걸음과
  다시 볼 시점).
- 01–06: one main question, one guide, one wide editor (`FREE_TEXT`). Guide
  bullets are helper text, never inputs. The nested guide items of 02 and 05
  are `·` lines indented with non-breaking spaces, because helper text is
  rendered `pre-line`.
- 03 ends its helper text with the fixed health notice (진단·치료 판단에 쓰이지
  않음, 약·치료 계획을 이 글만으로 바꾸지 않기), so it always shows under the
  guide. No diagnosis is named, and there is no crisis flow, symptom input or
  branching on temperament or diagnosis.
- `guidance` (프로그램 안내) carries the five approved paragraphs; `subtitle`
  and `description` are the approved card texts.
- Close: three optional `FREE_TEXT` fields (`close.firstStep`,
  `close.reviewAt`, `close.question`) marked `omitWhenEmpty`. No task,
  calendar entry or reminder is created from them.
- `completionKeys` is empty and nothing is required. The completion dialog
  shows the six approved self-check sentences.
- Report: seven sections in authored order, raw text only. A close field
  appears only when written. `ReportDocument` now leaves out a section whose
  items are all unwritten `omitWhenEmpty` values, so an empty close has no
  heading; no earlier definition has such a section, so their reports are
  unchanged.
- Eligible Review source (backend whitelist and Home list).
- No LLM call, score, type or suitability rating; answers stay in the session
  JSONB and are not logged.

Released 2026-10-11: feature `37c9480`, merged as dev `db90a58`, and `prod`
fast-forwarded to the same commit. Hosted DEV (Railway Development) API
`3e2fe16e-8a20-4458-9a04-0feb7e64e12c` and web
`f328e92a-bb05-427c-baa2-8a1e62d2395c`, PROD backend
`60f0b03c-e350-46a4-9c40-3897a95c10b9` and frontend
`0456d6d7-2b24-4f22-a96c-c49caceed8ae` all reached SUCCESS on that commit.
The full lifecycle was verified in a browser against a local frontend and the
feature backend on shared DEV (58 scripted checks). On hosted DEV and PROD only
unauthenticated checks ran (health 200, `/api/authoring/programs` 401 without
a token, login gate, the new program key present in the served bundle). The
signed-in PROD smoke passed with one `[QA]` session and is recorded in
`docs/assets/authoring-sys/evidence/career-temperament-20261011/CLOSEOUT.md`.

## 가벼운 몸, 자유로운 스타일 / REN — 매일 몸을 단련하는 사람 / 내가 가지고 싶은 좋은 몸, content V1

Content approved by the owner on 2026-10-11. Three independent programs,
group TOPIC, registered in this order at the end of the registry, after
`career-temperament` (sixth to eighth 주제 글쓰기 cards). They use the shared
session, autosave, completion and report code; no migration and no
program-specific backend logic.

| Key | Title | Definition | Home icon / Library cue |
| --- | --- | --- | --- |
| `light-body-free-style` | 가벼운 몸, 자유로운 스타일 | `authoring/light-body-free-style/2026-10-11.json` | `Shirt` / 👕 |
| `ren-daily-training` | REN — 매일 몸을 단련하는 사람 | `authoring/ren-daily-training/2026-10-11.json` | `Landmark` / 🏛️ |
| `desired-physique` | 내가 가지고 싶은 좋은 몸 | `authoring/desired-physique/2026-10-11.json` | `BicepsFlexed` / 💪 |

- Stages are numbered positionally and end with the close: A has seven
  (`desire`, `body-image`, `wardrobe`, `style-self`, `light-day`, `sustain`,
  `close`), B six (`ren-portrait`, `meaning`, `temple`, `ordinary-week`,
  `return-path`, `close`), C six (`desire`, `ideal-physique`, `enjoyment`,
  `building-way`, `starting-point`, `close`).
- Every writing stage is one main question, one guide and one `FREE_TEXT`
  editor (14 rows; A `lightDay` 24). Guide bullets are helper text.
- Close: `FREE_TEXT` fields with `prompt` as a short label, `helperText` as
  the question, 3 rows and `omitWhenEmpty` (A two fields, B and C one).
- Each definition has `guidance` (프로그램 안내, collapsed on stage 01). B's
  first guidance paragraph is its motto; guidance stays plain text.
- `completionKeys` is empty and nothing is required; the stopping rules
  (A five, B and C four) are the completion dialog's self-check.
- Two optional definition fields were added, null for every other current
  and frozen definition:
  - `Section.note`: a short muted notice the Runner shows below the stage's
    questions, never in the full view or the report. Used by A `sustain`.
  - `Definition.reportEpigraph`: a fixed program phrase shown at the top of
    the Report, set apart from the writer's text. It is read from the
    session's frozen definition. Used by B.
- Report: one section per stage in authored order. An unwritten Close field
  is hidden, and a Close section with nothing written has no heading (the
  shared rule added with `career-temperament`); unwritten writing reads
  아직 작성하지 않음. No summary, score or inference.
- Eligible Review sources (backend whitelist and Home list).
- Program keys are also listed in the session route
  (`app/authoring/[program]/session/.../page.tsx`) and the shell tab pattern
  (`lib/globalTabs.ts`); a new program must be added to both.

Validation (2026-10-11). On the feature commits `4e0f282`, `9d978e8` (base
dev `6f4bb63`): Authoring backend tests 29/29 including the DEV PostgreSQL
rollback test; frontend Authoring tests 40/40 and `lib/globalTabs` 9/9;
focused ESLint; production `next build`. The placed definition files were
compared byte for byte with the approved blocks. DEV browser run (Chromium,
local production frontend, feature backend, DEV database): 221 of 222
scripted checks passed, covering for each program the Home card and icon,
one session from a double click, the full guidance, typing with focus and
layout kept across an autosave, next then refresh, every stage's question,
guide and editor size, the notice on A stage 06 only, title and memo, Library
search by program name, title and memo, 이어쓰기 and 새로 시작, completion with
empty stages (and, for A, with nothing written), the stopping rules, report
order, hidden Close fields, B's epigraph, the completed full view, rejected
stale (409) and late (400) saves, and Review source listing; plus an
`earning-a-living` regression run and 390px Home, Runner, Report and Library.
The one flag was the script counting Next's empty route announcer as an error
alert on an earlier completed report; a separate check confirmed that report
opened read-only with no app error and an unchanged version. A first run
stopped at that same last step because it picked a session of
`career-temperament`, which another branch was testing on shared DEV.

dev then moved to `db90a58` (`career-temperament`), which edits the same
registry, whitelist and test lines. It was merged into the feature branch and
the conflicts resolved by keeping both. On the merged tree: Authoring backend
tests 30/30 including the DEV PostgreSQL rollback test; frontend Authoring
tests and `lib/globalTabs` 52/52; focused ESLint; production `next build`; and a read-only DEV browser re-check
(13/13: fifteen programs and the eight Topic cards in order, icons, the three
completed reports with the empty Close left out and B's epigraph, a
`career-temperament` report, Library block order, 390px Home; no session
created or changed). `components/GlobalTabs.test.tsx` has one failing test that fails the same way
on unchanged dev. Screenshots (taken before the merge, so Home shows seven
Topic cards and an empty Close still has its heading) and the test sessions
left in DEV are in
`docs/assets/authoring-sys/evidence/body-style-topics-20261011/`.
