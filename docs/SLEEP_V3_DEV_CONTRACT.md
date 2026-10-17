# SLEEP V3 additive DEV contract

Existing P0 `/api/sleep/v1/actions` supports a paired `CORRECT_SESSION`: changed
bedtime/wake fields share one operationId, expectedRevision, transaction, event
and receipt. Android preserves unchanged endpoint provenance. No P0 migration or
two-request save protocol was added.

Optional P1 endpoints: `GET/PUT /api/sleep/v1/goals` and
`GET /api/sleep/v1/guidance?timezone=&asOf=`. Owner comes from CurrentUserProvider.
`app.sleep.guidance.enabled=false` is the default. V90 adds only `sleep_goals`.
Goal changes use owner serialization, revision checks and existing receipts; they
never change sleep facts or reminder settings.

The desktop continuation moved the **unapplied** Sleep migration from V89 to
V90 because the shared local `dev` already reserves V89 for Morning. Existing
applied migration files/checksums are unchanged. Recheck the live registry and
release ordering before either shared deployment; a missing version is not
permission to ship unrelated pending features.

`sleep-guidance.rules.dev1` defaults to 14-day lookback, 7 complete nights,
15-minute adjustment and 180-minute maximum spread. These are configurable,
tentative engineering parameters, not validated clinical/accuracy thresholds.
The projection includes sample/source/exclusion counts, circular robust summary,
fact/goal revisions, server generation and validity times. Missing goals, mixed
zones, multiple nights per day, sparse/irregular data and ambiguous DST abstain.

Run focused `com.kafka.backend.sleep.*` tests only against an authorized isolated
database. `SleepV3DevRuntime` additionally enforces the exact task-owned loopback
PostgreSQL URL; `qa/sleep-v3-runtime.gradle` starts that runtime. The API smoke
script is restricted to its loopback HTTPS endpoint and synthetic fixtures.
Set `SLEEP_QA_TLS_STORE`, `SLEEP_QA_TLS_ALIAS` and `SLEEP_QA_TLS_PASSWORD` only in
the QA process environment. The store stays local; never publish its password.
Run the smoke script with `--ca <public-CA.pem> --output <result.json>`.
`qa/sleep-v3-test-output.gradle` isolates desktop test outputs under `build/`.

No shared DEV/PROD migration/deployment is part of the local validation. Review
the final Korean handoff for exact commit/build/checks and remaining device gates.
