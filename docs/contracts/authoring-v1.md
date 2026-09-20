# Authoring V1

AUTHORING is a top-level POS system, independent of OPS. Recovery, Reality, and
Grounded Future share one quiet section-based runner. Review and Past appear only
as inactive Coming Later entries. No AI analysis, CMS, analytics dashboard, or
permanent reference panel is included.

## Canonical content

The content source is `Kafka_AI_WorkSpace / 10_POS / 08_AUTHORING`:

- [Index](https://docs.google.com/document/d/1znP2pejloM69tmNl153rpFRu52NLjdvu2Z6HgfGni_M/edit)
- [Recovery](https://docs.google.com/document/d/1u4Gf1L_xfiqYr0VMoF-5f5VFGRYoFG4E1kX2jv3GpyQ/edit)
- [Reality](https://docs.google.com/document/d/1IvhhixpY_rp_hU84jMVpUEQrFm_rw17XnWCy6EcXt_U/edit)
- [Grounded Future](https://docs.google.com/document/d/14GL7Nb93xy1gNKO9K-gNYFIQRl06N_RGeI4d2rt4Edw/edit)

The checked-in executable definitions are under
`backend/src/main/resources/authoring/{programKey}/2026-09-20.json`, transcribed
from the September 20 source revisions. They preserve section order, question
wording, choices, instructions, and stopping rules. Future Timeline groups its
canonical subprompts into three long-form responses, one per time horizon, with
every subprompt visible above its writing surface and in Full Content View.

Definitions include stable keys, version, source URL, sections, typed questions,
minimal completion keys, stopping rules, and report mappings. They are not a CMS.
New content revisions require a new version and a registry update; existing
sessions retain their frozen definition. The frontend receives definitions from
the API, avoiding a second content copy.

## Session and report storage

Flyway `V40__create_authoring_sessions.sql` adds `authoring_sessions`, scoped by
`user_id` with RLS enabled. JSONB columns hold `definition`, `answers`, and
`report`. Other columns record program/spec version, status, current section,
source session, timestamps, and an optimistic version. A composite foreign key
prevents cross-owner source references. The Spring service checks current-user
ownership for every read/write and applies version-conditional SQL writes.

Answers: FREE_TEXT/string; SINGLE_SELECT/string; MULTI_SELECT/string array;
SCORE/{value,memo}; CLASSIFICATION/array of {text,classification,timing,memo}.
Empty and partial drafts are valid. Unknown keys, options, fields and invalid
shapes are rejected. Scores are integers 1–10 or null. Completion checks the
definition's minimal closing fields, all written classification rows, and MUST
timing. The UI presents the canonical stopping rules for explicit self-check;
it does not infer whether free prose actually satisfies reflective conditions.

Completion atomically freezes a report and completed timestamp. Completed
sessions have no editing/reopening endpoint. Raw answers remain available.
Reports contain labeled typed sections and stored scan summaries (average,
top/bottom three in canonical tie order, numeric spread). No thresholds or
psychological scoring are introduced. Historical reports render their persisted
summary instead of recalculating against later presentation logic.

## Routes and API

- `/authoring`: program cards, start/resume, completed history.
- `/authoring/{program}/session/{id}`: runner, restored current section.
- Same path plus `/full`: document review and return-to-section editing.
- Same path plus `/report`: immutable completed report.

These routes participate in POS SystemSwitcher and Global Tabs. Runner/full/
report share one logical tab identity. Only route identifiers enter tab storage.

All endpoints are under `/api/authoring`:

| Method/path | Contract |
| --- | --- |
| GET `/programs` | Current active definitions |
| GET `/sessions` | Owner's summaries ordered by update time |
| POST `/sessions` | `{programKey, sourceSessionId?}` |
| GET `/sessions/{id}` | Session, frozen definition, answers, report |
| PUT `/sessions/{id}` | `{expectedVersion,currentSectionKey,answers}` |
| POST `/sessions/{id}/complete` | `{expectedVersion}` |
| GET `/sessions/{id}/recovery-export` | Completed Recovery's read-only export |

Autosave reuses the shared serialized 800ms/IME-aware queue. Section changes are
queued with answers; shell navigation/full view/completion flush the queue.
Responses advance versions without replacing newer input. Failed drafts remain
in memory and per-tab sessionStorage, with retry and unload protection. A
conflicting server version is compared explicitly before choosing current input
or server content; it is never silently overwritten. Browser refresh restores
pending input only after the owner-scoped server read succeeds.

## Integration boundaries

Grounded Future can optionally reference a completed Reality session owned by
the same user. Home offers the most recent completion first, all historical
completions remain selectable, and no-reference start is supported. The reference
opens in a temporary modal. It never automatically populates Future answers.

OPS owns Recovery Protocol. No stable OPS persistence/API exists in this revision.
Authoring exposes export contract version 1 with source identity/version/date,
level, axis, MUST, minimumOperatingState, firstAction, today, tomorrow, and notYet.
It is also downloadable as JSON. `opsAvailable:false` is explicit; the apply-to-
OPS button is disabled. No OPS state is created or reported as successfully applied.

## Validation

Targeted backend tests cover all programs/types, version conflicts, immutability,
ownership, references, completion and export. The opt-in PostgreSQL integration
test uses `DEV_DB_*` and `APP_DEV_USER_ID`, applies no migrations, rolls back all
writes, and verifies cleanup. Browser smoke must run only against DEV.

```text
backend: gradlew test --tests com.kafka.backend.authoring.*
frontend: npx tsx --test lib/authoring/authoring.test.tsx app/authoring/AuthoringSession.test.tsx lib/notes/reflection-autosave.test.ts lib/globalTabs.test.ts
frontend: npx next typegen && npx tsc --noEmit
frontend: npx eslint app/authoring lib/authoring lib/api/authoring.ts
frontend: npm run build
```

DEV verification on 2026-09-20 passed: 10 backend tests (including the real
PostgreSQL rollback integration test), 15 frontend tests, TypeScript, focused
lint, production frontend build, and packaged backend startup with Flyway at
V40. Browser smoke covered Recovery start/autosave/refresh/full view/completion/
report, Reality completion, Future with and without a Reality reference, and
desktop/mobile layouts. Four explicitly marked browser fixtures were removed
after verification. No production deployment was performed.

Visual direction follows all seven `docs/assets/authoring-sys` references while
using existing POS shell, Button, tokens and native accessible controls. The
reference PDF action is outside requested V1; structured JSON export is provided.
