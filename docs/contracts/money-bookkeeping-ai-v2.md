# MONEY Bookkeeping AI Classification V2

Bookkeeping recommendations are durable, unconfirmed meaning drafts. Only an explicit owner save writes the selected category and its confirmation/correction event. Financial facts, source notifications, amounts, dates and accounts retain their existing contracts.

Authority: the approved 2026-10-08 Bookkeeping package, owner handoff, final policy 06, implementation specification 07 and critical acceptance 09. HTML 01–05 govern composition and behavior; their sample counts are not runtime limits. Review Required policies remain a later approval phase. This contract is separate from release evidence.

## Shared evaluation and trust

`MoneyClassificationEngine` evaluates both existing automatic classification and the V2 recommendation sink. It first considers the latest valid DIRECT correction for the same owner, account, type, normalized merchant/merchant identity and purchase context. Otherwise, at least three distinct current CONFIRMED transactions must consistently choose the same category with sufficient purchase context. Unconfirmed drafts, conversations, adopted candidates, Undo and reference-excluded events do not contribute trust. Category/parent activity and versions, transaction/override/projection versions and current purchase context invalidate old references.

Approved active rules follow trusted references. External classification uses only current allowed category IDs and minimized purchase terms/explanation. It never creates a category or changes financial facts. Explicit additional explanation is part of purchase context, not a merchant-wide default.

## Provider readiness and responsive category editing (2026-10-09 repair)

Hosted external fallback requires `MONEY_AI_CLASSIFICATION_PROVIDER_ENABLED=true` and an existing `MONEY_AI_API_KEY` or `OPENAI_API_KEY`. The default remains disabled for unconfigured installations. A known readiness failure records no external attempt; internal evidence and manual category Save remain available. Explicit retry can recover a readiness-only change while preserving the immutable target and cost quote. Model, price or token-bound changes still require a fresh preview. Never retry uncertain delivery automatically.

Exposed response identity and token usage survive invalid or incomplete model output. Such output does not produce a category draft. Missing usage remains unknown rather than being estimated as actual billing.

The category picker opens using the loaded owner-scoped dictionary and permits local staging while its latest-version check is pending. Save remains disabled until that check succeeds. A failed check retains staging and offers an explicit lookup retry; a changed latest category/version requires acknowledgement. Draft conflicts use the existing displayed-version comparison flow. Parent changes, leaf clicks and searches do not invoke a provider. Only known committed saves update rows and show success.

Recommendation-only state changes invalidate recommendation resources. A committed meaning Save also invalidates Bookkeeping, Review and history through the existing meaning-change matrix. Financial/category/context mutations continue to invalidate recommendation resources. Request-local reuse of a Bookkeeping row removes repeated reads without caching across commands or weakening save-time owner/version/financial guards.

Existing `/ai/classification/request` and `/save` keep their maximum-50, legacy atomic contracts and automatic-application sink. V2 uses a distinct draft sink and independent save orchestration. Existing financial/rule approvals and safe Undo remain atomic.

## Durable lifecycle

V79 adds owner-scoped runs, immutable target items, current draft pointers, immutable candidate revisions, save operations/items, usage reservations and explicit draft decisions. All new tables enable RLS without client write policies. Backend ownership comes from the existing current-user provider, never a request field.

Preview freezes eligible transaction IDs, displayed versions, full filter scope and a policy-bound fingerprint. `FILTER` includes all matching pages. Confirmed choices, existing active/comparison drafts, in-flight work, excluded/merged financial facts, incompatible financial reasons and inactive/untracked accounts are excluded with reasons. A later filter change or new arrival does not change the run.

New eligible drafts start selected once. User deselection is stored on the server. Global Recommendation Review is independent of table filters; hidden selected targets are disclosed in the exact save preview. Reassessment retains the original revision and produces a separate candidate. ADOPT remains unconfirmed. KEEP retains the original context as an explicit immutable revision; known failure restores the saveable original explanation. Explanation edits increment durable context versions without dispatching AI. Changed transaction/context versions prevent stale adoption, and late replies cannot overwrite newly typed context.

Per-item states distinguish QUEUED, RUNNING, DRAFT_READY, UNCLASSIFIABLE, FAILED_KNOWN, PROTECTED, STALE_CONFLICT, BUDGET_WAIT and EXTERNAL_OUTCOME_UNKNOWN. A lease expiry never authorizes resending an uncertain external attempt. Explicit recovery can retry a known failure or keep current values while retaining uncertain cost reservations.

## API surface

All routes below are under `/api/money/ai/classification/recommendations`.

| Route | Contract |
| --- | --- |
| `POST /preview` | `scope`, explicit `ids` or complete `filters`, optional 500-character explanation; immutable server snapshot |
| `POST /start` | `requestId`, `snapshotId`, fingerprint, policy version and explicit confirmation; exact request replay |
| `GET /runs`, `/runs/{id}`, `/runs/{id}/items?offset=` | Owned durable runs, reconciled counts and 50-item progress pages |
| `POST /items/{id}/recovery` | Idempotent known-failure retry or explicit keep-current resolution of unknown external work |
| `GET /drafts` | Global unresolved draft/candidate state, current stamp, eligibility and conflicts |
| `PUT /drafts/{id}/selection` | Revision-bound persistent save selection |
| `POST /drafts/{id}/context` | Exact request/revision-bound explanation edit; invalidates stale candidates without classification writes |
| `POST /drafts/{id}/decision` | Revision/context/current-stamp-bound KEEP, ADOPT, EXCLUDE or KEEP_LATEST |
| `GET /current/{transactionId}` | Current owned eligible book row and immutable displayed stamp |
| `POST /save` | Exact `requestId` and distinct versioned items; independent commits and durable per-item results |
| `GET /saves`, `/saves/{id}`, `/save-outcomes/{requestId}` | Recovery after reload or lost response without recommitting successes |
| `POST /saves/{id}/recovery` | Reconcile the original operation against committed events before resuming an uncommitted item; never repeat a saved event |
| `POST /saves/{id}/retry` | Retry only FAILED_KNOWN items; conflicts and unknown outcomes are excluded |
| `GET /history/{transactionId}` | Immutable recommendation/reassessment revision history |
| `GET /usage` | Owned Korean calendar month usage, actual/held/uncertain costs and limits |

