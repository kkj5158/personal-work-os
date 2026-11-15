# STUDY V2 engine contract

Version: study-engine-v2.1. Date: 2026-11-15 (Asia/Seoul). Extends the Foundation V1 contract; the existing StudyDataPort question/answer binding remains authoritative.

## Access and persistence

Normal owner JWT authentication protects `/api/study/engine/**`; DEV loopback authentication is an isolated testing profile only. Owner IDs are derived on the server. Migration V106 adds `study_engine_jobs`, `study_source_excerpts`, `study_engine_workers` and `study_engine_preferences`. All enable RLS without browser/PostgREST policies. V104 is unchanged. Engine claims/checkpoints use short transactions; PDF parsing, rendering, model execution and object transport run outside owner locks.

Background engine results append immutable records under the owner commit lock without advancing the Foundation user-command revision. This prevents weekly generation/publication from rejecting an unrelated live draft. Actual user commands retain stale-revision conflicts. An idle 15-second browser refresh reveals appended results, discarding responses if intervening input or writes changed the current snapshot; optimistic drafts remain protected.

Workers authenticate only to POST `/api/study-worker/**` with `Authorization: Bearer study_w2_<opaque token>`. Tokens contain 256 random bits, expire after seven days, are stored only as SHA-256 hashes, can be revoked, and bind one owner. They cannot read owner snapshots, private files or other POS domains. The owner issues at most five active tokens. The issue response contains the token once; status responses never contain it. HTTPS is required by the local launcher except for loopback tests. The worker opens no inbound port.

## Source contract

`POST /engine/index/{assetId}` creates/replays an INDEX job keyed by original asset ID, SHA-256 and current material version. The asset must be an owned READY/ATTACHED material PDF. The parser verifies its exact bytes and extracts the existing embedded text; it does not re-OCR or correct the original. Each page and its excerpts commit with that page's checkpoint. Retrying resumes after the last committed page.

Excerpt fields: `id`, `materialId`, `materialVersion`, `assetId`, `sourceHash`, one-based `pageIndex`, `ordinal`, optional actually discovered PDF `pageLabel`, `text`, `quality`, `parserVersion`. The parser version is `pdfbox-3.0.8/text-v1`. Excerpts contain at most 1,800 UTF-16 units; a page is bounded to 100,000 units, parsing to 2,000 pages/12 million units. Quality is `usable`, `needs_source_check` or `textless`; the latter two are excluded from high-confidence generation. These heuristics do not certify OCR accuracy.

`GET /engine/sources/{materialId}/search?q=&page=0&job=<optional index ID>` returns at most 30 excerpts; query length is at most 120 characters. PostgreSQL simple text search plus bounded substring search supports Korean/English. `GET /engine/excerpts/{id}` checks ownership. Full textbook text never enters the global StudyDataPort snapshot. Original hashes/text are preserved, including OCR noise; citations cannot invent printed-page numbers.

## Plan and generation contract

`POST /engine/goals` saves `{goal, interests, weeklyTarget:{new,review,application}}`; percentages must total 100. Only registered interests/materials are used; no unrelated connected work sources are silently ingested.

`POST /engine/plan` accepts `{date:"YYYY-MM-DD",days:1|7,operationId:"UUID"}`. Seven-day plans start Monday. Owner-initiated dates must be today through 90 days ahead. Reuse the same operation ID on uncertain retries; changing its date/day count is rejected. A plan freezes effective policy, source spans/hash/version, goal/interest snapshot, question format, time estimates, source order, prior question prompts (bounded to 40), batch/input identity and prompt version. The default required format is five single-choice and one essay; extension is two practical cases. Approved `case` policy means three single-choice and two cases. Custom approved questionFormat supports every allowlisted renderer type and 1-40 questions/part.

The weekly target defaults to 60% new, 25% review, 15% application. Review references actual submitted question source spans. Without these records, review weight moves to new concepts and `no_history` is explicit. Approximate day-level tags follow weekly proportions; no invented error/weakness analysis or external project context is claimed. Registered source order is the prerequisite fallback when no explicit graph exists.

Each new plan freezes `choiceOptionCount`: four for classic and five for case policy. Provider schema bounds and server validation enforce it for choice questions. Older frozen plans without the field remain compatible; published options are never rewritten.

The generation output schema is executable JSON Schema in `ops/study-worker/schema.mjs`. Its domain shape is:

The provider-facing schema calls the two learning arrays `requiredQuestions` and `extensionQuestions` to avoid confusing the JSON Schema `required` keyword with required learning. Exact planned min/max counts are enforced there. The local adapter converts these names to the canonical domain `required`/`extension` below; unknown fields are retained for server rejection. Each plan also freezes a source-derived `plannedTopic`; imported workbook/PDF titles use this trusted value rather than model commentary. Older pending plans derive it from their frozen material-version record.

```json
{"topic":"...","required":["existing Question objects"],"extension":["existing Question objects"],"keys":[{"part":"required","questionId":"q1","model":"...","explanation":"...","rubric":["..."],"incorrectReasons":{"B":"..."},"followUp":["exactly ten optional prompts"],"answer":"A","citations":[{"excerptId":"UUID","quote":"verbatim source substring"}]}],"provenance":{"provider":"codex_cli","model":"actual adapter identity","promptVersion":"study-engine-v2.1"}}
```

`answer` is one option ID, a unique option-ID array, boolean or bounded text according to question kind. Question versions start at one; ordering is continuous within each part. A question source section contains its cited excerpt UUID and PDF page reference. The strict CLI schema represents optional fields with null; the launcher removes null fields before server validation, preserving false and zero.

