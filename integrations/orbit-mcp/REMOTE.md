# ORBIT remote MCP / OAuth

Production: **https://orbit-pos-mcp-prod-production.up.railway.app/mcp**
DEV: https://orbit-pos-mcp-dev-development.up.railway.app/mcp
The dated release handoff records actual deployment/validation state.

## ChatGPT connection

1. Add **ORBIT POS** in ChatGPT's MCP server/app settings as **Streamable HTTP**,
   using the production /mcp URL.
2. Choose **OAuth / Dynamic Client Registration (DCR)**, scope **orbit:read**.
   Leave static Bearer/API-key fields blank. Discovery supplies the OAuth URLs.
   CIMD is not advertised.
3. Use the exact callback shown by ChatGPT. Registration permits the stable
   https://chatgpt.com/connector_platform_oauth_redirect and OpenAI's callback-ID
   HTTPS paths; authorization uses exact URI comparison. No wildcards.
4. Continue through normal POS sign-in/identity consent, then review the
   downstream client, full callback and20 personal read permissions on ORBIT's
   separate consent screen. The existing TEAM KAFKA session is reused.
5. Enable only the20 ORBIT tools. Ask:
   “최근14일 체중 기록과 누락일을 POS 원본 기준으로 조회해 줘.”
6. Observe a real authenticated get_diet_context invocation/JSON in that chat.
   Until then: **ChatGPT integration: NOT VERIFIED**. Inspector/browser/direct
   HTTP calls alone do not satisfy this final gate.

## Protocol and trust boundary

POST /mcp uses the official SDK's stateless Streamable HTTP transport.
Authenticated GET/DELETE return405. The existing20 typed tools perform only
bounded fixed-origin POS GETs; no SQL/general HTTP/write/environment tool exists.

Both /.well-known/oauth-protected-resource and its /mcp variant advertise the
exact HTTPS /mcp resource, this origin as issuer and orbit:read. OAuth/OIDC
discovery supplies /auth, /token, /reg, /jwks and S256. 401/403 use discoverable
WWW-Authenticate challenges. Pinned oidc-provider implements code/refresh
semantics, exact registered redirects, client binding and mandatory PKCE S256.
Non-code grants, arbitrary callback hosts, remote JWKS/sector URLs and unsigned
request objects are rejected. DCR is throttled/capped; names alone are untrusted.
OIDC discovery also advertises openid (subject only). OpenAI's optional openid
request is supported with ES256 ID tokens; it grants no email/profile or POS data
scope. MCP still requires a separate at+jwt token with exact orbit:read audience.

The broker starts an independent native GoTrue code+S256+nonce flow. A manually
registered upstream client has exactly /interaction/upstream as its callback;
native GoTrue DCR remains disabled. /oauth/consent on the existing POS frontend
permits only that configured client/callback and openid identity scope.
Passwords and normal browser refresh tokens never reach MCP.

Upstream ES256 signature/issuer/authenticated audience/expiry/UUID subject and
native client_id are validated; ID tokens also require the correct client
audience and nonce. Downstream consent checks the interaction cookie, exact
Origin and single-use CSRF value. ChatGPT receives a separate short-lived MCP
JWT, never a POS token. Each MCP request verifies ES256, issuer, exact /mcp
audience, expiry, UUID subject, client, active grant and exact orbit:read scope.
Refresh rotates; reuse/code replay revokes its grant. Other users stay isolated.

POS itself additionally restricts OAuth tokens to the configured ORBIT native
client and exact20 GET routes. Every write and unrelated POS API is denied;
normal nondelegated login is unchanged. MONEY/medical/source-record policy is
unchanged and no business records or schema are modified.

## Runtime and storage

Node24.22.1; npm ci / npm test / npm start. Docker installs production dependencies,
initializes only its /data mount then drops to node. One replica per environment
is required for SQLite and the per-user upstream refresh lock.

The dedicated512MB volume stores only OAuth clients/grants/sessions/transient
state/signing keys/tokens, AES-256-GCM encrypted with fresh nonces and per-record
AAD. Token IDs and secondary identifiers are hashed. ORBIT_MASTER_KEY remains
in Railway variables, separate from the volume; never log/copy/rotate it casually.
Preserve both across releases. Platform volume snapshots hold ciphertext;
restoring an older snapshot can require reauthorization after refresh rotation.
No POS DB connection, credential, service-role key or business dump is present.

Required variables: ORBIT_POS_ENV (DEV/PROD), ORBIT_ISSUER (HTTPS origin),
ORBIT_UPSTREAM_CLIENT_ID, POS_AUTH_ISSUER, POS_AUTH_PUBLISHABLE_KEY,
ORBIT_MASTER_KEY (32 random bytes, hex), ORBIT_DATA_DIR=/data, PORT=3000.
POS_USER_ACCESS_TOKEN, DATABASE_URL, RAILWAY_TOKEN and DEBUG fail startup.
The fixed-target provision helper uses the existing official Railway CLI
environment loader; signing/DB credentials are never copied to the MCP service.

Code60s; access300s; refresh/grant30days; session8h. Input64KiB; POS output256KiB/
15s. User60 calls/min; IP180 requests/min; DCR10/hour and256 clients. Limits are
per instance. Request/body/header/query/identity logging, debug and Railway
tracing/eBPF are disabled. Responses are private/no-store. Retained titles remain
sensitive, not guaranteed anonymous. /health is data-free and public.

Tests cover real OAuth HTTP,20 SDK calls per synthetic user, CSRF, exact redirect/
resource checks, negative JWTs, replay/rotation and vault encryption. Official
MCP Inspector2.15.0 performs list and call. QA injects fresh tokens only in child
memory and reduces personal results to counts/status; no tokens in OS arguments,
files or reports. Hosted tests use normal POS sign-in, not invented user JWTs.

Primary guidance checked2026-11-13:
https://developers.openai.com/plugins/build/auth
https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
https://supabase.com/docs/guides/auth/oauth-server/getting-started
