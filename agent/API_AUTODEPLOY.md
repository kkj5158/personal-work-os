# POS API automatic deployment — owner instruction 2026-11-10

The owner requested persistent automatic API deployment and completion of ORBIT
through production. API Development follows `dev`; API production follows
`prod`, with the source commit pin removed. Preserve GitHub builds, `/backend`,
build/start settings, variables, Web services and database services.

Future flow: validate a task, integrate into `dev`, verify the automatic DEV
deployment, promote the validated API source to `prod` when the task authorizes
production, then verify the automatic PROD deployment and authenticated smoke.
Record the actual successful deployment commit; a push is not release evidence.
Production promotion remains task scoped under PRODUCTION_POLICY.md. Destructive
data operations and credential rotation retain their separate approval rules.

The Railway plugin already had Allow all actions. Its provider-side MCP
confirmation is separate; the noninteractive host could cancel that dialogue.
Official CLI 5.71.0 authenticated successfully using the owner's existing login.
Its regular environment-edit serializer omits optional null fields, so sending
`commitSha:null` through that command does not reliably remove a source pin.
The public `environmentPatchCommit` API via `railway api` preserves JSON null.
No credential is read into chat, copied, rotated or stored by this workflow.

Use the fixed-target helper if these two API settings need to be restored:

```powershell
node scripts/pos-api-autodeploy.mjs dev
node scripts/pos-api-autodeploy.mjs dev --apply
node scripts/pos-api-autodeploy.mjs prod --apply
```

The first command is a plan. Apply uses the existing official CLI session,
fixed project/service/environment IDs, repository/root checks and the shared
release lock. If an owned coordinator already holds that lock, it may pass its
exact run ID as `POS_RELEASE_LOCK_RUN_ID`; the helper checks its worktree and
live PID. Unrelated staged changes are never committed or discarded by this
helper. Inspect any staged patch separately before clearing it.

This current API branch-following workflow supersedes the API pin requirement
in the older DEV_DEPLOYMENT.md fast path. That older two-service wrapper still
governs its own Web deployment use; do not invoke it to re-pin these API services
or deploy the frontend as a side effect of a backend-only task.
