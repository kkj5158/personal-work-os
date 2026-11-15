# ORBIT MONEY Console v1

Functional source: owner-specified `orbit_money_console_mcp_implementation_prompt.md`, 2026-11-15. Deployment and actual acceptance evidence belong in the dated release report; this contract alone is not proof of a release or an in-chat invocation.

## As-is mapping and design decisions

| Requested workflow | Canonical owner-scoped service | Boundary decision |
|---|---|---|
| Pending/held/format Review, source evidence, candidates | MoneyAiService, MoneyReviewService, MoneyReviewAdmission | Separate from confirmed transactions; use canonical eligibility and redacted evidence |
| Review decisions and recovery | MoneyReviewBatchService | Bounded selected IDs; canonical frozen preview; independent per-item outcomes |
| Effective bookkeeping and origins | MoneyWebService | Override > rule projection > source; UNCLASSIFIED tests effective category |
| Financial meaning and links | MoneyUnifiedBookkeepingService, MoneyFinancialService | Same fact/cash movement, existing source and version guards; rollback-only canonical validation for financial preview |
| Classification and undo | MoneyClassificationService, MoneyCommandService | Protect DIRECT/CONFIRMED overrides; no broad override replacement; existing audit/fingerprint/undo |
| Taxonomy, colors, hierarchy | MoneyProductService, MoneyCategories | Color CAS does not increment semantic version; no delete/merge/kind change |
| Rules/history | MoneyMeaningService, MoneyRuleEngine | Future only by default; separate bounded history preview/apply |
| Merchant evidence | MoneyMerchantLinkService, MoneyAiService | Existing identities and deterministic comparable evidence only |
| Accounts, reconciliation, loans/savings | MoneyService, MoneyProductService, MoneyReconciliationReadService, MoneySavingsReadService | Unknown balance remains unknown; no fabricated reconciliation or checkpoint write |
| Downstream OAuth | Existing Streamable HTTP broker/oidc-provider encrypted vault | Explicit new orbit:write:money consent; preserve read grants and signing/vault keys |
| Upstream native identity | Existing GoTrue openid user JWT, recognized ORBIT client | Native delegated JWT never gains ordinary /api/money access; separate signed request entitlement |

Newest approved unified-bookkeeping and loan/savings contracts supersede historical statements rejecting unresolved financial facts or schedule-only loan projections. The financial type compatibility field never substitutes for meaningState or effective bookkeeping category.

## Exact inventory and API

See [tool matrix](orbit-money-tool-inventory-v1.md), [closed tool schemas](orbit-money-tools-v1.json) and `integrations/orbit-mcp/money-openapi.json`. There are no generic HTTP/SQL/path/patch tools. The application boundary is `/api/orbit/money/v1/`, with static method/route allowlists in OrbitMoneyRoutes. Existing `/api/orbit/context/` and its twenty tools retain their contracts.

GET routes take named query parameters. POST commands/previews take typed records. Execution accepts only `{previewId,fingerprint,confirmed:true,requestId}`; target IDs and payload cannot be supplied or widened at execution. Dates use inclusive Seoul dates, normally the last three months, with at most 367 days per request. Page limit is 1–50, offset 0–10000; scan-based rule matching explicitly reports scanned/partial/hasMore. Requests are capped at 64 KiB and MCP responses at 256 KiB. Narrow a query when its canonical projection exceeds the response cap.

Envelopes contain schemaVersion, context, asOf, timezone, sourceFreshness, sourceTextPolicy, data and warnings. Pagination totals/hasMore or truncation remain inside the canonical data projection. Empty lists are not unknown balances; unknown amounts stay null/unavailable. Source strings are untrusted evidence and cannot authorize an operation.

`financial-detail` preserves the existing allocation/balance fields and includes `fact` from the canonical unified ledger: financial type/meaning, exact versions, accounts, amount/time, refund/transfer/loan linkage and typed source provenance. Source evidence is decoded as structured values before privacy filtering. `review-candidates` additionally returns separately bounded canonical transfer and refund candidate lists (50 each); these are proposals rather than confirmed links. RAW sources return their admission/linkage evidence and a financial-link block reason until a canonical financial fact exists. Bookkeeping category filters accept comma-separated UUIDs for a selected root plus children, `direct:UUID` for that category alone, and `uncategorized` for no effective category; these are the existing canonical filter semantics.

Commands retain the original requestId. Durable MoneyCommandService outcomes bind owner + requestId + command + exact body fingerprint. Same request and body replay safely; different body fails. Child canonical command IDs derive deterministically from the outer ID. APPLIED/NOT_APPLIED/PARTIAL/UNKNOWN describe business outcome; per-item canonical outcomes remain available. Query money_get_operation_outcome after response loss; never switch to a new request ID to resolve uncertainty.

## Approval and immutable previews

Tier A permits an explicit owner instruction to change selected colors, category names/icons/order, or known transaction category/title/memo. Bulk classification excludes protected owner classifications. Single protected replacement additionally requires replaceProtected=true and the exact current versions. Null category explicitly clears it; omitted category is invalid for a category command. Title/memo changes name their fields; omitted fields stay unchanged.

