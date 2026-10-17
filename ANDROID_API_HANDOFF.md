# Coupang Work Calendar — Android API handoff

2026-10-17. Task 1: existing Web + shared backend only. Android implementation and PROD promotion are outside this task.

Release verification and exact deployed SHA: see `docs/releases/coupang-web-api-20261017.md`. Readiness must follow that report; this document alone does not certify a deployed release.

**Current gate: NOT_WEB_API_READY.** Stable product reference and freshly browser-tested deployment: `09c1a5df8db1339c90e29126ec19944859ea57c4` (product code equals `96f454364216d492f27e1545d2ad6087cfc8fc44`; intervening changes are documentation/QA tooling). Fresh authenticated DEV Chrome 390×844 null-save/reload, wage auto-ON/manual-OFF persistence, explicit ON/reload, MONEY navigation/category/account smoke and OFF/CANCELLED/archive/UUID reuse passed at the UI/HTTP level. Independent hosted bearer replay and full canonical history/version readback remain unrun without a separate authorized token file. The six synthetic records, two templates and weekly allowances remain pending full cleanup. No Android integration or Task 2 readiness is certified.

## Environment and authentication

| Environment | URL |
| --- | --- |
| DEV Web | https://workflow-web-development-development.up.railway.app/money/coupang-work-calendar |
| DEV API base | https://workflow-api-development-development.up.railway.app |
| DEV Auth base | https://pos-auth-dev-development.up.railway.app |
| DEV health | https://workflow-api-development-development.up.railway.app/actuator/health |
| DEV JWKS | https://pos-auth-dev-development.up.railway.app/auth/v1/.well-known/jwks.json |
| PROD Web (read-only baseline; no Task 1 promotion) | https://kafka-sys.life/money/coupang-work-calendar |

Hosted DEV uses the `hosted-dev` Spring profile and real GoTrue authentication. It is **not** the unauthenticated loopback `dev` profile. Every business request uses `Authorization: Bearer <access_token>` and JSON `Content-Type: application/json`. JWT verification pins ES256, issuer `https://pos-auth-dev-development.up.railway.app/auth/v1`, audience `authenticated`, expiry, and the UUID subject. Ownership comes exclusively from verified `sub`; never send or trust a DTO owner ID.

Use an independent Android GoTrue/Supabase-compatible session against the selected environment. Password grant is `POST /auth/v1/token?grant_type=password` with `{ "email": "<owner email>", "password": "<password>" }`; refresh is `POST /auth/v1/token?grant_type=refresh_token` with `{ "refresh_token": "<refresh token>" }`. Configure the environment's public `apikey` header from the approved public app configuration; never embed a service-role key, DB password, private signing key, or another app's token file. Keep DEV/PROD sessions, read caches, and drafts separate by environment and owner. Secrets are intentionally absent from this handoff.

## Routes

