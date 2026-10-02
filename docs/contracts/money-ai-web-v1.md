# MONEY AI Web V1 / shared Mobile API

Authority: Kafka_AI_WorkSpace approved track, policy 151 and handoff 153 dated
2026-10-02. S01–S06 actual PNG bytes were reviewed. The references describe
functional layout; their sample categories, counts and enabled switches are not
production configuration. Category policy 125 and existing MONEY contracts apply.

## Routes and meaning

- `/money/review`: S01 workbench; S02 evidence keeps the same selected item and
  edits. Classification, transfer and source-noise work are distinct.
- `/money/review?ai=transfers`: S03 owned-account pair review.
- `/money/classification?ai=merchants`: S04 merchant identities and research.
- `/money/classification?ai=categories`: S05 existing category tree, proposals
  and explicit whole-reference merge preview.
- `/money/classification?ai=operations`: S06 decisions, permissions and lookup
  operations. Existing rule/category editors and `review?legacy=1` remain usable.

Financial facts, raw evidence, overrides, tracking boundaries and category type /
two-depth rules retain their existing contracts. Confirming classification writes
the meaning layer and review decision, never the amount/account/date ledger facts.
Undo requires the current event and all relevant versions. Deferred/unconfirmed
or reversed decisions cannot become positive learning examples. Learning means
retrieving valid confirmed history and owner-approved rules; no model fine-tuning
is performed. Missing history is explicitly shown.

## Owner-scoped shared backend

The `/api/money/ai` APIs are shared by Web and the later Mobile client. Supabase
owner authentication uses the existing server security contract; no client-provided
owner identifiers are accepted. Mobile UI is outside this release.

| API | Contract |
| --- | --- |
| `GET /workbench` | `state`, `type`, `search`, `accountId`, `limit`, `offset`; current meaning, proposal, evidence and optimistic versions |
| `GET /items/{id}?kind=TRANSACTION\|RAW` | Same engine, detailed raw sources and action history |
| `POST /decisions` | Item id/kind, action, current transaction/override/projection or raw version, optional reason and explicit overrides |
| `POST /events/{id}/undo` | Owner/current-event/version guard; durable reversal and previous decision restoration |
| `GET /transfers` | Compatible existing owned-account expense/income legs and alternatives; evidence limitations exposed |
| `POST /transfers/confirm` | Expense/income IDs, both versions, idempotency key; atomic reuse of two existing legs; no third movement |
| `POST /transfers/unrelated` | Owner explicitly dismisses a candidate pair |
| `GET/POST /merchants` | Identity/branch/region/aliases; save requires expectedVersion for updates; identity alone does not recategorize |
| `POST /merchant-rule` | Explicit merchant, exact account/type and category; marketplace needs a distinguishing title condition; future scope |
| `GET /provider`, `POST /lookup` | Actual configured provider availability and bounded merchant-only research, durable provenance/failure |
| `GET /categories/proposals` | Actual category usage heuristic, visibly distinguished from model research |
| `GET /categories/{id}/preview?targetId=...` | All five live reference families, impacted transactions, versions and fingerprint |
| `POST /categories/{id}/merge` | Explicit confirmation and unchanged preview fingerprint; atomic metadata-only reference migration |
| `POST /categories/{id}/defer` | Durable proposal deferral |
| `GET/PUT /settings` | Versioned external lookup and approved-rule automatic permission; both default off |
| `GET /operations` | Actual decision/rule/lookup records with bounded recent lists and cumulative event metrics |

Client mutations invalidate both AI reads and affected existing MONEY caches.
Failures retain input and selection. No confirmation advances before successful
server persistence. Existing financial source editor handles incomplete raw
notifications, loan splits and refund linking.

## Research and automation boundaries

OpenAI Responses `web_search` uses merchant name and optional region only. It
receives no raw bank body, amount, account, date or financial identifier. Provider
configuration uses `OPENAI_API_KEY` (or `money.ai.api-key`), model defaults to
`gpt-4.1-mini`. Owner maximum: 10 lookups/day UTC, 24-hour successful-result cache,
30-second identical-query throttle, one search-tool call, 1,200 output tokens,
25-second request timeout and zero automatic retries. Failures remain visible and
durable. Sources come only from provider search/annotation URL fields with retrieval
time, provider/model/response ID and reported usage. Candidate URLs must belong to
that retrieved source set. Prose URLs alone are not evidence.

Rule/history suggestions outrank external research; an explicit user category is
preserved. Research can suggest an existing active category only when all sourced
candidates have the same industry exactly matching one category of the current
income/expense kind. Ambiguous names, stale research, payment intermediaries or
missing evidence produce no proposal. Every research suggestion requires approval.

Legacy deterministic authorized automation retains its behavior. New AI-approved
merchant rules require the separate owner permission, exact approved rule version,
owned active account/type/identity scope and marketplace disambiguation. Editing a
new approved rule invalidates automatic eligibility until explicit reapproval.
Automation changes only allowed meaning fields; category structure and transfer
linking always require explicit approval. No historical recategorization is implied.

## Migration and QA ownership

V69 adds owner-scoped AI events, merchant identities, lookup provenance and settings
with RLS enabled. It does not update existing financial/history rows. Existing V68
belongs to the latest DEV release and remains unchanged.

`qa:focused -- money-ai --allow-dirty` covers seven synthetic AI scenarios.
`qa:integration -- money-ai-full --revision <stable-integrated-sha>` is the one
authoritative stable-candidate MONEY acceptance run, including existing Bridge,
financial, meaning, two-depth category and Trust Pass scenarios. All browser fixture
data lives in an explicitly owned isolated schema and is removed with RESTRICT.
Fixture QA is separate from opt-in live-provider QA and authenticated PROD smoke.
Final execution results and revisions are recorded separately in the Drive Closeout.
