# Personal Work OS — Agent Production Policy

## Principle

Personal Work OS is a single-owner personal project.

Normal production deployment should be fast and automated when the user has
already approved deployment as part of the task.

Production safety should focus on genuinely destructive or irreversible risk,
not redundant confirmation ceremony.

Technical details of the actual production environment live in:

`docs/PROD_OPERATIONS.md`

This document defines agent permission and behavior.

---

## Task-Level Production Approval

If the user explicitly requests a workflow that includes production deployment,
that instruction counts as production approval for the scope of that task.

Examples:

- implement → validate → deploy
- fix this and deploy it
- complete the development/QA/PROD loop

Once task-level deployment approval exists, do not request another confirmation
immediately before normal deployment.

Approval applies only to the requested task.

It is not permanent unrestricted permission for unrelated production work.

---

## Normal Approved Operations

Task-level deployment approval includes normal operations such as:

- frontend deployment
- backend deployment
- ordinary CI/CD deployment
- safe forward-only Flyway migrations belonging to the approved feature
- health checks
- focused production smoke tests

These do not require another user confirmation.

---

## Operations Requiring Separate Approval

Even when deployment is approved, stop before:

- deleting production data
- bulk-changing existing production data outside normal application behavior
- manual production data correction outside the approved feature
- destructive schema operations
- irreversible transformations with credible data-loss risk
- credential/secret rotation
- unclear high-impact authorization changes
- rollback operations that may discard newer user data
- destructive actions outside the requested task scope

---

## Deployment Serialization

Parallel agents may:

- implement concurrently
- test concurrently
- validate concurrently

But final integration and production deployment must be serialized.

Only one deployment owner should operate the:

latest dev
→ integration
→ PROD deployment
→ PROD smoke

critical section at a time.

Before deploying, the agent must confirm that the deployment is based on the
latest intended `dev` state.

If another feature was integrated since the current feature was validated,
run appropriate targeted validation again before deployment.

---

## Approved Deployment Fast Path

When the task includes production deployment:

implement
→ validate
→ integrate into dev
→ deploy
→ focused production smoke
→ concise final report

Do not stop merely because the next normal operation touches production.

---

## Production Environment Contract

Do not duplicate environment-specific details here.

Use:

`docs/PROD_OPERATIONS.md`

for:

- actual hosting/service topology
- environment variables
- deployment commands/process
- health endpoints
- runtime infrastructure
- PROD database/environment identity
- operational troubleshooting