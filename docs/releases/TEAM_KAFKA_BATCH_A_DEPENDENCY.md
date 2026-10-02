# TEAM KAFKA Batch A Production dependency

Owner approved this bounded Production promotion on 2026-10-02. Base is the actual
healthy Production revision `b95265c36387528ec057e36106deaf3f0b46c598`, not all of dev.
Canonical Project profile/progress and V68 are taken from the reviewed development
implementation `e5bd0b9b0e4459e0ad18886fa6df2676e7d43d83` (baseline `fc9b1e7`).

The additive V68 adds nullable `projects.emoji` and `projects.image_url`. Production
read-only preflight confirmed successful V1–V67 history, no V68 and neither column.
A private PostgreSQL custom archive of the public schema was created before writes;
its restore table of contents was validated. It must not be committed or uploaded.
Restore requires an explicit separate data-recovery decision; never reset live data.
Application rollback uses the prior healthy revision, leaving additive V68 intact.

Production Supabase is `yhxhvpvocsestxhoqtwa`. Railway project/environment are
`2b52b232-38b2-44b6-b97e-4caba54f90bc` /
`c2c20488-311f-4b9e-9ec9-d79508123176`, native branch `prod`.

The separate Production service credential permits only canonical Project profile
GET, Project create POST and revision-checked Project PATCH. Only its SHA-256 is
configured in WORK FLOW as `WORKFLOW_PROD_TOKEN_SHA256`; the corresponding server
credential lives in TEAM KAFKA Production secret storage. `WORKFLOW_PROD_OWNER_ID`
is the verified Production Workspace owner, never the development fixed-user stub.
No DEV token is accepted. Existing Supabase ES256/issuer/expiry validation and MONEY
bridge authentication are unchanged. No frontend changes or other POS features ship.

Focused regression: 39 tests passed, covering profile/Project behavior, scoped
Production authentication, JWT validation/provider isolation, and MONEY bridge.
Native deployment IDs, checksum validation and live verification must be recorded
after the native Production deployments succeed; this document alone is not proof.