Server validation rejects unknown/executable fields, invalid schemas/counts, stale/foreign sources, absent/verbatim-mismatched quotes, repeated IDs/prompts, malformed answer kinds and missing distractor/rubric/follow-up content. It adds time warnings when format estimates differ substantially from 15/30 minutes. Successful output is **structurally checked / needs_owner_review**, not independently certified truth. Semantic consistency, numerical claims, analogy quality, ambiguity and semantic duplicate review remain explicit owner responsibilities. Model self-review is not an independent verification step.

The server imports an immutable unpublished workbook with answer keys stored separately, full output/provenance in the private job result and safe validation receipts in status. Ordinary snapshots contain no answer, rubric or follow-up payload. `test_fake` is accepted only when the explicit isolated test-adapter flag is set; it remains false in hosted DEV. Paid execution is disabled by the shipped adapter. No API key fallback occurs.

## Owner review and paired PDFs

Existing exact-version `/workbooks/{id}/{version}/review?part=...` records an explicit review. `POST /engine/jobs/{generationId}/approve` requires a READY generation job and prior review; it persists owner authorization and queues a RENDER job. Model output cannot approve or publish.

The deterministic renderer reads the same workbook and private key snapshots as online solving. It creates A4 question and answer/explanation PDFs with embedded Korean font subset, wrapping, pagination, handwriting space, references, rubrics, incorrect-option reasons and ten follow-up prompts. Metadata is exactly `StudyWorkbookId`, `StudyWorkbookVersion`, `StudyDocumentKind=question|answer`. The render configuration fixes document IDs/date metadata. Unsupported compatibility glyphs such as circled list numbers use equivalent NFKC text; an actually missing glyph fails the pair rather than rendering a blank box.

The OFL NanumGothic font and license are downloaded at build time from pinned Google Fonts revision `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe`, with SHA-256 verification. No font binary is checked into Git or delivered in the evidence archive. The renderer accepts a separately provisioned `STUDY_PDF_FONT` if needed.

Derivative asset identities are persisted before I/O. Retries verify/reuse already stored exact bytes, including a crash between the first upload and checkpoint. They never overwrite an existing final object or another manual asset. After both private objects pass size/hash/PDF/metadata verification, one transaction attaches both and publishes the workbook. Missing/wrong/partial pairs stay unpublished. A reissue uses a new immutable workbook version; published attempts and documents remain unchanged. The 1 GiB owner quota also applies to generated assets.

`POST /engine/jobs/{generationId}/reissue` accepts `{operationId:"UUID"}` for an owned READY/PUBLISHED generation. It copies unchanged question data and private answer keys into a new workbook version, rebinds key identities to that version, retains original provenance and records `modelInvoked:false`. Operation replay returns the same new job. No model request, historical edit or automatic publication occurs. Fresh exact-version review and explicit approval are required before its new PDF pair can publish. Source downloads stream through size/SHA validation and PDFBox uses a temporary-file stream cache.

## Job and scheduling contract

Kinds: PLAN, INDEX, GENERATE, COACH, RENDER. States: QUEUED, RUNNING, PARTIAL, VALIDATING (reserved), READY, PUBLISHED, FAILED, BLOCKED, CANCELLED. Each claim has a fresh UUID lease, ten-minute expiry and attempt count. Heartbeats extend active leases. Stale workers cannot complete another claim; another worker cannot fail/cancel its result. Duplicate completion with the same digest replays; different output conflicts. Three automatic attempts and at most three explicit manual retry increments bound recovery. Owner/day creation is bounded to 100 jobs/day; local worker processing is capped at 14 jobs/invocation.

Worker endpoints: POST `/claim`, `/jobs/{id}/heartbeat` with leaseToken, `/jobs/{id}/complete` with leaseToken/output. Status and owner controls: GET `/engine`; POST `/engine/jobs/{id}/run` (server PLAN/INDEX/RENDER only), `/retry`, `/cancel`; POST `/engine/workers`, `/workers/{id}/revoke`.

Creation budgets are 100 jobs in a rolling day and 300 in rolling seven days, across job kinds, under the owner lock. Idempotent replays remain available at the budget limit. Reissue carries forward the original safe validation/duration warnings rather than hiding them.

`automation.configure` persists enabled/time; valid evening times are 18:00-23:59 KST. Proposed DEV default is Sunday 20:00, not a separately owner-specified hour. `STUDY_ENGINE_ENABLED` gates actual server polling. Sunday creates the next Monday-Sunday PLAN once; a restart after the due Sunday can catch up from persisted settings. A disconnected laptop leaves generation queued. Approval/pair gates still apply. Current Sunday remains current until Monday 00:00; old packages are never reset/deleted. Status exposes next-run time, worker heartbeat and actual per-day job/pair receipts. A server feature flag being on does not imply the owner has enabled a schedule.

## Coach contract

Feedback saves first as pending_analysis. POST `/engine/feedback/{id}/analyze` queues the same scoped local worker. Output classification is learning_question, general_feedback, policy_change or correctness_dispute. A correctness dispute becomes needs_question_review; no blind policy mutation occurs. Policy changes contain allowlisted typed changes, reason, original feedback and explicit this_week/next_week_only/ongoing scope. Ambiguous changes remain general feedback. Approval/rejection uses existing Foundation commands and stale-before conflicts; rollback appends a policy version. The planner resolves effective/expiry date windows, not merely max version. Published history is never edited, and effectiveness is not fabricated.

Email delivery, re-OCR, automatic grading, arbitrary generated UI/code, paid model execution, new vector infrastructure and PROD release are outside this implementation's active execution paths.
