# WORK FLOW hosted Development for TEAM KAFKA

Production is not a fallback. The public `hosted-dev` profile loads only the
existing DEV_DB_* variables and DEV Supabase project. The loopback `dev` profile
and its fixed-user/no-login convenience must never be exposed publicly.

Hosted DEV browser requests use the existing Supabase JWT validation (ES256,
issuer and expiry). NEXT_PUBLIC_APP_ENV=hosted-dev enforces the login gate and
fails closed if its DEV Supabase browser configuration is missing.

TEAM KAFKA receives a separate random DEV integration token in its Railway API
variables. WORK FLOW stores its SHA-256 fingerprint, not the bearer token. The
DEV-only security chain resolves the explicitly configured existing DEV owner
and permits exactly:

- GET /api/workflow/project-profiles
- POST /api/workflow/projects
- PATCH /api/workflow/projects/{uuid}

It rejects project deletion, task changes and every other POS domain. It cannot
activate under Production. Token rotation requires replacing both DEV values.
Never print either credential representation or use a browser/public variable.

V68 adds nullable emoji/image_url columns to the canonical projects table. No
identity copy or stored progress is introduced. The profile endpoint projects
the existing owner-scoped Project and applies the same count/phase weight/manual
override model as WORK FLOW screens. Profile writes retain optimistic revisions.
Images require HTTPS with a host and no embedded credential. Existing aggregate
Project serialization and screens remain compatible.

Railway project: 2b52b232-38b2-44b6-b97e-4caba54f90bc
Development environment: 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c
DEV API service: eba7d263-7dc3-448a-a6b8-c2994721b597
DEV Web service: b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae
Supabase DEV reference: rmfgyrimubaxdptwqiqq (personal-work-os-dev)

Roots: /backend and /frontend. Canonical branch: dev. API build:
./gradlew bootJar -x test; start: java -jar build/libs/backend-0.0.1-SNAPSHOT.jar.
Web build: npm run build; start: npm run start -- --hostname 0.0.0.0 --port 3000.
Health checks: /actuator/health and /login. These configuration facts do not
themselves prove a successful native push-triggered deployment.

Shared DEV schema changes and final dev integration use the repository's common
QA lock. Do not edit applied migrations, repair history or touch Production.

2026-10-02 implementation evidence: 39 targeted canonical API/security tests
passed. The normal repository DEV loader identified the existing DEV database;
Flyway validated its applied sequence through V67 under the shared QA lock and
applied only additive V68. An authenticated loopback hosted-dev runtime returned
11 actual canonical Projects, rejected anonymous profile reads (401), and denied
the Project integration credential access to Money (403). Native hosted DEV
verification remains pending; no Production mutation or deployment was performed.