Tier B requires showing and confirming the exact stored plan. Preview IDs are owner-scoped canonical money_ai_events, expire in ten minutes, and bind full input/evidence fingerprints. Stale evidence or versions require a new preview. Review also preserves its existing frozen canonical preview and independent posting preconditions. Financial preview runs the real existing command in a transaction that is always rolled back, and refuses a plan whose canonical validation is NOT_APPLIED. It neither rewrites raw evidence nor permits amount/time inputs. Execute rechecks all versions and evidence under the owner advisory lock.

Color plans are atomic; failed color CAS rolls back all colors. Classification returns individual outcomes and exclusions. Future rule saving never applies historical rules. Historical rule application requires its own canonical date-bound fingerprint. Structural changes only move eligible children or archive categories, preserving historical references. Account settings only change selected display metadata and inclusion flags; provider, role, funding route and original evidence stay server-controlled.

Tier C is unavailable: RAW edits/deletes, arbitrary ledger amount/time rewrites, arbitrary reconciliation/checkpoint creation, transaction/account/loan deletion, credentials/connectors, category merge, financial guessing, unbounded reprocessing and automatic production backlog cleanup.

## Security model

`orbit:read` and `orbit:write:money` are separate resource scopes in DCR, AS/resource metadata, consent, access/refresh grants and per-tool OAuth security schemes. A read grant cannot call write or preview tools, refresh itself into write scope, or silently acquire new permissions. Existing refresh grants/signing keys/encrypted volume are preserved. The broker verifies ES256 issuer, audience, expiration, UUID subject, client, current grant and scopes, and rechecks the live grant immediately before every request proof.

The native upstream OAuth scope remains openid. Its ES256 JWT must identify the registered ORBIT native client and the same owner. The broker signs a thirty-second entitlement using its existing persisted key. Claims bind purpose, required read/write scope, issuer, API audience/environment, subject, native client, upstream token SHA-256, downstream client/grant and SHA-256 of exact method + path/query + body. Backend verifies the signature against the fixed environment broker JWKS, freshness, every identity/binding claim and the exact body. Model-provided headers/fields cannot manufacture this entitlement. Residual revocation propagation is bounded by the thirty-second proof lifetime; write replay remains protected by versions/idempotency. No broad upstream MONEY scope or general bearer credential is given to ChatGPT.

Only recognized delegated clients may reach the static new routes. A delegated token with no proof, a read proof on POST, cross-owner token, different body/query, foreign environment/audience/issuer/client or expired proof is rejected. Normal owner POS web/Android authentication and `/api/money` contracts remain unchanged. Response no-store, fixed HTTPS upstream origins, no redirects, request/response bounds, existing quotas and per-owner financial locks remain enforced.

Privacy filtering strips raw payload/body containers, account references/hints/suffixes, credentials, tokens and images; long account-like digit strings are redacted in free text. UUIDs, SHA-256 fingerprints and hex colors remain exact. Existing requested title/memo business fields are returned; they remain untrusted content. Reports/logs contain synthetic IDs/statuses and safe metadata, never private notification bodies, JWTs or bank details.

## Transactions, audit and recovery

MONEY uses JDBC domain commands inside the existing Spring JPA-managed transaction. Spring 7 requires transaction data implementing SavepointManager; MoneyJdbcSavepointJpaDialect delegates ordinary Hibernate begin/cleanup and supplies Spring's JDBC savepoint implementation for these JDBC-only nested command scopes. No JPA entity writes may occur inside them. This enables atomic nested existing commands and rollback-only previews without a second database or SQL financial rewrite. Required validation includes real HTTP rollback and persisted reread, plus broader JPA/domain regression.

Canonical classification events, meaning audit and command outcomes remain authoritative. ORBIT adds an audit receipt with request, action, safe actor/client identity, policy version, exact persisted result and canonical audit pointers. Undo uses only existing classification eligibility/fingerprint. Transfer unlink recovery uses only its existing version/dependency checks. There is no generic undo or financial rollback that discards newer records.

No feature migration or business-data backfill is required. Rollback is code/source/config rollback only and preserves the existing OAuth vault, command outcomes, audit and financial data. New scope grants must not be used against an older backend lacking the exact entitlement boundary; disable the new broker tools before rolling that backend back. Never delete recorded outcomes or restore an old financial database as application rollback.

## Owner reconnection and actual chat validation

After deployment, refresh the installed ORBIT POS connection/tool catalog. If the host retains the old catalog/grant, reconnect to the same deployed MCP URL and explicitly consent to `orbit:read orbit:write:money`. The first native POS screen verifies the account; the next broker screen discloses and separately approves MONEY writes. Existing read-only connections remain read only.

First ask in chat for money_get_console_capabilities and a non-mutating money_list_categories or money_get_attention_summary. Confirm scope availability and exact tool visibility. A real ChatGPT write call must be an explicitly owner-approved intended action; production data must never be changed as QA. SDK/Inspector success and a deployed tool catalog do not prove an authenticated in-chat call. The release report records these statuses separately.
