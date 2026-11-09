# ORBIT authenticated tool adapter V1

This local stdio MCP adapter exposes exactly the approved 20 read operations.
Run with Node 24+: `node integrations/orbit-mcp/server.mjs`. Configure the trusted
host environment with `POS_API_BASE_URL` (the exact approved DEV or PROD API
origin) and `POS_USER_ACCESS_TOKEN` (a short-lived POS user JWT). Never paste
tokens into chat or save them in MCP configuration, Git, logs or handoffs. There
is no refresh token store. Expiration requires reauthentication through the
normal POS user session. Workflow service tokens and database credentials are
not accepted. This adapter never writes to POS, follows redirects, or exposes a
generic HTTP/SQL tool. Responses are limited to 256 KiB and 15 seconds.

`node --test integrations/orbit-mcp/server.test.mjs` validates discovery,
arguments, origin restrictions, auth placement, output bounds and safe errors.
These tests use synthetic responses, not a live ChatGPT call.

## Hosted ChatGPT activation is still required

The shipped adapter is **not an installed ChatGPT connection**. It supports
local MCP hosts. A hosted ChatGPT Work chat needs an installed plugin/remote
MCP connection and normal per-user authorization. Do not configure this stdio
process as an unauthenticated public server or pass a POS token as a URL.

Official guidance checked 2026-11-09:

- https://learn.chatgpt.com/docs/extend/mcp
- https://developers.openai.com/plugins/build/auth

For hosted activation, deploy a separate authenticated remote MCP transport
with the same 20-tool allowlist. Configure a standards-compliant authorization
server for authorization code + PKCE S256, protected-resource and authorization
server metadata, the exact callback shown by ChatGPT, per-tool security schemes,
and verified issuer/audience/expiry/scopes. Issue audience-bound adapter tokens;
do not blindly relay a token intended for another audience. This repository has
not added or claimed that OAuth authorization server. Existing Supabase resource
JWT verification is not proof of ChatGPT OAuth client registration or consent.

Owner steps once that remote deployment exists:

1. Open ChatGPT's MCP/plugin settings and install the approved ORBIT connection.
2. Confirm its callback URL/client metadata in the authorization-server setup.
3. Complete the POS sign-in and consent in the normal browser authorization UI.
4. Enable only the 20 read tools in the target conversation.
5. Ask: “최근 14일 체중 기록과 누락일을 POS 원본 기준으로 조회해 줘.”
6. Observe an authenticated `get_diet_context` tool call and JSON response.

Until step 6 is observed, report **ChatGPT integration: NO**. Browser/API smoke,
MCP catalog tests and backend deployment do not establish in-chat integration.
