# MONEY Bridge — Batch 4

Status: implemented; automated/DEV device checks passed; browser gate and PROD release/device acceptance pending. This is not a completion claim.

## Identity and enrollment

POS Web keeps its existing Supabase ES256 JWT authentication and owner subject.
Authenticated `POST /api/money/bridge/enrollments` issues a random 256-bit,
five-minute, single-use enrollment code. `POST /api/money/bridge/exchange`
exchanges it plus a random Android installation UUID for a 30-day credential.
Both replies use `Cache-Control: no-store`. Database storage contains SHA-256
digests only. No token, enrollment code, financial body or exception-derived
content is intentionally logged by the Bridge implementation.

The enrollment exchange is the sole public Bridge route. The code is an
unguessable one-time capability bound to the existing POS owner. There is no new
user account system, embedded shared secret, or service-role Supabase key.
On DEV, enrollment management uses the existing trusted loopback DEV owner.
Never expose the unauthenticated DEV profile publicly.

`Authorization: Bearer mb1_…` selects a stateless, narrow security chain. It can
only POST the existing `/api/money/notifications` route. It cannot read raw
notifications, accounts, ledger data, or manage devices. The server resolves
owner/device/install identity from the digest record; an asserted owner is not
trusted. The install ID must match the body, and bank package and delivery-key
shape are checked before canonical ingest. Existing JWT-based Web access remains
unchanged. Normal ingest maintains owner-scoped dedupe and conflict detection.

Owner-scoped `GET /api/money/bridge/devices` exposes structural receipt counts,
last request/status, expiry, and revocation. `DELETE /devices/{id}` revokes
immediately for subsequent authentication checks. In-flight requests may finish.
Re-enrollment on the same owner/install rotates the credential and invalidates
the previous one. Expiry/revocation requires manual re-enrollment; credentials
cannot renew themselves indefinitely. A lost enrollment response requires a fresh
code, because exchange consumption is atomic.

V56 is additive: `money_bridge_enrollments`, `money_bridge_devices`, server-only
RLS tables, no policies granted to anon/authenticated. No applied migration was
edited. V51 Checklist / V52 absent / V53 Diet / V54 MONEY processing / V55 product
remain canonical.

## Android transport

Repository: `D:/DEV_SPACE/money-sys-mobile`. Minimum API 26, compile/target 35;
tested hardware Galaxy Z Flip6 SM-F741N, Android 16. Explicit DEV/PROD selector;
default PROD with Bridge OFF. DEV is debug-only `https://localhost:8443`; PROD is
`https://personal-work-os-prod-production.up.railway.app`. PROD uses system TLS
trust; only the localhost domain in debug builds trusts the existing local
certificate. No redirects, TLS bypass, arbitrary host, or fallback to DEV.

Android Keystore AES-256-GCM protects credentials and undelivered bodies. Random
IVs plus authenticated row/environment/owner context prevent record swapping.
Private SQLite storage keeps stable callback UUID/delivery key, capture time,
original payload, owner/environment/install binding, state, attempts, and error
category. The exact body/key is reused across retries. No secrets enter
WorkManager input, logs, notifications, or saved Activity state.

WorkManager handles connected-network work and exponential backoff (30 seconds
initial). Each delivery has unique work; a periodic 15-minute recovery scan and
app/listener startup repair the DB-commit/enqueue crash window. Interrupted
SENDING rows are retryable. NETWORK/408/429/5xx retry; auth, validation, conflicts,
redirects and TLS failures require intervention. Auth failure blocks further
network attempts until enrollment. Manual retry preserves the original identity.
Bridge OFF pauses work; changing environment/allowlist also turns it OFF. Queued
events cannot cross owner/environment boundaries. Removal from the allowlist
pauses the relevant rows; explicit local deletion remains available.

Only user-selected installed packages from Shinhan, IBK, Woori and KakaoBank are
eligible; unknown packages are rejected before extras access. The phone does no
bank parsing or financial classification. The sole empty-callback exclusion
requires ID 0, the observed aggregate key pattern, Android group-summary flag,
all exposed text fields empty, and no unreadable/truncated fields. Uncertain
callbacks remain eligible and can receive the existing HTTP 400.

Successful upload removes the encrypted body immediately. At most 200 SENT
structural records remain; up to 1,000 undelivered records are retained without
silent eviction. A full/damaged queue increments the visible capture-error
counter; it cannot promise lossless capture when storage is exhausted. Backup
and device transfer remain disabled. Screenshots remain allowed on structural
diagnostics; only the enrollment-input dialog is protected.

## Operational limits

No historical notification harvesting. Android/OEM restrictions, force-stop,
pre-unlock reboot state, redaction and battery policy can delay/prevent callbacks.
WorkManager offers eventual delivery, not an instant-send SLA. A package allowlist
cannot distinguish a bank's transaction alert from a security/OTP alert; Android
redaction is respected and not bypassed. No general notification archive,
analytics, mobile ledger, Mobile MVP, parser change, matcher change or account
configuration hardcoding was added.

The locally signed debug APK is a diagnostic distribution, not Play Store
distribution/signing automation. Production financial validation must use real
user-created account settings. Unknown accounts correctly enter Review Required.

## Validation evidence at implementation checkpoint

- Android: 51 JVM/Robolectric tests; debug APK and lint pass (0 errors, 18 warnings).
- Real hardware: Keystore round-trip/context integrity, public PROD TLS with
  anonymous ingest 401, DEV enrollment/ingest/retry/revocation passed (3 tests).
- DEV device: one synthetic source persisted once; retry returned the duplicate
  path; parser scheduler produced REVIEW_REQUIRED; no ledger transaction.
- Backend: 63 passed, one historical opt-in audit skipped in isolated MONEY
  schema; after enrollment error-handler fix, eight affected security tests pass.
- Web: eight focused tests pass; lint, TypeScript and optimized build pass.
- Shared DEV normal startup validated 55 migrations and applied only V56.
- Browser QA is pending: direct foreground Next start on 3016 was rejected by
  automatic approval review. No supported managed browser runner exists; the
  owner was asked to start the already-built frontend. Existing 3015 remains
  untouched and cannot validate this feature revision.
- PROD remains at Batch 3 until required browser validation passes. No PROD
  financial fixtures or credentials have been created by this batch.

Reference guidance: [Android Keystore](https://developer.android.com/privacy-and-security/keystore),
[WorkManager retry](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work),
[Spring Security chains](https://docs.spring.io/spring-security/reference/servlet/architecture.html).
