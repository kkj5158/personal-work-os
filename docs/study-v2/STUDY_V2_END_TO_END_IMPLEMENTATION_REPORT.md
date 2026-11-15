# POS STUDY V2 — consolidated implementation and verification report

Date: 2026-11-15, Asia/Seoul. One continuous Foundation V1 + V2 implementation task. This report supersedes the historical V1 report's deployment status; it does not rewrite that report or claim global regression-suite success.

**Implemented and deployed to DEV. Real Codex CLI generation, private PDF-pair publication and authenticated hosted browser journeys were exercised. No PROD deployment/migration or paid AI API was performed by this task.** Unattended laptop startup is not installed, literal logout/login and physical camera/printing are unrun, and semantic correctness still requires explicit review.

## Scope, sources and authority

The owner's current request authorizes implementation, tests and gated DEV release. The attached specification supplies requirements, not additional permission to access unrelated sources, deploy PROD, create paid AI usage or weaken controls. The current V2 request supersedes the earlier V1 exclusions for indexing, generation, rendering and scheduling. Email, re-OCR and automatic grading remain disabled/outside the active pipeline.

Main input: `POS_STUDY_V2_END_TO_END_CODEX_IMPLEMENTATION.md`, SHA-256 `d2152a3dc0ab3a6654910db49986dfb3e84b1498ccebef561401502e87c059c2`. Reviewed PR #8, current STUDY UI/StudyDataPort, backend/auth/storage, V104 and newer migrations, repository V1 reports/contracts, current `agent` policies, owner AGENTS instructions, and TEAM KAFKA canonical policy document `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU` (updated 2026-10-25). Browser work used the designated guarded TEAM KAFKA Playwright profile and retained signed-in session. Optional historical Drive references were not new requirements because repository equivalents were present.

The primary checkout's dirty work and `.claude/settings.local.json` were preserved. Work ran in the existing isolated `study-backend-v1-20261109` worktree. No other task's process, service pin, PR or files were reset. A concurrent Sleep DEV change was integrated rather than replaced.

## Code and release identity

Repository: `kkj5158/personal-work-os`; target branch `dev`.

