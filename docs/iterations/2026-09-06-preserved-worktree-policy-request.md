You are performing a focused repository policy/documentation update for Personal OS.

This task is NOT a product feature implementation and does NOT require a PROD deployment.

Your goal is to strengthen the repository's canonical Git workflow documentation so that temporary Git worktrees used by AI agents have an explicit lifecycle and cleanup policy, consistent with the already-established feature-branch cleanup policy.

Do not broadly redesign the Git strategy. Preserve the current branch model and safety philosophy unless an actual contradiction is found.

==================================================
1. CONTEXT / CURRENT OPERATING MODEL
   ==================================================

This is a single-owner personal project increasingly operated with multiple coding agents such as Codex and Claude Code.

The repository already uses the following model:

Permanent branches:
- dev
- stg
- prod

Current active promotion flow:
feat/* / fix/* -> dev -> prod

Future reserved flow:
feat/* / fix/* -> dev -> stg -> prod

`stg` exists but is not currently in the active promotion path.

`dev` is the single development integration branch.

Domain names such as:
- work-os
- life-os
- note-system

are naming namespaces only.

Do NOT introduce permanent domain integration branches such as:
- work-os-integration
- note-system-integration
- life-os-integration

Feature/fix branches originate directly from `dev`.

Typical examples:

feat/note-system/jiseung
feat/work-os/plan-execute-review
fix/work-os/checklist-result-state

The intended agent execution model is:

Task
=
one temporary feature/fix branch
+
one temporary Git worktree
+
one agent/session

For example:

Codex
- branch: feat/note-system/jiseung
- worktree: worktrees/note-system/jiseung

Claude Code
- branch: feat/work-os/plan-execute-review
- worktree: worktrees/work-os/calendar

These worktrees are disposable agent workspaces, conceptually similar to separate local clones/workspaces that different human developers would normally use.

The main repository working copy should normally remain a stable coordination/integration workspace, preferably on `dev`, but this must NEVER be achieved by destroying or discarding legitimate uncommitted work that already exists there.

==================================================
2. AUTHORITATIVE DOCUMENT
   ==================================================

Inspect the repository first and locate the current canonical Git workflow document.

The expected canonical document is:

agent/GIT_WORKFLOW.md

or, if the repository currently uses another canonical path, determine that from the repository itself.

The existing Git workflow document is authoritative.

Do not replace it wholesale unless necessary.

Preserve:
- permanent branch protections;
- dev/stg/prod semantics;
- current promotion flow;
- feature branch policy;
- ancestry-based deletion verification;
- no-force-push policy;
- no destructive cleanup of unknown work;
- protection of `.claude/settings.local.json`;
- current historical/state notes unless clearly stale and intentionally separated from policy.

Adapters such as:
- CLAUDE.md
- AGENTS.md
- .claude/rules/*
- agent/README.md

must reference canonical policy rather than duplicating conflicting rules.

Only update adapters if they are currently inconsistent with the canonical policy or if a minimal pointer update is needed.

==================================================
3. PRIMARY CHANGE — TEMPORARY WORKTREE POLICY
   ==================================================

Add a clearly named authoritative section such as:

## Temporary worktrees [policy]

The section must establish the following rules.

### 3.1 Purpose

- Temporary worktrees are disposable task/agent workspaces.
- A normal active task should own:
  - one feature/fix branch;
  - one temporary worktree;
  - one agent/session.
- Worktrees provide filesystem isolation for parallel AI-agent work.
- Worktrees are NOT permanent integration environments.
- Do not create permanent worktrees for WORK_OS, LIFE_OS, NOTE SYSTEM, or other domain namespaces merely to act as intermediate integration environments.
- `dev` remains the single development integration branch.

### 3.2 Worktree lifecycle

Document the normal lifecycle explicitly:

1. refresh/fetch the relevant repository state;
2. create a feature/fix branch from `dev`;
3. create or assign a temporary worktree for that branch;
4. implement the task;
5. validate the task;
6. integrate the branch into `dev`;
7. verify integration;
8. when applicable, complete promotion/deployment separately;
9. verify the temporary worktree is safe to remove;
10. remove the temporary worktree;
11. delete the fully merged feature/fix branch locally;
12. delete the fully merged remote feature/fix branch;
13. prune stale worktree and remote-tracking metadata.

A task should normally be considered operationally complete only after safe cleanup of its temporary branch/worktree has been performed or an explicit reason for retaining either has been reported.

==================================================
4. SAFE WORKTREE REMOVAL CONDITIONS
   ==================================================

Before removing a temporary worktree, the agent MUST verify all of the following:

1. It is actually a temporary worktree, not the primary/main working copy.
2. No active agent/session/process is still using it.
3. `git status` has been inspected.
4. There is no unknown or meaningful uncommitted work that would be lost.
5. Any meaningful work has been committed or otherwise deliberately preserved.
6. The branch's meaningful commits are verifiably contained in `dev` or `prod`.
7. The worktree is no longer needed for validation, rollback investigation, or an active deployment step.

Do not infer safety from:
- the worktree directory name;
- the branch name;
- a previous agent's report;
- an assumption that "the merge probably happened."

Where relevant, verify branch integration using commit ancestry, consistent with the existing feature branch deletion policy.

Use checks such as:

git merge-base --is-ancestor <branch> <target>
git branch --merged <target>

Do not delete on ambiguous ancestry.

==================================================
5. UNKNOWN / UNCOMMITTED WORK SAFETY
   ==================================================

Explicitly state:

Never force-remove a worktree merely to simplify cleanup when it contains unknown or uncommitted work.

Commands or equivalent behaviors that could discard work must not be used merely for cleanup convenience.

Examples requiring special caution include:

git worktree remove --force
git reset --hard
git clean -fd
git restore .
git checkout .

If a worktree contains unexpected changes:

- inspect them;
- determine whether they belong to the user or another session;
- preserve them;
- leave the worktree in place and report the blocker if ownership/safety cannot be determined.

Do NOT ask the user merely because cleanup requires normal Git coordination.

Ask/stop only when there is a genuine risk of destroying meaningful unknown work or when ownership cannot safely be resolved.

==================================================
6. NORMAL CLEANUP COMMANDS
   ==================================================

Document the normal cleanup shape, without making exact commands mandatory when an equivalent safe operation is more appropriate.

Typical sequence:

git worktree remove <worktree-path>
git worktree prune

git branch -d <branch>
git push origin --delete <branch>
git fetch --prune

Important:

- Worktree removal normally precedes local branch deletion because Git will prevent deletion of a branch still checked out by a worktree.
- Use normal non-forced branch deletion (`git branch -d`) for fully merged temporary branches.
- Do not use force deletion as a normal cleanup shortcut.
- Remote branch deletion for fully merged temporary feature/fix branches is explicitly authorized cleanup and does not require separate user approval.
- Permanent branches remain protected.

==================================================
7. FEATURE/FIX BRANCH CLEANUP ALIGNMENT
   ==================================================

Reconcile the existing feature branch cleanup section with the new worktree section.

The final policy should make the following lifecycle obvious:

temporary worktree
+
feature/fix branch
|
v
implementation
|
validation
|
v
dev integration
|
integration verification
|
v
safe worktree cleanup
|
v
local branch deletion
|
v
remote branch deletion
|
v
prune

Do not create duplicated or contradictory deletion rules in multiple sections.

If the repository already has a feature branch deletion policy based on ancestry verification, reuse/reference it.

==================================================
8. MULTI-AGENT COORDINATION
   ==================================================

Add or reinforce the following multi-agent principle if not already present:

Parallel agent work is expected.

Implementation and local validation may happen concurrently in separate branch/worktree pairs.

However, some shared operations are serialized critical sections:

- shared DEV DB schema mutation / Flyway application;
- final dev integration when concurrent work could affect the merge base;
- prod promotion;
- actual production deployment.

Agents must assume another agent may have changed remote branches or migration state since session start.

Therefore they must re-check current remote/shared state immediately before entering a critical section rather than relying only on preflight state.

Do not invent a permanent integration branch to solve this coordination problem.

==================================================
9. SHARED DEV DB / FLYWAY COORDINATION
   ==================================================

If the existing policy already contains this, preserve it and ensure there is no contradiction.

Expected rule:

Before creating or applying a Flyway migration:

1. inspect the latest migration state;
2. account for concurrent branches/worktrees with migrations;
3. avoid version collisions;
4. re-check immediately before applying to the shared DEV DB;
5. apply only when ordering and compatibility are clear.

If another independent additive migration landed first and the local migration has NOT been applied anywhere, safely renumber the local migration when appropriate.

Applied Flyway migrations are immutable.

Do not alter an already-applied migration.

Do not stop merely because another agent also has a migration.

Stop only for genuine unresolved conflicts such as:
- duplicate Flyway versions already applied with different contents;
- incompatible schema assumptions;
- destructive migration requirements;
- credible data-loss risk;
- unresolved domain/product ambiguity.

==================================================
10. PROD PROMOTION / DEPLOYMENT POLICY CONSISTENCY
    ==================================================

Do not redesign production promotion in this task, but ensure the Git workflow remains consistent with the established policy.

Normal production promotion must NOT be:

git push origin dev:prod

or any equivalent direct ref update as the normal workflow.

Expected model:

fetch latest remote state
-> inspect origin/dev
-> inspect origin/prod
-> use a clean prod checkout/worktree based on latest origin/prod
-> explicitly merge/promote the validated dev state into prod
-> run targeted promotion validation where appropriate
-> push prod to origin/prod
-> confirm actual deployment
-> perform focused PROD smoke validation

Important:

`prod push` is a deployment trigger, not proof that deployment succeeded.

The workflow should distinguish:

push completed
!=
deployment completed

Where applicable, deployment completion means:
- Railway deployment was actually created;
- required backend/frontend services picked up the new version;
- startup completed;
- Flyway migration/startup logs are healthy;
- focused PROD smoke passed.

Do not expand this documentation task into an actual deployment.

==================================================
11. PROTECTED / PERMANENT BRANCHES
    ==================================================

Preserve absolute protection for:

- dev
- stg
- prod

They must never be:
- deleted;
- force-pushed;
- reset destructively;
- history-rewritten.

`main` remains obsolete unless repository reality has changed.

If repository reality differs from documented state, report the discrepancy instead of silently rewriting history or recreating branches.

==================================================
12. `.claude/settings.local.json`
    ==================================================

Do not read, modify, stage, commit, restore, delete, or overwrite:

.claude/settings.local.json

Treat it as intentional local-only configuration.

==================================================
13. DO NOT DESTROY OTHER WORK
    ==================================================

This is especially important because multiple agents may operate concurrently.

Do not:
- reset another branch/worktree;
- clean unknown files;
- force-switch the primary worktree;
- discard unrelated user changes;
- remove a worktree simply because its name looks old;
- delete a branch merely because it appears merged by name.

If unrelated legitimate changes exist, preserve them.

Use a separate clean temporary worktree for this documentation task if that is safer.

==================================================
14. DOCUMENTATION QUALITY
    ==================================================

Keep the canonical Git workflow document practical and concise enough for agents to follow.

Distinguish clearly between:

[policy]
stable rules that future agents should follow

[state]
repository facts that can become stale and must be re-verified

Avoid documenting temporary commit hashes, branch states, or local paths as permanent policy unless they are explicitly labeled as state/examples.

Prefer principles plus example commands.

==================================================
15. VALIDATION
    ==================================================

After editing:

1. review the final canonical Git workflow document end-to-end;
2. confirm no internal contradictions exist;
3. confirm the feature-branch and worktree cleanup policies agree;
4. confirm permanent branch protection remains intact;
5. confirm no rule authorizes deleting unknown/uncommitted work;
6. confirm dev is still the single development integration branch;
7. confirm temporary worktrees are clearly disposable task workspaces;
8. confirm cleanup is part of the normal task lifecycle;
9. confirm production promotion policy does not permit direct dev->origin/prod ref pushes as the normal path;
10. inspect any adapter documents you touched and ensure they defer to the canonical policy rather than duplicate it.

Use repository search narrowly to detect contradictory Git/worktree rules.

Do not perform unrelated documentation cleanup.

==================================================
16. GIT EXECUTION FOR THIS DOCUMENTATION TASK
    ==================================================

Follow the repository's own current Git safety policy.

Before changing files:
- inspect current branch/worktree state;
- preserve any unrelated work;
- use a separate clean task branch/worktree if necessary.

Suggested task branch name:

fix/agent-worktree-cleanup-policy

Do not assume this exact name is required if repository conventions indicate a better equivalent.

This documentation-only task may be committed and integrated into `dev` if the repository state allows it safely.

Do NOT promote/deploy to PROD solely for this policy-documentation change unless there is a separate explicit instruction requiring deployment.

After successful dev integration, clean up this task's own temporary worktree/branch according to the policy you just documented.

This task should dogfood the new cleanup policy.

==================================================
17. FINAL REPORT
    ==================================================

Report in Korean, concisely.

Include:

- canonical document(s) changed;
- what worktree lifecycle/cleanup policy was added;
- whether any contradictory adapter rules were found/fixed;
- branch/worktree used for this task;
- validation performed;
- integration result if integration was performed;
- cleanup result for the temporary branch/worktree;
- any repository-state discrepancy that should be handled separately.

Do not include secrets, datasource URLs, tokens, real user UUIDs, or sensitive environment data.

Proceed autonomously unless a genuine safety condition requires stopping.