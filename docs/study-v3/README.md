# STUDY V3 workflow

This extends the [V2 contract](../study-v2/STUDY_V2_ENGINE_CONTRACT.md). Planning,
generation, answer review, PDF validation, immutable versions, scoring and the
worker's credentials/schedule retain their existing contracts. No migration.

The five STUDY tabs remain unchanged. Normal material registration saves metadata,
uploads private bytes, requests the exact current material version's INDEX once,
and invokes the existing server `run` action. Partial failures retain the logical
material and completed stages. The server remains authoritative about textless
PDFs and readiness. Material edits append versions and request the current PDF's
new-version index; historical plans remain unchanged.

Additive authenticated STUDY endpoints and fields:

- `GET /engine`: adds current-version `sources`, `jobsTruncated`, job
  `materialVersion`/`createdAt` and worker `lastSeenAt`. Source readiness uses the
  same usable excerpt selection as planning; READY alone does not certify text.
- `GET /engine/jobs?page=0&kind=&state=&date=&week=`: owner-scoped, 50 rows/page,
  stable creation order with counts. All attempts remain available. `week` is a
  Monday in KST. Filters are applied before pagination.
- `GET /engine/preview?date=YYYY-MM-DD`: actual effective approved policy,
  question format, minutes, goals and source limit from existing rules. Same
  today-through-90-days date boundary as manual planning.
- `POST /engine/index/{assetId}`: optional `materialVersion` rejects an obsolete
  source version. Empty request bodies preserve the prior API.
- `POST /engine/plan`: optional nonempty `materialIds` selects current, active,
  actually indexed owned sources; omission preserves existing included settings.
  The sorted selection is frozen and validated on operation replay. It does not
  modify material preferences or planner policy.

Workbook creation saves its operation ID before sending in owner-scoped session
storage; uncertain retries and reloads reuse that exact request. Starting a
separate request is deliberate. Draft forms remain in the signed-in shell's
memory. Answer keys are requested only by the exact-version review action;
opening review, scrolling or viewing status never approves publication.

Weekly summaries contain seven display slots, with distinct operations/versions
retained in dated history. A verified private PDF pair and published snapshot are
required for “발행 완료”. INDEX/COACH READY does not mean workbook review ready.
Worker telemetry distinguishes the two-minute recent response badge, expected
five-minute local poll and token expiry; no worker installation is inferred.

Focused checks:

```powershell
cd frontend
npx tsx --test lib/study/*.test.ts app/study/*.test.tsx
npx tsc --noEmit
npm run build
```

`node qa/study-owned-tests.mjs` uses owned loopback PostgreSQL, existing synthetic
object/model boundaries and STUDY/security/storage regression. Optional external
provider cleanup tests may skip when their explicit environment is absent.
`node qa/study-v3-runtime.mjs` owns a loopback runtime and isolated business DB,
uses the existing DEV private storage in its distinct owner namespace, and uses
only the deterministic test adapter. It never invokes Codex generation, enables
paid providers, or changes shared business data. Type `stop` in its owned session
after browser QA; it cleans up only its own objects/processes. Its fixtures are
not authenticated hosted DEV evidence.

DEV rollout must preserve API branch following and update only the DEV Web pin
under release ownership. PROD is outside this task. Final implementation,
acceptance and operational handoff reports are delivered separately to the
established Kafka_AI_WorkSpace / 10_POS Drive folder.
