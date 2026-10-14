# MONEY Financial Admission V2 — Phase 1

Owner-approved Phase 1 policy, 2026-10-14. Financial admission and category classification remain independent. This contract changes future automatic processing; historical terminal Review observations are never automatically backfilled.

## Financial evidence and identity

Supported sources are the existing versioned SHINHAN/IBK/WOORI/KAKAO push parsers and their exact Android packages. A supported domestic `VERIFIED_PUSH_V1` shape, KRW, positive amount, IN/OUT direction, occurrence/time provenance and an active uniquely resolved owner account are mandatory. Explicit incompatible currency is never replaced by KRW. A parser's domestic currency default remains valid only for its verified WON grammar.

An unresolved product or masked-account hint remains blocking. The existing numeric external-account-hint exception cannot substitute for resolution of the owned movement side. Raw transport identity/content hash, source exclusivity, owner isolation, financial persistence/version guards and command recovery remain authoritative.

## Transfer matching

An explicit notification route with two distinct active owned accounts is immediate. A two-notification transfer requires opposite directions, equal amount/currency, distinct verified owned accounts, eligible source shape and compatible occurrence time. Default occurrence window is 60 seconds, independently configurable with `app.money.transfer-window` / `APP_MONEY_TRANSFER_WINDOW` (positive and at most 90 seconds). Source matching never falls back to first-match order.

Build the complete bounded eligible graph before choosing pairs. Evidence strength distinguishes generic owned-account pairs, matching counterpart text, matching text with close notification delivery, and retained savings corroboration. Only a mutually unique strongest relationship can post. Equally plausible competing relationships remain `AMBIGUOUS_TRANSFER_PAIR`. Counterpart equality is corroboration rather than a mandatory condition for provider-timed pairs. Explicit payroll/settlement/merchant semantics veto a coincidental external OUT/IN pair; dedicated refund/loan semantics also veto pairing.

Bank timestamps take precedence over Android arrival. `PROVIDER_MINUTE` remains a minute lower bound; `PROVIDER_SECOND` remains second precision. Raw posted time, provider occurrence, normalized occurrence, time source and post-balance evidence are preserved. A minute lower-bound comparison cannot prove a physical second-level latency or exact physical interval. The existing parser's `ANDROID_POSTED_AT` fallback is explicit: an Android-only pair requires matching counterpart corroboration and at most 10 seconds delivery difference, or a retained dedicated savings rule. Different-text relaxed pairing requires provider time on both sides. Do not invent missing bank time.

Savings single-route, pair and auxiliary linking contracts remain. One transfer creates exactly one canonical fact with both source references, correct account IDs and amount/currency. Sources are not independently counted as income or expense.

## Ordinary income and expense

For a single owned side, first evaluate transfer candidates, source duplicates/overlap and dedicated semantics. Ordinary admission requires a verified `ACCOUNT_ACTIVITY` movement with the financial facts above and a nonblank counterpart context. Payroll prefixes and the old business-keyword allowlist are no longer admission gates. IN creates INCOME; OUT creates EXPENSE. Category absence never blocks financial registration.

Transfer-intent wording (`이체`, `송금`, `오픈`) with no resolved counterpart is blocking; the observation window alone does not prove externality. Savings, refund/reversal, loan/repayment, top-up and adjustment semantics require their existing financial operations. Unresolved opposite evidence, ambiguous ownership or source identity remains reviewable.

The eligible transfer window and conflict neighborhood have different purposes. Generic unresolved opposing evidence and late established-source overlaps remain blocking within 90 seconds, including the 61-second edge just outside automatic matching. A supported opposite observation whose owned movement side cannot resolve retains the existing 600-second posted-time safety neighborhood, even when the eligible side has familiar merchant/payroll wording. Fully resolved explicit external movements remain ordinary.

## Observation and dispatch

`app.money.observation-window` / `APP_MONEY_OBSERVATION_WINDOW` defaults to `PT10S`. Maturity is measured from persisted server `received_at`, separately from bank occurrence and notification delivery. Production processing supplies received time to the pure matcher context without changing persisted parse-attempt timestamps. A conclusive explicit route or pair posts immediately.

Existing AFTER_COMMIT dispatch, durable `processing_due_at`, owner advisory transaction lock, due-job recovery and bounded graph remain. The scheduled worker's existing 5-second cadence can add dispatch jitter. Ten seconds is an observation target, not an end-to-end SLA. No busy waiting, new realtime dependency or migration is introduced.

## Late arrivals, duplicate identity and owner decisions

Exact transport replay returns the existing RAW identity. Reusing transport identity for different payload is a conflict. Source tables prohibit one RAW from belonging to two canonical facts. Unposted indistinguishable components and recaptured same-movement evidence remain reviewable.

Repeated amount alone is insufficient to merge or suppress a movement. Provider occurrence, owned route, counterpart context, source identity and post-balance progression distinguish independent repetitions. Source provenance includes original direction, posted/provider time and post-balance; minute precision is retained when balance progression establishes separate movements in one provider minute.

A late opposite source overlapping an established fact produces `LATE_POSTED_TRANSFER_LINK_REQUIRED`. The original fact, source evidence, versions and owner decisions remain. Phase 1 does not automatically convert INCOME/EXPENSE to TRANSFER. The existing duplicate-link command is a same-side guarded association, not a general atomic expense/income-to-transfer replacement. Full automatic late reconciliation needs a separate Phase 2 contract and version-validated operation.

