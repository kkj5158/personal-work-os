# KAFKA Morning Gateway V1

Development foundation, 2026-10-17. The voice module is isolated under
`com.kafka.backend.morning` within the existing Spring Boot application. Real
provider authorization is disabled by default. No provider call, Agent mutation,
shared database migration, deployment or billing change is part of implementation validation.

## API contract

Base: `/api/orbit/morning/v1`. All routes require a verified Supabase Bearer JWT
under `hosted-dev` or `prod`; `dev` rejects the entire namespace even when the
existing POS API permits unauthenticated access. This highest-priority dedicated
filter chain also precedes unrelated workflow, attention and bridge token chains.
The existing ES256 signature/issuer/audience/timestamp decoder remains unchanged.
The service independently requires an authenticated JWT UUID subject, and never
uses `DevCurrentUserProvider` or accepts a client owner/provider/model selection.
Authorization additionally requires the subject in the server's owner allowlist.

| Method | Path | Body / behavior |
|---|---|---|
| GET | `/capabilities` | Authenticated readiness; no credential issuance |
| POST | `/voice-sessions/authorize` | `{occurrenceId:UUID, attemptId:UUID, accepted:true}` |
| GET | `/voice-sessions/{sessionId}` | Owner-scoped lifecycle/usage; never returns credential |
| POST | `/voice-sessions/{sessionId}/events` | `{eventId:UUID,event:"CONNECTED"}` |
| POST | `/voice-sessions/{sessionId}/end` | `{eventId:UUID,reason:"ENDED"|"FAILED"|"INTERRUPTED"}` |

Clients generate occurrence, attempt and event UUIDs, persist them, and authorize
only after explicit Answer and permission checks. `accepted:true` records a client
assertion; the server cannot independently observe a physical tap. Mock mode is
local Android behavior and does not require these endpoints or provider credentials.

Readiness shape: `{realProviderEnabled:boolean,provider:string|null,
release:string|null,status:string,capabilities:object|null}`. An incomplete/disabled
configuration returns HTTP 200 readiness with `realProviderEnabled:false` and an
explicit status; an unauthenticated request is still HTTP 401.

Successful authorization is HTTP 200, with no-store/Pragma headers:

```json
{
  "sessionId": "UUID",
  "attemptId": "UUID",
  "provider": "elevenlabs",
  "release": "server-approved-release",
  "transport": "provider_sdk",
  "expiresAt": "ISO-8601 UTC instant",
  "sessionDeadline": "ISO-8601 UTC instant",
  "maxDurationSeconds": 300,
  "capabilities": {
    "streamingAudio": true,
    "microphoneMute": true,
    "interruption": false,
    "transcription": true,
    "sessionResumption": false,
    "toolCalling": false,
    "usageReporting": false,
    "serverSideTurnDetection": true
  },
  "connection": {
    "type": "elevenlabs_webrtc_token",
    "conversationToken": "TEMPORARY VALUE, NEVER LOG"
  },
  "usageStatus": "UNRECONCILED"
}
```

`expiresAt` is the returned provider token's `exp`, parsed only for conservative
reservation accounting. It does not authenticate the application user. Tokens
without a bounded future expiration or beyond the approved maximum age are denied.
`sessionDeadline` conservatively includes the maximum credential validity plus
the approved provider session duration. Android separately applies
`maxDurationSeconds` to its media lifecycle. The gateway records end reports;
direct media teardown is the Android adapter's responsibility.

Session GET/end/events responses contain `sessionId`, `occurrenceId`, `attemptId`,
`provider`, `release`, `status`, `createdAt`, `expiresAt`, `sessionDeadline`, and
`usage`. Usage contains `providerStatus`, `usageStatus`, `credentialIssuedAt`,
`clientConnectedAt`, `clientEndedAt`, `durationSeconds`, `inputTokens`,
`outputTokens`, `audioTokens`, `providerCredits`, `reservedMaximumCost`,
`estimatedCost`, `finalReportedCost`, `currency`, `pricingVersion`. Unsupported or
unreconciled metrics are null, never fabricated. Provider status remains
`UNVERIFIED`; client connection/end claims do not establish billable provider usage.

