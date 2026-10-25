# TEAM KAFKA DEV deployment

Owner authorization, 2026-10-25: routine releases to Personal Work OS **Development** may proceed autonomously without another conversational approval. This does not grant PROD permission and cannot override platform-enforced approvals. Do not change Codex security settings or authorization internals. A connector rejection is not evidence of Railway account denial. An official CLI route requires its own valid credentials and normal authorization.

The existing deployment mechanism is GitHub source builds on Railway. Both services have a pinned commit, so pushing `dev` alone does not deploy. Preserve GitHub builds, branch `dev`, API `/backend`, Web `/frontend`, existing build/health configuration and variables. The DEV-only CLI wrapper updates only the two service source commit pins through the environment-scoped configuration API. It does not upload a working directory or create projects/services. Do not use global `service source connect`, whose source changes may affect other environments.

Allowed identities are fixed in the wrapper:

- Project `2b52b232-38b2-44b6-b97e-4caba54f90bc`.
- Development `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`.
- API `eba7d263-7dc3-448a-a6b8-c2994721b597`, `workflow-api-development`.
- Web `b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae`, `workflow-web-development`.

Install/update from this repository in PowerShell 7:

```powershell
pwsh -NoProfile -File scripts/team-kafka-dev/Install-TeamKafkaDev.ps1
```

It installs official Railway CLI 5.71.0 under `%LOCALAPPDATA%\TEAM_KAFKA\RailwayDev`. It does not change global PATH or execution policy. Credentials remain outside the repository. A Project Token is preferred: `Set-TeamKafkaDevToken.ps1` accepts hidden local input, verifies the API-reported project and Development environment before saving, and stores current-user DPAPI ciphertext with user/SYSTEM ACLs. Wrong project/PROD tokens are rejected.

On this laptop, the owner completed official browserless CLI OAuth login, but the OAuth credential could not create a Project Token (`Not Authorized`). No token was created and OAuth permissions were not broadened. The explicit `CliSessionEfs` mode reuses that approved session. `Use-TeamKafkaCliSession.ps1` binds the owner ID, checks DEV access, and protects `.railway/config.json` and its parent with Windows EFS plus user/SYSTEM ACLs, preserving official CLI refresh. Run the installed copy once after login to configure this mode. This session is **not** a server-side Development-scoped Project Token; the wrapper enforces the DEV-only target. Inherited RAILWAY_TOKEN/RAILWAY_API_TOKEN values are always cleared. The mode never silently substitutes an unrelated login or another credential. Windows editions without EFS must use the scoped DPAPI Project Token mode.

Never put tokens in command arguments, reports, chat or commits. A CLI login is distinct from connector OAuth and from application DEV login. EFS is supported by [Microsoft's file-encryption API](https://learn.microsoft.com/en-us/windows/win32/fileio/file-encryption); Project Token scope is described by [Railway](https://docs.railway.com/integrations/api). Credentials are machine/user bound; do not upload them or EFS private keys.

Reusable command:

```powershell
pwsh -NoProfile -File "$env:LOCALAPPDATA/TEAM_KAFKA/RailwayDev/Deploy-TeamKafkaDev.ps1" `
  -Commit <40-character-tested-SHA> -RepositoryPath <repository> `
  -ValidationResult <owned-QA-run/result.json> -Phase Deploy
```

`-Phase Preflight` checks the immutable commit, its presence on `origin/dev`, clean exact-commit test evidence, frontend build evidence, reviewed V100 identity, token scope, project and services, and existing source roots. `-Phase Verify` monitors and checks health without requesting another deployment. Deploy holds the shared QA/release lock, patches only the two DEV source pins, monitors both exact commit hashes and checks API `/actuator/health` plus Web `/login`. If already successful, inspect first and avoid a duplicate deployment. A different or unexposed commit is not a success.

Run risk-appropriate checks under `VALIDATION_POLICY.md` before generating evidence; the wrapper validates existing results rather than fabricating tests or rerunning unrelated broad suites. The current MONEY owned runner is `qa/money-unified-owned.mjs --runtime`, with its documented classpath/build prerequisites. Review new migrations separately. This first wrapper deliberately rejects changes to the reviewed V100 blob until a new review updates its guard.

Inspect Flyway logs separately after deployment. API health alone does not prove V100. Never reset/truncate existing DEV records. Preserve immutable raw events and checkpoints; V100 adds meaning state and permits one-sided transfers without reclassifying legacy rows. Once new semantics are used, recover by roll-forward rather than an incompatible server rollback.

Upload final Korean release and tooling reports plus sanitized evidence to the established MONEY Drive folder. Record deployed SHA, IDs, migrations, executed/unrun checks and any authentication block accurately. Do not copy protected credential files or CLI login state into evidence. A fresh shell test is not a Windows reboot test.
