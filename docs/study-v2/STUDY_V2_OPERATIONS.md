# STUDY V2 operations

Date: 2026-11-15, Asia/Seoul. Use the consolidated implementation report for actual deployment/check status. These instructions do not authorize PROD, paid providers, new services or credential changes.

## Local worker

Requirements: Node, existing authenticated Codex CLI or a locally installed Ollama model, and access to the authorized DEV backend. The shipped worker uses outbound HTTPS polling; Railway cannot use a laptop's login by itself.

1. In the signed-in DEV STUDY Coach screen, open local worker management and issue a seven-day connection file. Protect it in a private local folder outside the repository/cloud evidence directories. Do not paste it, an owner JWT, passwords or API keys into chat. The token can only claim/complete that owner's STUDY generation/Coach jobs. Revoke it in the same screen when no longer needed.
2. Check CLI capabilities with `node ops/study-worker/worker.mjs --capabilities`. `codex login status` must report ChatGPT authentication; if necessary use the normal interactive `codex login` locally. No saved credentials are copied. API-key authentication is not silently substituted.
3. In a foreground owner terminal, set non-secret server/provider values and the protected token-file path:

```powershell
$env:STUDY_SERVER_URL='https://workflow-api-development-development.up.railway.app'
$env:STUDY_WORKER_TOKEN_FILE='C:/path/to/private/study-worker-token.txt'
$env:STUDY_PROVIDER='codex'
$env:STUDY_MAX_JOBS='14'
node ops/study-worker/worker.mjs
```

The path is an example, not an existing credential or a command to create a system service. On Windows, restrict its ACL to the current owner/SYSTEM using your established private credential directory. The CLI adapter uses a temporary empty working folder, read-only sandbox, no user MCP configuration, bounded output/time and schema output. It instructs the model to use no tools and rejects a result if tool execution is observed. Source passages are untrusted data, never execution instructions. Per-run user configuration isolation does not replace normal Codex security rules.

For Ollama, use `STUDY_PROVIDER=ollama` and an already installed `STUDY_OLLAMA_MODEL`. Only localhost:11434 is contacted. No model download or paid API request is automatic. The paid adapter throws a disabled error even if selected.

For an optional Windows Task Scheduler setup, create a task manually under the existing owner account that runs the same command/script every five minutes during the desired learning window, with "do not start a new instance" and a bounded invocation duration. Use the protected token-file path, not a token in task arguments. Do not enable unattended login, install a service or store the owner's password through this implementation. No system task was installed by the agent. A logged-out/unavailable CLI leaves queued or lease-expired/retryable jobs; the UI must continue to report offline. Refresh/revoke tokens at their seven-day expiry.

## Normal product flow

Register authorized material metadata, upload its private PDF and request current-version indexing. Use source search to inspect text/page order and quality. Textless or garbled passages remain honest source-check results; no re-OCR is attempted. Changing material metadata increments its version and requires a current-version index before generation.

Set the weekly goal/interests/target percentages in Workbooks. Request one-day diagnosis or next-week seven-day generation. Inspect the immutable plan/job state. Run the local worker; no generated success is reported while it is disconnected. Open each candidate's explicit answer/source review, assess correctness and approve it. The server then builds, verifies and publishes the two private PDFs. Unapproved model output cannot publish. Solve online, upload handwriting or combine both; subjective and handwritten attempts remain submitted/ungraded.

Save Coach feedback before requesting interpretation. Inspect the typed proposal's before/after/scope and approve or reject it. A disputed answer needs a correctness review/new-version reissue, not an automatic policy change. Rollback creates a new future policy version. Future planning resolves effective date windows and preserves earlier workbooks/answers.

For a PDF/title reissue with unchanged questions, use the generated job's same-question new-version action. It invokes no AI, creates a new immutable version and requires fresh review/approval before rendering. It does not correct question content; content correction requires a reviewed new import or bounded new-day generation. Background generation no longer changes the live learner draft revision; new packages/proposals appear through an idle snapshot refresh. Genuine competing user edits still produce an explicit conflict and require checking/re-entering the conflicted input.

## Sunday operation and recovery