Error responses: `{code:string,message:string}`, no-store, with no upstream error,
body, SQL or token details. The client should use `code`, not parse `message`.

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_REQUEST`, `EXPLICIT_ACCEPTANCE_REQUIRED` | Invalid request / no acceptance |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid JWT or insecure dev profile |
| 403 | `VOICE_ACCESS_DENIED` | JWT owner not approved for billable voice |
| 404 | `SESSION_NOT_FOUND` | Missing session or another owner's session |
| 409 | `DUPLICATE_ATTEMPT` | Existing occurrence OR attempt; no new credential |
| 409 | `EVENT_CONFLICT`, `INVALID_SESSION_TRANSITION`, `SESSION_TERMINATED` | Invalid lifecycle/race |
| 429 | `PROVIDER_QUOTA_EXCEEDED` | Durable admission budget/limit or upstream quota |
| 503 | `PROVIDER_DISABLED`, `BUDGET_POLICY_REQUIRED`, `PROVIDER_CONFIGURATION_PENDING` | Safe default or missing approval/configuration |
| 503 | `PROVIDER_UNAVAILABLE`, `CREDENTIAL_EXPIRED`, `GATEWAY_UNAVAILABLE` | Explicit provider/gateway failure |

An authorization retry never reissues for the same owner/occurrence or
owner/attempt, even after failure, completion or restart. Duplicates return 409,
not a new token or a persisted copy of the old token. After a lost authorization
response, use the locally known session where available; otherwise retain the
local wake-up fallback. Do not generate a fresh attempt/occurrence to circumvent
limits. No automatic paid provider fallback or retries exist.

## Approved release and provider boundary

`MorningCredentialBroker` registers a provider key, connection type and credential
issuance adapter. `MorningVoiceProperties` resolves the active release server-side;
session admission snapshots the release and version. Existing sessions do not
change when a future release is selected. Gemini/OpenAI/custom adapters are absent
and explicitly rejected until registered and approved. Their usage fields and
typed connection boundary can be extended without changing alarm/wake-up domains.

The ElevenLabs broker uses the documented
[GET conversation token](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
endpoint with `agent_id`, mandatory pinned `version_id`, optional `branch_id`,
explicit environment and debug events disabled. It uses a fixed HTTPS provider
endpoint, redirects disabled, connection/request timeouts, and only an
environment-sourced `xi-api-key`. It never edits Agents or defaults to an unpinned
Main Agent. Returned temporary credentials are response-only, absent from the
registry, with redacted `toString`. Never enable request/response body logging for
these routes at a reverse proxy or application diagnostics layer.

Sample configuration: `backend/config/morning-voice-hosted-dev.example.yml` is
documentation-only and is not automatically loaded. It contains no actual IDs,
credentials, owner, pricing approval or enabled policy. Configure an authenticated
development target first. The real APK's gateway URL must be a reviewed reachable
HTTPS target; the desktop Voice Lab URL is not a gateway.

## Durable security and budget controls

Flyway inventory inspected before authoring: existing migrations through V88.
V89 adds only three voice tables and one index: `morning_voice_owner_guards`,
`morning_voice_sessions`, `morning_voice_client_events`. It has not been applied
to shared DEV/PROD. It does not alter financial, Sleep, WORK FLOW or auth rows.
JDBC avoids adding JPA entities or changing existing domain persistence.
All three server-only tables enable PostgreSQL RLS without client policies and
revoke privileges from PUBLIC, anon and authenticated roles, matching existing
credential-table hardening. Application ownership checks still apply. H2 fixture
execution omits only those PostgreSQL-specific RLS/privilege statements; their
runtime enforcement remains part of the later controlled PostgreSQL audit.

Reservation transaction obtains a per-owner database row lock before checking
unique occurrence/attempt, UTC-day session count, conservative maximum reserved
cost and concurrency. Unique DB constraints provide a second duplicate barrier.
An owner may not change accounting currency during an active UTC day's ledger.
Separate processes share the same guard rows; reservations survive JVM restart.
Credential issuance happens only after the reservation commits. Ambiguous failures
remain reserved and do not automatically retry. A crash after issuance and before
recording cannot create a second token for that occurrence.

Client end, failed or interrupted reports do not refund budget or release the
concurrency reservation before the deadline, because the gateway cannot prove
that a direct provider connection has stopped. This deliberately favors bounded
admission over fast retry. Daily reservations do not expire mid-day or refund
from untrusted client usage. These are admission ceilings, not independent
verification of final provider charges. Activation requires an approved
worst-case per-session cost, pricing version, currency, maximum duration, owner
allowlist and externally verified provider-side hard duration limit. No provider
configuration was changed or asserted verified during this implementation.

## Deferred operations and rollback

Real billing reconciliation, trusted provider status/webhook ingestion, finalized
costs and raw usage parsing are future server adapters. No client may set cost,
token counts or provider final status. No raw audio, transcript, memory or summary
is persisted by this module. Summary/memory consent and retention remain separate
domains; no fabricated summaries are produced.

Before enabling real development calls: inspect live migration history and
collisions, deliberately apply reviewed schema under the repository's serialized
DEV process, configure valid Supabase auth, approve a nonproduction pinned Agent
release and pricing/hard limit, provide server-only credentials, confirm Android
authentication provisioning, then obtain the user's separately scoped paid-call
approval. Actual provider token expiry/SDK handshake and pinned version behavior
require that later authorized provider verification.

Disable immediately with `kafka.morning.voice.enabled=false`. Existing direct
media sessions must still be ended by their clients/provider limits; disabling
does not revoke already issued tokens. Keep the additive ledger tables and
reservations; do not drop them to roll back admission behavior. No deployment or
infrastructure rollback was performed.

## Validation scope

The automated suite uses isolated H2 databases and an in-process loopback provider
fixture. It tests JWT route isolation, insecure dev denial, absent/invalid tokens,
owner checks, default-disabled and incomplete release/budget rejection, duplicate
and restart safety, concurrent reservations, untrusted end reports, event replay,
credential expiry, pinned provider request parameters and safe failure responses.
The existing real ES256 decoder tests run against local JWKS fixtures. These do
not establish live PostgreSQL concurrency, a deployed endpoint or paid provider
readiness. Shared databases, live provider credentials, physical devices and
production deployment are outside this evidence.