Processing overlap context includes canceled and merged facts. They cannot become auxiliary targets, and later source observations cannot silently recreate owner-canceled facts. Legacy owner-confirmed/manual facts without direction in source metadata use their established INCOME/EXPENSE direction only for read-only conflict detection. Same-side transfer-source overlap returns `LATE_POSTED_TRANSFER_SOURCE_OVERLAP`. Old V6 source precision/balance plus its canonical bank occurrence can corroborate an unchanged-balance duplicate despite different counterpart formatting; Android delivery is never substituted into that comparison.

## Processing read model and Bookkeeping

`GET /api/money/processing?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{items, truncated}` scoped exclusively to authenticated current owner and Seoul inclusive dates. Rows contain stable `rawEventId`, account ID/name/provider, IN/OUT, amount/currency, counterpart, occurred/received time, precision/provenance, processing version, status and review reason. Querying RAW can parse a RECEIVED notification in memory for immediate visibility; it never persists a parse attempt or fact. Latest persisted attempts must match supported parser identity/version/package.

Only uniquely resolved owner-account observations appear. Unsupported, incomplete or ambiguous observations remain in their original Review flow. Canonical-linked sources are excluded even if the fact was later canceled. The projection caps its raw read at 201, displays at most 200 and reports truncation. There are two batched SQL reads, no per-row account/source query.

Canonical BookRows add `sourceRawEventIds` from owner-scoped persisted links to suppress a stale processing snapshot during concurrent refresh. Existing canonical transaction IDs remain unchanged. Processing rows are separate from BookPage items/summary/composition/trend, account balance, savings and donuts; they never enter selection/category Save, effective category counts or DIRECT/CONFIRMED evidence.

The existing eight-column monthly Bookkeeping table includes read-only `처리 중` and terminal `검토 필요` rows. Existing account/search/amount/direction filters apply. Category-specific and classification-origin views omit pending observations. Review navigation uses the existing page. Source polling is 3 seconds and the active canonical list refreshes every third tick (9 seconds) to catch immediate admissions between polls. Both stop while the page is hidden. Drafts, durable selections, picker and right-side details remain mounted.

An open category row may leave the paginated result during live refresh. Its unsaved picker choice, parent, search and this-transaction-only flag are retained in existing owner-scoped memory by transaction ID. Original versions remain the conflict baseline. Explicit discard/close, successful Save, financial-kind change and owner change clear the relevant draft; failed Save preserves it. Current inactive categories cannot authorize Save.

## Review taxonomy

| Stage | Stable codes | Meaning |
| --- | --- | --- |
| Owned account | ACCOUNT_RESOLUTION_REQUIRED, MISSING_OWN_SIDE, SAME_ACCOUNT_ROUTE, OPPOSITE_OWNER_ACCOUNT_UNRESOLVED | Resolve or correct owned route |
| Historical wording | ORDINARY_WORDING_RESTRICTION; legacy UNMATCHED_OR_EXTERNAL_UNPROVEN | Ordinary evidence issue, never mislabel as account failure |
| Transfer | AMBIGUOUS_TRANSFER_PAIR, UNRESOLVED_TRANSFER_CANDIDATE, UNRESOLVED_TRANSFER_INTENT | Candidate/intent requires confirmation |
| Late/source overlap | LATE_POSTED_TRANSFER_LINK_REQUIRED, LATE_POSTED_TRANSFER_SOURCE_OVERLAP, LATE_TERMINAL_EVIDENCE_REQUIRES_CONFIRMATION, POSSIBLE_ALREADY_POSTED_ROUTE | Preserve original facts and inspect source linkage |
| Duplicate identity | INDISTINGUISHABLE_TRANSFER_EVIDENCE, MULTIPLE_ATTEMPTS_SUPPLIED | Conflicting source identity |
| Financial facts | MISSING_REQUIRED_FINANCIAL_FACTS, INCOMPLETE_CANDIDATE, MISSING_PARSE_ATTEMPT, UNSUPPORTED_CURRENCY_OR_SOURCE | Missing/unsupported structure or facts |
| Dedicated operation | DEDICATED_FINANCIAL_OPERATION_REQUIRED, AUXILIARY_PRIMARY_MISSING_OR_AMBIGUOUS | Refund/loan/savings contract |
| Remaining outcome | MISSING_ORDINARY_MOVEMENT_CONTEXT, PARSER_ERROR, unknown terminal code | Explain incomplete financial decision or processing failure |

## Category automation and integration

Learned DIRECT/CONFIRMED evidence and provider output are recommendation-only. Legacy automatic worker persistence requires an approved rule ID/version revalidated by `MoneyApprovedRuleGuard`; recommendations remain protected job results until owner Save. Synchronous legacy merchant-rule application uses the same guard. Explicit manual rules retain their established authorization; AI-approved rules additionally require current approval identity/version and automaticRules permission. Existing confirmed categories and owner overrides retain protection.

V6 Review commands, frozen batch previews, explicit classification Save, cancellation/restore and durable selection contracts remain. No personalized payroll-rule engine, new consent UI, M-007 candidate discovery, provisional canonical type, schema migration or retrospective registration is added. Concurrent MONEY UX redesign can reuse this additive projection without changing financial or category contracts.

## Release

Backend/financial/duplicate/owner regression, frontend domain/component/type/lint/build, owned-database integrity and DEV evidence must be recorded separately. Synthetic service/API tests do not substitute for native authenticated DEV browser evidence. Production promotion requires separate explicit owner approval; Phase 1 does not authorize PROD deployment, historical backfill or schema/data restoration. Application rollback preserves all canonical facts, RAW/source and cancellation/selection history.
