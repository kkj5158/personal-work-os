# MONEY financial-meaning quick confirm and evidence-first engine V1

Status: implementation in progress on `feat/money/ledger-evidence-first-v1`.
Owner decision: Policy B (evidence-first), 2026-11-21.

## Financial invariants

- A bank notification is source evidence, not a confirmed consumption/income classification.
- Persisted provisional `type=EXPENSE|INCOME` and `meaning_state=UNRESOLVED` are independent.
- Owner direct decisions take precedence over future automation.
- No changes to raw event, amount, occurred time, real account legs or loan principal from simple type confirmation.
- Existing account-ledger `preview` / `execute` version, fingerprint, preview token and durable request ID safeguards remain mandatory.

## P0: quick confirm

For a cash row with a source link, `UNRESOLVED`, one account leg and matching expense/outgoing or income/incoming direction, offer `현재 유형 확정` directly in the account-ledger row. User click retrieves fresh authoritative row, validates version, obtains canonical preview, executes only its preview token, and verifies a durable outcome. On UNKNOWN, retain the original request identity; no new request ID. On conflicts/errors retain the draft and show the error. Existing row-inline editor remains the safe path for transfer, savings, refund, loan and amount/time/account corrections.

This is manual owner confirmation, not automatic engine classification.

## P1: evidence-first engine

Source facts → duplicate/source check → unique owner-account reciprocal transfer pair → verified deterministic expense/income rule + protected owner history → complex exceptions → AI proposal only.
Outputs: AUTO_CONFIRM_ELIGIBLE, PROPOSE_ONLY, REVIEW_REQUIRED. AI confidence alone never grants automatic finance writes.

Existing lifestyle-category rules are not financial-meaning rules. Do not reuse silently.

## P2: Shadow & operational controls

Dry-run candidates with deterministic evidence, provenance, rule version and per-row reasons; no ledger write. Expose owner-scoped API + MCP candidate/diagnostic/status endpoints, feature flag default OFF and audited protected decisions. Batch historical actions require exact IDs, bounded immutable preview, owner approval, and no hidden/partial corrections.

For verification: current MCP count of unresolved semantic meaning was 310 on 2026-11-21; scope must be independently verified. Three loan-split decisions were pending. Do not auto-correct existing production facts based solely on this count.

## Required release checks

Test simple manual confirmation and outcome recovery; wrong direction, missing source, stale version, different owner and linked transactions must not bypass guarded flow. Preserve source hash, account balance, loan split, refund caps, transfer uniqueness and owner protections. Isolated DEV/synthetic PostgreSQL tests first. Production only after latest-dev integration, full mandatory gates and deployment lock verification.

Implementation handoff: `money_financial_automation_v1_handoff.zip` contains interactive design, product spec, Codex prompt and QA matrix.
