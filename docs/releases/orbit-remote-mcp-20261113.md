# ORBIT remote MCP / OAuth release — 2026-11-13

Production URL: **https://orbit-pos-mcp-prod-production.up.railway.app/mcp**.
DEV URL: https://orbit-pos-mcp-dev-development.up.railway.app/mcp.
Server, OAuth and20 read tools are verified. **Actual ChatGPT in-chat call:
NOT VERIFIED**. The dedicated browser's POS sessions worked; its ChatGPT web
tab was observed signed out. Owner authentication is pending. Do not equate
the release harness's intercepted callback, SDK or Inspector with ChatGPT.

## Sources and changes

Current owner request authorizes remote MCP implementation and DEV/PROD deploy.
The earlier ORBIT handoff supplies the existing20-tool API contract. Canonical
`agent/` policies and TEAM KAFKA browser policy were followed. Global policy
document `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU` was read at
observed modified time2026-10-25T02:05:15.433Z. Optional unrelated references
were not treated as new task requirements.

PR #11 merged to DEV as874ce96; be1c7ee fixes browser consent Origin behavior;
c2dc7ca supports OpenAI's optional openid registration with subject-only ES256
ID tokens. PR #12 merged to PROD as **c9240a20dda680fa2788db642bd5855538b49257**.
Product trees match the tested DEV c2dc7cab5f9fa14c1caa6baa8a738b26a2293f2f.
Existing Workpad f604162 is retained. No existing feature rewrite or business
schema/data migration was introduced.

The official SDK stateless Streamable HTTP transport reuses the exact existing
20-tool catalog and bounded fixed-origin GET adapter. A pinned oidc-provider
authorization server implements code+S256, DCR, exact ChatGPT callbacks,
explicit consent, metadata, short-lived ES256 resource tokens and rotating
refresh. Independent native GoTrue OAuth preserves POS user identity. Each
resource call checks issuer/audience/expiry/subject/client/active grant and
orbit:read. Native delegated POS tokens are additionally confined to the exact
20 GET routes; writes and unrelated API paths return403.

The dedicated AES-256-GCM OAuth vault has no POS database connection or static
user JWT. No password/browser refresh token is relayed. Request/response body,
query, identity and credential logs are disabled; Railway tracing/eBPF is off.
One replica and a512MB /data volume per environment are required. Keep the
volume and master key together across compatible releases. Limits and required
variables are documented in [REMOTE.md](../../integrations/orbit-mcp/REMOTE.md).

## Observed deployment state

| Environment/service | Source | SUCCESS deployment |
|---|---|---|
| DEV MCP | c2dc7ca | f1925808-7da5-4c18-9e5d-c71cf2b465c6 |
| DEV API | c2dc7ca | 379bc560-7aec-4694-8bea-6726acd634ed |
| DEV Web | 874ce96 | 9bff997f-5be2-44fc-81b2-6233c529038b |
| DEV Auth | 874ce96 | b3966c4d-4f75-4cd5-9871-67b81d9c30df |
| PROD MCP | c9240a2 | b88b28fa-7158-4183-9b8b-b23669bbc47b |
| PROD API | c9240a2 | 5f990d17-f39b-4919-8aa6-8a3f89ccab80 |
| PROD Web | c9240a2 | abfb5c98-b964-4915-b57a-27ae9d14001a |
| PROD Auth | c9240a2 | aaa8e90c-3974-46d5-aeca-e9b7df6604f4 |

No pending Railway patches were observed. API/MCP follow dev/prod without a
source pin; Web/Auth keep their validated release pins. PROD native SITE_URL
was corrected from the old Web alias to https://kafka-sys.life. This fixes
authorization consent routing to the origin with the retained normal login.
Native OAuth DCR remains disabled; downstream ChatGPT DCR is supported.

## Checks and boundaries

- Node24.22.1:12 tests PASS,0 FAIL,0 SKIP. Real local HTTP authorization,
  two synthetic users ×20 tools, exact redirects/resources, PKCE, CSRF/Origin,
  negative signature/issuer/audience/expiry/identity/scope, ID-token rejection
  at MCP, code/refresh replay, rotating refresh and encrypted vault reopen.
- Backend focused127 PASS,0 FAIL,0 SKIP, including108 HTTP cases with signed
  JWTs; bootJar PASS. The task-owned isolated PostgreSQL runner was removed.
  Historical full-core1470/Nov10 counts were not rerun for this release.
- Production Next.js build PASS, including /oauth/consent. Actual Railway
  DEV/PROD Web builds also succeeded. npm production dependency audit:0 known
  vulnerabilities at validation time; this is not a perpetual security claim.
- Hosted DEV and PROD: normal POS consent→code exchange→20/20 tools→valid
  JSON; prohibited response keys0. Official MCP Inspector2.15.0 tools/list20
  and tools/call PASS in both environments. Tokens existed only in QA process
  memory, not OS arguments, configuration files, Git, reports or tool output.
- Hosted negative checks: anonymous401 with discovery challenge, foreign
  redirect400, user selector rejected. Refresh rotates and preserves identity.
  Service restart plus refresh and authenticated read PASS in both environments.
- Actual hosted second-account switching was not performed this release;
  two-user OAuth isolation uses synthetic identities locally. No personal
  record create/update/delete was used for QA. Only intended OAuth client,
  grant, consent and token state was created in the authorization stores.
- Final QA refresh grants revoked in DEV/PROD. Bounded QA DCR registrations
  remain as OAuth metadata. No public maintenance endpoint, new SSH credential,
  DB dump, volume reset or unrelated cleanup was introduced for their removal.
- Actual authenticated ChatGPT call, ChatGPT tool visibility and account/plan
  entitlement are NOT VERIFIED. OAuth consent and Inspector are separate gates.

## Connect ChatGPT

Add an MCP app named ORBIT POS using the production /mcp URL and OAuth/Dynamic
Client Registration. Leave static credentials blank. Select orbit:read; optional
openid is supported and supplies only sub. Discovery supplies endpoints. The
exact ChatGPT HTTPS callback must match registration; no arbitrary host or
wildcard is accepted. Follow normal POS identity consent, then ORBIT's separate
read permission consent. Enable the20 tools and ask a record-grounded question
such as “최근14일 체중 기록과 누락일을 POS 원본 기준으로 조회해 줘.”

Only after observing a genuine authenticated get_diet_context call and JSON
inside that ChatGPT conversation can the in-chat status change to VERIFIED.
Never paste a POS JWT or an OAuth token into ChatGPT configuration or chat.

## Operations and recovery

Prefer compatible roll-forward. Preserve existing POS features, DB/objects,
OAuth volumes, master keys and native client IDs. Ordinary restarts must not
recreate keys or erase grants. A volume restore contains ciphertext and can
require reauthorization after refresh rotation. Scaling to multiple replicas
requires a different shared OAuth store and coordinated refresh/rate limiting;
the current release intentionally runs one replica per environment.

The dated Korean report, English handoff and scrubbed evidence archive are
delivered separately to Kafka_AI_WorkSpace/10_POS. Upload completion, final
cleanup and actual in-chat status must be read from the delivered report;
the existence of this document alone does not establish those outcomes.
