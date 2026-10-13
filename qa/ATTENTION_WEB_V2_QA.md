# WORK QUEUE WEB V2 validation

The browser must reuse the verified existing TEAM KAFKA Chrome profile. Do not
run the generic QA Chromium launcher for this task. No Computer Use, tab-group
API, CDP attachment, copied profile, cookie export, or new browser login is used.

`node qa/attention-web-v2-runtime.mjs` starts owned loopback PostgreSQL, the
canonical Spring API and the production Next build, with 161 synthetic items.
The DB never connects to shared DEV/PROD. Type `stop` in the owned PTY to stop
only its child handles. Logs and the synthetic database are retained for audit.
`node qa/attention-web-v2-runtime.mjs web-v2-<owned-run-UUID>` resumes that exact
stopped database after checking its ownership marker, process and path.

Frontend environment for building this fixture:
`NEXT_PUBLIC_APP_ENV=dev`, `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:13223`, blank
Supabase settings. This uses the existing loopback DEV identity, never a hosted
auth bypass. Hosted DEV and PROD must separately be tested with the existing
authenticated TEAM session.

Browser DOM, clicks, text entry and screenshots use the installed browser SDK's
Playwright API through Node REPL. The SDK does not expose locator.dragTo/mouse.
`attention-web-v2-pointer.ps1` supplies actual trusted Windows pointer input only
after matching the recorded TEAM Chrome PID/executable/user-data-dir/profile,
an exact localhost QA URL in its address bar, and the current viewport rectangle.
Its recorded PID is session-specific: rediscover and verify it before future use.
It rejects unknown/personal windows and coordinates outside the QA viewport.
Coordinates come from read-only DOM bounding rectangles, never guessed pixels.
No DOM-dispatched synthetic drag events substitute for browser pointer testing.

For cancellation or frozen-incoming checks, `hold` leaves the mouse pressed.
Inspect drag preview/insertion and actual API state, then use Playwright
`getByRole('button', {name:'완료 기록', exact:true}).press('Escape')`. Always run
`release` in finally with current verified viewport dimensions. A body/div press
is unsuitable because Playwright focus/scroll can shift a large list. Only API
acknowledged state establishes movement success. Completion checkboxes immediately
disappear, so click them rather than setChecked(true), then poll the canonical API.

Required browser cases are recorded in the external implementation evidence:
Stack, three groups, provenance/fallback, memo separation/save/refresh, A→B→C,
within-lane, empty drop, Escape, control exclusion, independent Stack order,
completion/undo, history/search/reopen, source links/recovery, frozen incoming,
409 draft retention/manual resolution, 161 items and narrow layout. Additional
tests cover invalid drops, keyboard moves, group limit/rename and quick capture.

Unit command (from frontend):
`node node_modules/tsx/dist/cli.mjs --test app/workflow/attention/cardModel.test.ts app/workflow/attention/AttentionCard.test.tsx lib/api/attentionConditional.test.ts`

Backend focused checks: `*AttentionCorsTest`, `*SecurityProfileIsolationTest`,
`*ProdSecurityConfigJwtDecoderTest`. No applied migration is edited. CORS only
exposes ETag to already permitted origins; no authentication boundary is relaxed.