All paths below are relative to `/api/money/calendar`. All successful reads/writes return JSON with HTTP 200. Creation uses client-generated UUIDs and `expectedVersion: 0`.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/templates` | Owned templates, including immutable built-in OFF |
| GET | `/templates/{uuid}` | One canonical template |
| PUT | `/templates/{uuid}` | Versioned template and nested presets |
| GET | `/earnings-calendar?month=YYYY-MM` | Full Sunday–Saturday grid, records, archived records, weeks, nominal-month summary, read-only legacy week evidence |
| GET | `/earnings-records/{uuid}` | Canonical editor record and preserved legacy evidence |
| PUT | `/earnings-records/{uuid}` | Atomic work, expected snapshot, direct wage and receipt confirmation; new clients MUST send `contractVersion: 4` |
| GET | `/earnings-weeks/{YYYY-MM-DD}` | Sunday-start week and daily fingerprint |
| PUT | `/earnings-weeks/{YYYY-MM-DD}` | Only special-work and weekly-holiday allowances |
| POST | `/work-records/{uuid}/remove-off` | Versioned OFF soft archive; body `{ "expectedVersion": 3 }` |

Legacy `/work`, `/work-records/{uuid}`, `/pay-calendar`, `/pay-weeks/{sunday}`, `/weeks/{monday}` retain compatibility behavior. They are **not** the companion's writer or receipt workflow. Old work/earnings writers cannot overwrite a stored V4 record (409). No new payment registration endpoint exists.

## Template DTO

```json
{
  "expectedVersion": 0,
  "name": "QA 주간",
  "durationMinutes": 240,
  "startTime": "09:00",
  "endTime": "13:00",
  "breakMinutes": 0,
  "overnight": false,
  "shiftDescription": "주간",
  "groupName": "QA",
  "active": true,
  "presets": [
    { "id": "41000000-0000-4000-8000-000000000001", "name": "기본", "amount": 42140, "active": true },
    { "id": "41000000-0000-4000-8000-000000000002", "name": "대안", "amount": 38410, "active": true }
  ],
  "defaultPresetId": "41000000-0000-4000-8000-000000000001"
}
```

Response replaces `expectedVersion` with `id` and incremented `version`; other fields remain. Existing preset UUIDs must remain in subsequent writes: deactivate instead of removing them. An active template requires an active default preset. Names, hours, breaks, overnight flag, nested preset IDs/amounts/default/active state are managed together. Template changes never rewrite work records. Example amounts are synthetic fixtures, not seeded user values.

## Work PUT V4

```json
{
  "contractVersion": 4,
  "expectedVersion": 0,
  "workDate": "2026-10-18",
  "status": "SCHEDULED",
  "templateId": "42000000-0000-4000-8000-000000000001",
  "presetId": "41000000-0000-4000-8000-000000000001",
  "selectedTemplateVersion": 1,
  "reselectPreset": true,
  "startTime": "09:00",
  "endTime": "13:00",
  "overnight": false,
  "breakMinutes": 0,
  "durationMinutes": 240,
  "basePay": null,
  "totalDeduction": null,
  "confirmedDailyPay": null,
  "dailyIncentive": 0,
  "receiptConfirmed": false,
  "memo": "QA isolated fixture"
}
```

This is a full editor PUT, not a partial PATCH. Preserve all ordinary editor fields on subsequent writes. The client does not supply authoritative `expectedAmount`, `expectedSnapshot`, receipt amount/history, `payments`, or `wageModel`. V4 rejects non-null base/deduction inputs and nonblank `saveAsPresetName`; manage presets through template PUT.

| Field | Type / meaning |
| --- | --- |
| `contractVersion` | integer `4`; omission retains old V2/V3 request semantics, not nullable schedules |
| `expectedVersion` | integer; `0` new, otherwise latest canonical work `version` |
| `workDate` | ISO local date, interpreted using KST policy |
| `status` | `SCHEDULED`, `COMPLETED`, `OFF`, `CANCELLED`; future COMPLETED rejected |
| `templateId`, `presetId` | UUIDs for working records; null for nonworking |
| `reselectPreset` | explicit true captures canonical current preset even if IDs are unchanged; false preserves old snapshot when IDs match |
| `selectedTemplateVersion` | required canonical template version on create, changed IDs or explicit reselection; template version versions nested presets too |
| `startTime`, `endTime` | local minute time `HH:mm`, or null on nonworking |
| `overnight`, `breakMinutes`, `durationMinutes` | boolean, integer minutes; working duration must equal time interval less breaks, max one day |
| `confirmedDailyPay` | null = unconfirmed; integer 0 = explicitly confirmed zero; positive integer = entered net daily wage |
| `dailyIncentive` | integer included portion; 0 when pay null; 0..pay on new direct confirmations |
| `receiptConfirmed` | absent/null = preserve existing marker; true/false = explicit action |
| `memo` | optional text, max 2,000 characters |

KRW inputs are integers in 0..999,999,999,999. Fractions, negatives, overflow, and incentive exceeding new direct wage fail. Unchanged historical V2 wage/incentive preserves its original component calculation, including a historical incentive greater than net; editing those monetary values uses direct V3 validation. A preset amount is never copied into confirmed wages.

Canonical response includes normal work fields, `id`, incremented `version`, `contractVersion`, `wageModel`, `wageCompatibility`, `confirmedDailyPay`, `dailyIncentive`, and:

```json
{
  "expectedAmount": 42140,
  "templateName": "QA 주간",
  "presetName": "기본",
  "presetAmount": 42140,
  "selectedTemplateVersion": 1,
  "expectedSnapshot": {
    "templateId": "42000000-0000-4000-8000-000000000001",
    "templateName": "QA 주간",
    "presetId": "41000000-0000-4000-8000-000000000001",
    "presetName": "기본",
    "amount": 42140,
    "templateVersion": 1
  },
  "receiptConfirmation": { "confirmed": false, "amount": 0, "revision": 1, "workVersion": 1 },
  "receiptConfirmationHistory": [],
  "receiptConfirmed": false,
  "receiptConfirmedAmount": 0,
  "payments": [],
  "legacyPaymentsReadOnly": false
}
```

`templateSnapshot` also preserves the whole selected template. Older records can lack `expectedSnapshot`/`selectedTemplateVersion`; retain their existing snapshot fields instead of fabricating historical versions. A record with no persisted receipt fact reads as `{ "confirmed": false, "amount": 0, "revision": 0 }`. Technical work/receipt revisions are not deposit dates.

## Required flows

The following are JSON modifications to the complete editor request above; always obtain current record versions first.

```json
[
  { "flow": "new schedule", "changes": { "confirmedDailyPay": null, "dailyIncentive": 0, "receiptConfirmed": false } },
  { "flow": "complete without wage, on/before KST today", "changes": { "status": "COMPLETED", "confirmedDailyPay": null, "dailyIncentive": 0, "receiptConfirmed": false, "reselectPreset": false } },
  { "flow": "positive wage input on COMPLETED auto-selects unsaved ON", "changes": { "status": "COMPLETED", "confirmedDailyPay": 38410, "dailyIncentive": 2000, "receiptConfirmed": true, "reselectPreset": false } },
  { "flow": "user deliberately switches auto-selected marker OFF", "changes": { "confirmedDailyPay": 38410, "dailyIncentive": 2000, "receiptConfirmed": false, "reselectPreset": false } },
  { "flow": "correct paid wage and preserve active marker", "changes": { "confirmedDailyPay": 40000, "dailyIncentive": 2000, "receiptConfirmed": null, "reselectPreset": false } },
  { "flow": "turn paid marker OFF, keep wage", "changes": { "confirmedDailyPay": 40000, "dailyIncentive": 2000, "receiptConfirmed": false, "reselectPreset": false } },
  { "flow": "explicit preset recapture", "changes": { "reselectPreset": true, "selectedTemplateVersion": 2 } }
]
```

Auto-ON is a **client input-event rule only**. Reads, opening a record, rerenders, focusing, migration, and changing SCHEDULED to COMPLETED alone must not auto-confirm. Deliberate manual OFF remains dominant for that editor session, even if wage is edited again; explicit manual ON can undo it. ON with blank/zero/invalid wage or noncompleted status blocks saving until corrected or explicitly OFF. No automatic status change. Closing without Save makes no server change.

The server validates ON using COMPLETED and positive confirmed wage. Preserved ON with a changed valid wage updates the receipt amount atomically and appends the previous receipt fact to history. Explicit OFF retains wage and history, sets active amount to zero. No bank transaction, reversal, partial payment, extra registration, balance due or deposit date is created. Existing V2/V3 wages never imply receipt.

For template changes after selection, stale/missing selected version returns 409; inactive selection returns 400. Keep the draft, fetch the catalog and ask for explicit reselection/reapplication. An unrelated edit with unchanged selected IDs preserves the old expected amount even if the catalog is now changed or inactive.

For OFF/CANCELLED, obtain explicit correction intent, set nonworking monetary/time fields to zero/null, receipt false, and retain an explanatory memo. Prior facts remain in transition/snapshot history. OFF archive is a separate versioned operation. Recreating an archived date reuses its UUID and version; do not generate a replacement UUID blindly.

## Reads and summaries

`earnings-calendar` returns `gridStart`, `gridEnd`, `records`, `archivedRecords`, `weeks`, `summary`, `legacyWeeks`, `legacyDepositWeeks`. Grid spans full Sunday–Saturday rows; summary uses nominal month only. Active working V2/V3 confirmed amounts contribute once; OFF/CANCELLED/removed are excluded. Month fields:

```json
{
  "workdays": 2,
  "workMinutes": 480,
  "confirmedDailyPay": 112970,
  "incentiveTotal": 2000,
  "expectedAmount": 84280,
  "scheduledAmount": 0,
  "scheduledWorkdays": 0,
  "completedWorkdays": 2,
  "completedMinutes": 480,
  "receiptConfirmedAmount": 38410,
  "receiptAggregationBasis": "WORK_DATE",
  "legacyReviewCount": 0,
  "legacyRecordedAmount": 0
}
```

`baseTotal` and `deductionTotal` remain historical compatibility fields. `expectedAmount` totals stored working snapshots; `scheduledAmount` totals current/future scheduled snapshots. Paid daily amounts group by work month/week, exclude weekly allowances, and are not bank cash flow.

Weekly PUT:

```json
{
  "expectedVersion": 0,
  "expectedDailyFingerprint": "<exact dailyFingerprint returned by GET>",
  "specialWorkAllowance": 10000,
  "weeklyHolidayAllowance": 15000
}
```

Response includes `start`, `end`, `version`, `dailyFingerprint`, `workEntries`, `legacyEntries`, `dailyTotal`, `incentiveTotal`, `specialWorkAllowance`, `weeklyHolidayAllowance`, `finalPay`, `expectedAmount`, `receiptConfirmedAmount`, `receiptAggregationBasis`. With daily pay 38,410 and 74,560, the result is `dailyTotal:112970`, `finalPay:137970`; included incentive 2,000 is **not** added again. Month-boundary weeks include both months. Receipt action does not alter this formula.

Warnings use KST: active working and no valid confirmed wage, with `workDate < today` or `workDate == today && status == COMPLETED`. Today's completed wage is due for confirmation, not overdue. Today/future scheduled, OFF/CANCELLED/removed and valid confirmed wages are excluded.

## Concurrency, retries and errors

Writes use the existing owner-level transaction advisory lock. An identical immediately preceding successful request with its original expected version replays the canonical result without incrementing work/receipt revision or duplicating history. This is not an arbitrary durable idempotency-key service: later intervening edits make an old retry stale. Preserve exact pending request/UUID across network uncertainty, reread after uncertain responses, compare, and only explicitly reapply with a reviewed current version. Weekly fingerprint rejects unseen daily changes even when net totals match.

| Status | Meaning / example body |
| --- | --- |
| 400 | Invalid DTO, money/status/time, inactive/invalid preset, receipt precondition; `{ "message": "입금 완료는 양수 확정 일급이 있는 완료 근무만 저장할 수 있습니다. 상태와 일급을 확인하세요." }` |
| 401 | Missing/invalid/expired JWT; body need not be JSON. Reauthenticate/refresh using normal session flow |
| 403 | Credential scope/access denied; workflow-specific development tokens cannot access MONEY |
| 404 | Missing or foreign-owned resource, intentionally indistinguishable; `{ "message": "근무 기록을 찾을 수 없습니다." }` |
| 409 | Stale record version, occupied date, stale selected template, incompatible old writer; `{ "message": "기록이 변경되었습니다. 초안을 보존하고 다시 불러오세요." }` |
| 409 | Preset selection stale; `{ "message": "선택한 프리셋이 변경되었습니다. 초안을 보존하고 템플릿과 프리셋을 다시 선택하세요." }` |
| 405 | Unsupported HTTP method, generic `{ "message": "..." }` |
| 500 | Unexpected server failure; preserve draft, do not interpret as committed success |

Do not rely on localized message matching as an error code. The API currently has `{message}` errors and HTTP status; no invented stable `code`, ETag requirement, or new API version header. Replacing a draft with server data requires deliberate user action; comparison/reload must not silently discard it.

## Preservation and safe fixtures

Persistence is additive work JSONB in existing V84 tables plus existing V85/V86 historical/earnings-week tables. No Task 1 Flyway migration. Audited baseline DEV startup reports schema V87 and up-to-date on 2026-10-17. No old migration was edited.

`payments` may contain historical multiple/partial/overpaid entries and their original dates/UUIDs/links. Treat the entire array as immutable compatibility evidence. It is never a receipt instruction and is never automatically converted into a confirmation. Do not send it in companion writes or show editable payment dates/partial-payment controls. V2 components, UUIDs, expected snapshots, legacy wage snapshots, transition history and weekly originals remain preserved.

Fixture plan: use a named `QA Coupang 20261017` template and record only explicitly empty dates; record exact created UUIDs and preexisting versions. Never modify an actual existing work record. API cleanup can explicitly set owned test work OFF (zero/null wage, incentive 0, receipt false), then `POST remove-off`, and deactivate only the created template while preserving its preset IDs. This leaves archived fixture evidence; it is **not** a physical row deletion. For complete physical cleanup, an authorized DB operator must verify the recorded UUID manifest and owner, zero legacy payment references and no unexpected dependencies, then remove only those exact fixture IDs in a transaction. No date-range/owner-wide DELETE, global reset, migration repair, cascade, or ledger operation is authorized by this handoff.

The six actual DEV fixtures and two templates are allowlisted in `qa/coupang-dev-fixture-cleanup.mjs`. With an authorized DEV JWT file, set `COUPANG_DEV_ACCESS_TOKEN_FILE` and run its default read-only validation before considering `--execute`. The closeout attempted default mode but it exited before any HTTP call because the token-file environment variable was absent; no validated dry-run or execution is claimed. The 2026-10-17 fixture was intentionally changed by fresh QA (six successful PUTs plus one archive POST), then restored to COMPLETED/null/receipt OFF using its original UUID. Its old version-1 guard is now stale by design. Keep the guard until canonical versions/history and the documented QA request sequence have been reconciled; do not blindly weaken checks or execute the old manifest. Other fixture/template/week writes were not made during closeout. Full cleanup remains pending. See the release report and sanitized closeout HTTP evidence.

`qa/coupang-dev-login.ps1` is a normal password-grant helper for an owner to type DEV credentials locally; it stores only an access token with a user-only Windows ACL after an authenticated read succeeds. It prints no credentials and does not change data. It has only been parsed, not authenticated or run. Do not confuse an already signed-in Chrome session with an independent client credential. Never upload its token file.

At task completion always update the existing [shared Task 1 Drive folder](https://drive.google.com/drive/folders/1aF3qGk8Vww1G8Za7SI7vdUaWOOwOnSpT), retain local copies, and verify uploaded contents/metadata. See `agent/OPERATING_POLICY.md`. Uploading does not imply API readiness or PROD authorization.

A16 (real Android↔Web E2E) and A17 (Flip6/Android 16/device/accessibility) remain Task 2 gates. Task 1 evidence, current deployed SHA, A01–A15/A18/A19 coverage, fixture cleanup and any missing authenticated endpoint/DB gates are recorded in the linked release report.
