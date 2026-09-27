# MONEY meaning core — Web Phase 3

Transaction is the financial fact. Bookkeeping is an owner-scoped life-meaning projection; Review completion of meaning fields does not change ledger amounts, account balances, financial Overview or raw notification evidence. V60 adds meaning persistence without rewriting existing transactions, overrides or capture history.

## Tracking and projection

`GET/PUT /api/money/tracking` stores independent EXPENSE and INCOME selections, each with at most five unique active owned accounts and an optimistic settings version. New accounts are never automatically selected. Empty tracking means an empty Bookkeeping scope, not all accounts. Membership changes do not delete records.

`GET /bookkeeping` applies period, search, account, category and amount filters to the same effective tracked subset for rows, totals, composition and trend. Linked refunds follow the original expense's tracking account and effective category, including an explicit category clear. Refunds subtract from consumption, never ordinary income. Confirmed loan interest/fees retain Phase 2 Bookkeeping semantics; principal is excluded.

Sparse user overrides take precedence over persisted approved rule defaults, which take precedence over source fields. Reset removes overrides and reveals inherited defaults. The separate source-reset action explicitly copies source values. Ledger and raw evidence remain unchanged. Override/projection/transaction versions protect saves; meaning changes append audit evidence.

## Categories and deterministic rules

Categories have immutable EXPENSE/INCOME kind, name, emoji, order, color and active/archive state. An explicit idempotent initialization action adds the approved 15 expense and six income defaults. Archiving preserves historical references. Legacy requests without kind remain compatible and preserve existing metadata.

`/classification-rules` supports ordered AND conditions on type, account, merchant and title, with EXACT/CONTAINS/STARTS_WITH. Outputs are category/title/memo only. Active rules apply to future financial facts. Higher-priority rules win per output field; lower rules may contribute other fields. Origin and applied rule/version evidence are server-controlled. Paused/inactive rules do not apply. Category outputs require a compatible type condition and an active owned category.

Historical application requires a bounded date range, an explicit preview and a matching confirmation fingerprint. The fingerprint covers relevant facts, user overrides, projections and rule versions; changed inputs reject stale confirmation. Only unoverridden outputs are projected, and audit evidence is appended. Preview is limited to 367 days and 10,000 facts per request.

Compatibility: pre-existing legacy exact-merchant rules with null conditions retain their existing normalization semantics. Saving one through the new rule editor explicitly converts it to the new meaning-only contract. New ordered rules never silently recategorize the financial ledger.

`GET /classification-rules/ai-status` currently reports unavailable: no approved configured AI provider is connected. The UI offers no fabricated recommendation generation or acceptance. Natural-language AI Rule Manager remains deferred.

## Review and Settings

`GET /review/queue` returns a lightweight owner-scoped queue with reason/account/type/state/amount filters and pagination. Three JDBC queries produce rows, count and reason facets; no balance recomputation or full raw bodies are included. `GET /review/diagnostics` separately loads reconciliation diagnostics only on expansion. Raw evidence is independently lazy.

`POST /review/complete` accepts up to 100 explicit versioned transaction selections. It persists the displayed title/memo/category as Bookkeeping overrides with an auditable decision snapshot. It never creates a rule. Bulk completion uses the same version and owner safeguards as single completion. Refund linkage, unresolved loan split and unparsed notifications require their dedicated financial detail confirmation rather than guessed meaning. Save-as-rule opens a separate unsaved draft.

Settings displays actual existing Bridge/device and pipeline state. Notification access and bank allowlist remain phone-owned. Diagnostic export contains structural status only; enrollment credentials and raw notification bodies are excluded. Existing authenticated Bridge ingest, dedupe and scheduler behavior are unchanged.

## Runtime and validation

The Phase 1 owner/session cache and bounded freshness remain authoritative; see [cache dependency matrix](money-web-cache.md). Managed `money-phase3` QA extends all Bridge and Phase 2 browser scenarios with tracking, Bookkeeping, categories, ordered rules, history, Review and Settings. All mutations use isolated synthetic MONEY schemas. `money-phase3-performance` measures three browser samples on the same 2,000-fact fixture as `money-phase3-baseline` at the accepted Phase 2 revision. Shared DEV Flyway is audited read-only by Central QA; PROD promotion is out of scope.