Each save item captures transaction ID, draft ID/revision when present, chosen category, expected displayed stamp and reference-exclusion preference. Normal saves require the original current draft stamp. Compared saves additionally capture the original draft stamp and the latest displayed stamp; the server rechecks both. KEEP_LATEST closes a stale draft without a category write or learning event. The same request key with a different payload is rejected.

Each successful item writes its category event, classification state, durable save result and draft completion in the same transaction. An unchanged recommendation is CONFIRMED; a different choice is DIRECT. Original recommendation evidence remains distinct from the final choice. A known item rollback does not roll back another success. Category saves do not create a new independent Review decision; existing independent financial decisions and their completion timestamps are preserved.

## Review admission amendment — 2026-10-09

Category absence or uncertainty alone is not a Review obligation. The public queue predicate excludes CATEGORY_UNCONFIRMED before list, total, reason, lane, overview count and waiting workbench filtering. These transactions remain available in bookkeeping for manual classification and unconfirmed AI drafts. Historical decisions, events and completed classifications remain retained.

Unresolved transfer matching, refund linking, loan breakdown, account resolution, duplicate, amount, parser and other RAW exceptions retain their existing predicates and dedicated actions. A financial exception combined with an absent category remains a financial Review obligation. Generic category completion and stale category-only CONFIRM/DEFER/REOPEN commands cannot manufacture an independent Review decision or resolve a financial exception.

The immutable recommendation stamp continues to use the original reason context internally. Changing public admission therefore does not invalidate existing drafts or frozen snapshots. Legacy automatic classification retains its historical completion record contract; V2 saves preserve independent Review history without generating category-only decisions. No transaction fact migration, automatic confirmation, deletion or new Review UX is part of this amendment. Approved policies 001–007 and the latest full-screen source remain required for dependent Review UX work.

## Provider and budget boundaries

Workers read up to 20 items. Owner locks protect claims, reservation accounting and commits; no lock or database transaction crosses the provider call. At most two held external dispatches can exist for an owner. Inputs and current pricing are checked again before dispatch.

Default V2 explicit recommendation/reassessment caps are US$1/day and US$10/month in Asia/Seoul. Actual + held + uncertain reservations enforce the cap atomically. The ledger period is captured at dispatch reservation. Waiting snapshot items remain durable. The preview requires explicit confirmation when targets exceed 100 or conservative external cost exceeds US$0.25. The confirmation binds the exact snapshot and policy.

The existing model is `gpt-4.1-mini`. Standard text rates were verified against [OpenAI's official model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) on 2026-10-08: US$0.40 input and US$1.60 output per million tokens. The quote reserves a conservative input bound and 500 output tokens. Unknown models/pricing, absent credentials or disabled providers block external calls while internal/manual paths remain available. These caps concern V2 explicit calls, not existing automatic intake, conversations or the OpenAI project's total billing.

Confirmed measured usage settles its reservation. Unknown delivery, missing usage or abandoned external leases retain uncertain reservations. A rejection known not to have been charged can release its reservation. Unique transactions, external attempts/retries, internal judgments, cache reuse, token counts and outstanding/actual costs are separate metrics. Reassessment can reuse the transaction's active AI result only when its input/explanation, financial and dictionary stamp, model and engine policy match. Reuse creates a separate unconfirmed candidate, preserves original provider provenance, and incurs no new external attempt or reservation. Changed inputs or versions cannot reuse it.

## UI and retention

The real 50-row table has eight columns: selection, date, merchant, amount/account, title, memo, combined category and AI actions. Category uses saved emojis and two lines with origin/draft status beneath it. Its 948px minimum width scrolls inside the table container.

Global draft review uses the same eight-column table and 50-row pagination. Its origin filter and displayed-row selection are separate from the durable global save selection; hidden selected items and the exact save preview remain visible. Returning to bookkeeping restores the previous filters, page and row selection. A lost save response is resolved by the original operation's outcome; only a verified absent operation can be resubmitted with the exact same request ID and payload.

The anchored two-column picker stages changes. Parent navigation clears the staged leaf and requires explicit leaf or parent-only selection. Unchanged close is immediate; changed close offers Save, Discard and Continue. An existing AI draft alone is not dirty. Title/memo inline editing, filters, amount ranges and tracking settings remain available.

The AI panel opens explicitly, starts closed and has evidence/history/questions tabs. Its default 340px width supports drag and keyboard adjustment within 320–520px and available content width; narrow screens place it below the table. Unsent question/explanation text survives row switches and close. Explicit questions reuse the existing conversation endpoint and never execute a classification command.

Unresolved drafts, candidates and unknown recovery metadata do not automatically expire. V2 revision, decision and save evidence is retained beyond the minimum 365 days; general legacy audit pruning preserves linked V2 and unresolved recovery evidence. Conversations retain the existing 90-day last-activity policy. Undo uses the existing eligible-only preview/fingerprint contract and preserves later title/memo and independent financial/review decisions; it does not create a new draft or external call.