DEV's proposed default is Sunday 20:00 Asia/Seoul. The Coach screen saves an evening time and enable flag, shows the next execution preview and real jobs. Backend `STUDY_ENGINE_ENABLED=true` is required for polling. Scheduler availability alone does not turn the owner's checkbox on. Sunday plans the following Monday-Sunday; current Sunday remains active until Monday midnight. An offline worker queues work without pretending it generated content.

Inspect PLAN/INDEX/GENERATE/COACH/RENDER state and receipt before retrying. Internal server work can be run through the UI; model work requires the outbound worker. Expired claims receive fresh leases on recovery. Automatic attempts stop at three; manual retries are separately capped. Failed source/validation results need correction or a new version, not repeated blind retries. If only one derivative exists, the other is retried and exact verified bytes are reused; publication remains atomic. Never overwrite a published version or delete old attempts to force a rerun.

Current limits: 100 jobs/owner/day; 14 jobs/local invocation; four source excerpts per day context; 40 recent prompts; 1-40 questions per part; 1.5 million output characters; 8-minute CLI execution; 10-minute lease; ten 20 MiB handwritten uploads; configured material PDF maximum up to 100 MiB; 1 GiB total owner assets. Source parser: 2,000 pages, 100,000 text units/page, 12 million/run. These are practical bounds, not an accuracy or performance guarantee.

## DEV release and data safety

Use the current `agent` policies, guarded TEAM KAFKA Playwright, official Railway CLI/API and the shared release lock. Refresh origin/dev and live Flyway history immediately before mutation. V105 was already applied while Foundation V104 was absent in the initial DEV audit; V104 must not be edited. A one-time DEV out-of-order migration setting can apply the unchanged missing foundation before V106. Verify the exact history/checksums and remove that temporary setting after success. Do not apply this procedure to PROD under this task.

Use the existing approved private object provider with STUDY namespace and `SHARED_DESK_STORAGE_ENVIRONMENT=DEV`, `app.db-environment=DEV`. Set `STUDY_STORAGE_ENABLED=true` intentionally. Keep `STUDY_ENGINE_TEST_ADAPTER=false` on hosted environments. Preserve bucket permissions/CORS, shared config and every unrelated staged Railway patch. API Development follows dev without a source pin; Web uses its separately reviewed DEV commit pin. Do not use the older two-service wrapper to re-pin API or change PROD.

Verify owner JWT through the retained dedicated session first. Reload/session persistence is distinct from a new password login. Do not export browser sessions or manufacture/bypass owner accounts. Full hosted acceptance includes native PDF upload and private reads; loopback tests are not a substitute.

Rollback is roll-forward by default: disable the owner's schedule and engine polling; revoke owned worker tokens if needed; retain metadata, originals, published pairs, versions and attempts. An older server can ignore additive engine tables but must preserve V104/V106 Flyway history. Do not issue down migrations, repairs, resets, bucket-wide deletion or move a service to an older source over unrelated newer DEV work.

## Evidence and cleanup

`node qa/study-owned-tests.mjs` owns loopback PostgreSQL 55449, or fallback 55452 when another task owns 55449, and relevant tests. `node qa/study-v2-runtime.mjs` owns 55450/API8189/Web3189, uses the real DEV object provider and creates synthetic content. Generate its source with the bundled Python running `qa/study-v2-source.py` first. Its real day uses Codex; its seven-day fixture explicitly uses the test-only adapter against the same server pipeline. Type `stop` in that owned runtime terminal after browser verification for exact-key object cleanup and process shutdown. Do not run another Gradle test command in the same checkout during its provider-cleanup test; their result directories are shared.

Previously policy-blocked synthetic PostgreSQL folders remain retained; do not retry recursive removal or use an alternate deletion route. Never include those folders, profiles, environment files, tokens, private source books or raw production dumps in evidence. Upload only ASCII-named reports/contracts, synthetic sample PDFs, sanitized screenshots and a dated evidence ZIP to Kafka_AI_WorkSpace/10_POS, then verify metadata/readback. PDF font binaries are deployment dependencies, not user deliverables.