| Change | Identity |
|---|---|
| Original foundation PR | [#8](https://github.com/kkj5158/personal-work-os/pull/8), previously draft at `b14b3e24c9b9bce5ee36561bda0704c5c2193c8f`; reconciled, updated and merged |
| Initial refreshed DEV base | `92c2e7a08e22927eee614f95f7b75927e2690f81` |
| Foundation/latest-DEV reconciliation | `aeef6f4775d551fcdcf59f71daeed5dd5dac2c7f` |
| V2 core implementation | `c887fff2779d0a3b1ab29a84d50f186a57b45b9f` |
| Scheduler isolation and DEV audit | `2f5ccf993399187a12a8d7cfea98eb85f31adacf` |
| PR #8 DEV merge | `82325a7eeddad58a08ad993d9d4e00283da9a5f6` |
| Explicit worker download/UI corrections | [#16](https://github.com/kkj5158/personal-work-os/pull/16), merge `db2906020b5cef27fd5e6434206bed60282b444a` |
| Concurrent Sleep upstream preserved | `91d83697bc564181f4235576d4232f76941e4758` |
| Count/grounding hardening | [#18](https://github.com/kkj5158/personal-work-os/pull/18), merge `f317522bbe5b5cfd3a5b656c434647b286ed003b` |
| Draft concurrency and immutable reissue | [#19](https://github.com/kkj5158/personal-work-os/pull/19), merge `d980e27c1fba27cec1680d6ed2a30422b22fc66b` |
| Approved options, warnings and durable reload | [#21](https://github.com/kkj5158/personal-work-os/pull/21), implementation `070795b`, integrated candidate `142ead5a096063495e6d88c46dc1368a51b73569` |
| Concurrent ORBIT/MONEY upstream preserved | `33e406e1d4f4409503ea8e75918d9d34821fa46d` |
| Loading/authentication race fix | [#22](https://github.com/kkj5158/personal-work-os/pull/22), implementation `eee0cc7`, integrated/tested candidate `71dd47c80b37aaa264d482425cebf19b4b453659` |
| Final code DEV merge / deployment source | `f6e0d09bdfabeac460f220460989330b8514857d` |
| Tested/deployed backend tree | `93c086892954434d022425e51cd4e23b5b3e7bb7` |
| Tested/deployed frontend tree | `e3efa21bf8d5afa7631377f8efb9efafded428d3` |

DEV project/environment: `2b52b232-38b2-44b6-b97e-4caba54f90bc` / `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`.

- Web: [DEV STUDY](https://workflow-web-development-development.up.railway.app/study). Service `b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae`; final deployment `dbb1b9f9-ede4-4b41-bfb5-0d6cc9afe403` — SUCCESS.
- API: `https://workflow-api-development-development.up.railway.app`. Service `eba7d263-7dc3-448a-a6b8-c2994721b597`; final deployment `bdb6ed91-60f6-4a80-af01-d5db8b6d43e7` — SUCCESS.
- API keeps its existing automatic DEV branch source without a commit pin. Only the Web's DEV source pin was updated through the official Railway API/CLI under the shared release guard. No unrelated staged patch was committed.
- DEV flags: storage enabled, engine enabled, hosted test adapter false, Flyway out-of-order false. Paid adapter and email remain disabled. The owner's schedule ends OFF at proposed Sunday 20:00 KST.
- This task did not mutate PROD. Other concurrent tasks' PROD activity is not represented as a global freeze.

Release acceptance above is a timestamped observation at 03:38 UTC. After the shared guard was released, concurrent ORBIT follow-up `9f3293b` advanced DEV and was preserved in the documentation branch. It does not change STUDY sources; the named f6e0d09 acceptance/deployment and test evidence is not silently relabeled as verification of another task's later changes.

## Implemented pipeline

| Capability | Result and important boundary |
|---|---|
| Foundation persistence | Normal owner JWT, PostgreSQL, owner-scoped records/files, immutable bindings, drafts/submissions, private answers and manual pair publication retained |
| Material ingestion | Existing embedded OCR text only, hash-verified private originals, page checkpoints, Korean/English excerpts, bounded search, quality flags, textless/garbled exclusions; no fabricated page labels |
| Weekly planning | Frozen typed plan, effective date-window policy, source/hash/version, goals/interests, new/review/application mix, actual submitted source evidence, explicit empty-history fallback and prerequisite source ordering |
| Generation | Outbound scoped local worker; real authenticated Codex CLI and optional local-only Ollama adapter; no paid API fallback, inbound laptop port or owner JWT in the worker |
| Validation | Existing renderer schema, kind/count/options, binding/order, exact source quotes, stale/foreign source rejection, distractor/rubric/follow-up structure, normalized duplicates and honest time warnings; success stays needs_owner_review |
| PDFs | Same immutable online data, deterministic PDFBox rendering, A4 Korean font subset, wrapping/pagination/handwriting room, exact metadata, two private immutable objects verified before one publication transaction |
| Recovery | Durable INDEX/PLAN/GENERATE/COACH/RENDER state, leases/heartbeats, expiry recovery, bounded retries/cancellation, first-file checkpoint reuse, missing/wrong/partial pairs remain unpublished |
| Sunday automation | Persistent configurable KST evening schedule, next-run preview, duplicate suppression and restart catch-up; offline model worker leaves queued jobs; explicit approval is still required to publish |
| Coach | Real CLI interpretation into learning question/general feedback/policy change/correctness dispute; typed diff/scopes, approval/rejection, effective/expiry windows and append-only rollback |
| Existing UI | Five tabs and wide workspaces preserved; minimal indexing/jobs/goals/worker/schedule tools; idle refresh preserves optimistic drafts; background appends do not invalidate unrelated learner revisions |
| History/reissue | New same-question version/PDF reissue invokes no model and requires fresh review. Old answers, bytes, policy snapshots and version bindings remain unchanged |
| Resource/cost limits | 100 jobs/rolling day, 300/rolling seven days, 14 jobs/worker invocation, 8-minute/1.5 MB model output bound, three automatic and three manual retry increments, private file quotas and bounded PDF parsing |

The font is OFL NanumGothic, pinned to Google Fonts revision `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe`; font/license SHA-256 verification runs during build. No standalone font binary is committed or delivered. Embedded PDF subsets are part of the rendered documents.

| Area | Implemented / isolated tested | Hosted DEV tested / deployed | Blocked or deferred |
|---|---|---|---|
| Foundation/auth/private storage | Yes / yes | Yes / yes | Literal logout/login unrun; retained owner session verified |
| Index/search/planner | Yes / yes | Native upload/index/search and real plans / yes | No re-OCR or invented prerequisite graph |
| Real question generation | Yes / yes | Real one-day + seven-day + case-policy jobs / yes | Always-on laptop worker startup not installed |
| Validation/PDF publication | Yes / yes | Reviewed real paired PDFs + native manual pair / yes | Independent semantic certification is not claimed |
| Drafts/submissions/history/UI | Yes / yes | Reload, native files, mixed/exact-version coverage, desktop/mobile / yes | Physical camera and printer not exercised |
| Sunday/recovery | Yes / deterministic triggers and failure simulations | Toggle/time/preview/offline status / yes | Future live Sunday not waited for; schedule ends OFF |
| Coach policies | Yes / yes | Real interpretation, approval, future-policy batch, manual rejection/rollback / yes | Opposite feedback's second model interpretation unrun |
| Email/paid APIs/PROD | Explicitly disabled or outside scope | Not activated | Deferred pending separate authority/configuration |
| Final cleanup | Exact object/process/token cleanup verified | Worker tokens revoked; QA material excluded | Retained stopped synthetic DB folders prevent full worktree removal |

## Database and storage verification

Initial shared DEV had V100–103 and V105, with V104 missing and no STUDY tables. The unchanged V104 was intentionally applied once out of order, then additive V106. The temporary setting was removed and later deploys ran with out-of-order false. No repair, down migration, reset or checksum edit was used.

- V104 checksum: `999532025`; unchanged Git blob `13484491e9e820080113f3776c5b9efcaa89655f`.
- V105 existing checksum: `219597664`.
- V106 checksum: `-1682256012`.
- Eight STUDY tables exist; V106's four engine tables have owner relations/indexes and RLS with no browser policies.
- The original private provider, DEV environment fence and STUDY namespace were reused. Bucket visibility, global CORS, credentials and unrelated schema were not changed.
- Read-only migration/table audits are evidence, not a claim that a complete unrelated-data hash comparison was performed. Historical immutability is verified with targeted byte/binding assertions and hosted exact-version records.

## Hosted authenticated DEV journey

All hosted records below are self-authored synthetic QA, not the owner's books or production data.

1. Native browser registered `STUDY V2 QA 20261115 - Synthetic source`, material `724c9034-0c8f-4d5d-89cf-5f218f2209ca`, and uploaded a four-page Korean/English text-layer PDF. Reload, private source retrieval, four page indexes and search passed.
2. Actual Codex COACH job `77ea5fd8-ff2b-401f-a170-b7dad2a1c425` interpreted the technical-explanation complaint. Its intuitive-explanation proposal required explicit approval; policy v2 applied from 2026-11-16 while the 2026-11-15 workbook retained policy v1.
3. Actual one-day job `e35fb52c-2146-4e1c-8a70-701d27c4fecd` recovered from two rejected empty-required outputs after schema hardening. It produced 6 required + 2 extension questions, private keys and a reviewed, verified real PDF pair.
4. Actual seven-day Codex batch for 2026-11-16–22 completed all seven days. Each has 6 required + 2 extension questions, policy v2, explicit QA review and a published v2 question/answer pair. The isolated seven-day fake-adapter test is separate and is not used to claim this hosted real-model result.
5. A schema-comment title in the first daily output led to provider-facing array aliases and server-owned source-derived titles. Existing v1 was preserved. Same-question v2 reissues (2026-11-15–22) retained keys/questions, invoked no AI, required fresh review and published new pairs. Older unissued candidates are retained/cancelled rather than deleted. Time/semantic warnings remain part of the contract.
6. Reload restored an online radio draft; online submission saved one covered question. Native handwritten PDF upload and overlapping six-question submission persisted after reload. History shows **6/6 required, online + handwritten; extension 0/2**, two ungraded v1 attempts and a private downloadable original. The uploaded PDF was explicitly a synthetic scan stand-in; no physical handwriting, camera capture, OCR or grading is claimed.
7. Native browser also imported `study-v2-manual-qa-20261115` and uploaded its matching question/answer PDFs. Actual byte/metadata validation and manual pair publication passed.
8. Native downloads of `study-2026-11-15-v2-question.pdf` (55,454 bytes) and answer (84,105 bytes) were observed. Hosted samples in this evidence set are those actual downloaded bytes. Ordinary snapshot checks found no answer/rubric/follow-up payload. Automated tests cover pre-review answer denial and owner isolation.
9. Desktop 1440-wide solver occupied about 1193 px; mobile 390 px had no horizontal overflow and zero solver dialogs. Screenshots are included. A browser focus issue was resolved by bringing the designated tab to the foreground; no personal Chrome fallback was used.
10. Actual Codex job `b9d9ae89-b4cc-41a1-8c24-12e8d97a187d` used approved policy v3 and produced a future 2026-11-23 v2 with **three five-option MCQs + two required cases, plus two extension cases**. Both real PDFs published after review. Earlier v1/v2 packages and attempts retained their original formats/policies. A manual proposal was rejected; rollback appended policy v4 restoring v1 defaults for future planning. The opposite free-text feedback remains stored; no second AI interpretation of that feedback is claimed.
11. The final durable-file check created one independent v2 handwritten attempt (1/6) and reloaded without an unsaved-file dialog. The two v1 attempts still show 6/6 in the exact v1 solver. Native re-download of the older attachment matched the original SHA-256 `1f37292a4a4a12b86d6ed3b172e64a0a6e452b4e9b63682b528fb51281cbaf4f`.
12. A fast loading/action race was reproduced, recovered through the normal retry UI and fixed with ready-state controls plus a regression test. An intentionally unauthenticated private-PDF fetch returned 401. These expected negative tests are not reported as unexplained console failures.

Synthetic content was reviewed by the implementing agent for QA. It is not represented as the owner's pedagogical approval or as an independent certification of every generated fact. The small fixture intentionally yields related concepts across days; normalized duplicate checks are stronger than semantic novelty guarantees. Extension estimates of 14 minutes versus a 30-minute target are visible warnings, not a measured promise of duration.

## Automated and broader test evidence

| Check | Observed result |
|---|---|
| Final owned PostgreSQL / storage / auth / migration suite | **64 passed, 2 optional skipped**, run `study-foundation-aaceedc0-4aca-42cd-915b-077d8fd3d927` on the latest integrated candidate; all owned ports released |
| Worker adapter/transport/schema tests | **8 passed**, including disabled paid provider, false preservation, outbound lease transport, aliases and five-option schema |
| Final affected frontend + global tabs | **29 passed**, including the new authenticated-loading race regression; pre-existing React act warnings remain |
| TypeScript / scoped ESLint / Next production build | **PASS**; existing multiple-lockfile workspace warning remains |
| Real model PDF glyph reproduction | **PASS** separately; optional captured-output test is normally skipped |
| Isolated provider end-to-end | Full fresh Flyway/JPA, real private provider, real Codex one day, seven test-only days, drafts/attempts/policies/pairs **PASS**; 21 exact owned assets cleaned; all owned ports released |
| Earlier broad backend candidate | **1553 total: 966 passed / 4 failed / 583 skipped**; before last fixes, not a final full-suite certification |
| Full frontend candidate | 191 files attempted; **timed out at 300 seconds**, no complete suite summary; not PASS |
| Refreshed upstream reproduction | On unmodified latest concurrent DEV base `33e406e1d4f4409503ea8e75918d9d34821fa46d`: same four backend context/initialization failures; selected frontend **21 total / 18 passed / 3 failed** |

Backend inherited failures are `BackendApplicationTests.contextLoads`, `GoogleSleepPostgresTest`, `SleepAutoSyncPostgresTest`, and `SleepNapPostgresTest` initialization in the no-DEV-datasource broad environment. Frontend inherited failures are `calendarEditor`, `TaskDetailPanel`, and `TodayWiki`; `safeRedirect` passed. Earlier `92c2e7a` and `91d8369` reproductions are retained, but the refreshed `33e406e` reproduction is the latest unrelated upstream comparison. No claim is made that unrelated broad suites are green.

The final targeted backend run was executed on `71dd47c` with only untracked documentation/evidence and its local collection helper; the committed application trees above match the final code merge. Frontend checks include the final durable-submission and loading changes after integrating ORBIT/MONEY. Documentation/evidence changes do not alter those application trees. The earlier broad execution did not capture an exact final-source manifest and is therefore reported only as an earlier integrated candidate.

## Limitations, activation and follow-through

- The local CLI worker was actually run in bounded foreground invocations. It is not an installed always-on service. The owner can issue a fresh scoped connection file and use the included Windows startup guide; an unavailable laptop/expired token leaves honest queued jobs. No password or unattended login was installed.
- Literal sign-out/new sign-in was not executed because the designated owner session was healthy and shared with concurrent work. Retained owner JWT authentication and reload persistence were verified. No session export, password collection or auth bypass was used. Physical camera capture and actual printer output were not exercised; native file upload, A4 layout and PDF downloads were.
- Semantic answer correctness, ambiguity, numerical applicability and analogy quality need review. The system exposes structural/source checks and explicit approval rather than presenting model self-review as certainty.
- A real future wall-clock Sunday was not waited for; deterministic trigger, duplicate, catch-up/offline/retry and KST boundary tests cover it. The hosted schedule toggle/time persistence and preview were tested, then disabled.
- No live Ollama model, paid adapter, external work integration, vector database, email sender, re-OCR or automatic grading was activated. These are not hidden prerequisites for current workbook publication.

QA cleanup: all three issued worker rows were verified revoked by the normal hosted API; four exact credential files (three native downloads and the protected worker copy) were removed after identity checks. The self-authored material is excluded from future generation (metadata v2); seven superseded unpublished candidates were cancelled. Published synthetic QA records, private files and policy audit history remain intentionally retained. The schedule is OFF and no worker invocation is running. The isolated provider run deleted its 21 exact owned assets; owned runtime/test ports were released, and the foreign Sleep PostgreSQL on 55449 was preserved. The owned shared release guard was released and its lock-file absence verified. Task branch/documentation cleanup is recorded in the delivery receipt. Full worktree removal remains blocked by the required retention of previously policy-blocked synthetic DB folders; those folders were neither moved nor deleted.

An earlier automatic approval review rejected recursive deletion of owned synthetic PostgreSQL directories as “blocked by policy.” That deletion was not retried or routed around; the stopped synthetic folders remain local and are excluded from the evidence archive.

## Handoff and delivery

Use `STUDY_V2_ENGINE_CONTRACT.md` for HTTP/plan/worker/validation/publication contracts and `STUDY_V2_OPERATIONS.md` for startup, Sunday operation, recovery, rollback and cleanup. Main code is under `backend/.../study`, `frontend/app/study`, `frontend/lib/study`, `ops/study-worker`, additive V106 and owned QA harnesses. This is the requested consolidated implementation report; the other documents are supporting contracts/runbooks.

Evidence contains sanitized run summaries, real hosted state checks, self-authored source/manual/model samples, sample PDFs, all-page rendering checks, screenshots, revision/deployment identity and a SHA-256 manifest. It excludes tokens, environment secrets, browser profiles, full database folders/dumps, standalone fonts, unrelated personal data and dependency trees.

Final reports and evidence are delivered individually and in a dated ASCII-named archive to Kafka_AI_WorkSpace (`hello@studio-kafka.com`) / 10_POS / [STUDY_V2_END_TO_END_20261115](https://drive.google.com/drive/folders/1JvAGb6YAm--apIEWALjn0Ly7L4BV_78i). Observed file links, metadata sizes and Markdown readback checks are recorded in STUDY_V2_DRIVE_DELIVERY_RECEIPT.md after upload. The folder link alone does not establish cross-account access; permissions were preserved. Local copies are retained alongside the repository delivery record.
