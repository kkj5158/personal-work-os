# Personal Work OS — Agent Git Workflow

## Purpose

This document defines the canonical Git, branch, worktree, parallel-agent,
integration, cleanup, and shared-development-resource workflow for
Personal Work OS.

Personal Work OS is a single-owner personal project that may use multiple
AI development agents concurrently.

The goal is to enable high autonomy and parallel development without creating
unnecessary Git hierarchy, accumulating stale branches/worktrees, or requiring
user coordination for routine conflicts.

General agent behavior is defined in:

`agent/OPERATING_POLICY.md`

Validation policy is defined in:

`agent/VALIDATION_POLICY.md`

Production deployment policy is defined in:

`agent/PRODUCTION_POLICY.md`

---

# 1. Core Integration Model

`dev` is the single development integration branch.

All normal feature and fix branches branch directly from `dev`
unless an explicit exceptional workflow has been approved.

Do not maintain permanent domain-level or feature-level integration branches.

In particular, do not create persistent integration layers such as:

- `integration`
- `work-os`
- `life-os`
- `work-os-integration`
- `life-os-integration`
- module-specific integration branches

solely to collect feature branches.

WORK_OS and LIFE_OS are product/domain namespaces.

They are not additional Git integration layers.

The normal topology is:

```text
                     fix/work-os/checklist-result-state
                    /
                   /
dev ──────────────┼──── feat/work-os/attendance-improvement
                   \
                    \
                     feat/life-os/life-log
```

All completed work merges directly back into `dev`.

Temporary task branches are execution environments.

They are not permanent project structure.

---

# 2. Main Working Copy

The main repository directory should normally remain the stable `dev`
working copy.

Recommended layout:

```text
C:/DEV_SPACE/
│
├── personal-work-os/
│   └── dev
│
└── personal-work-os-worktrees/
```

The main working copy serves as:

- the stable local integration point;
- the normal `dev` checkout;
- the place from which temporary worktrees are managed;
- the local reference point for the latest integrated development state.

Do not use the main working copy as a shared concurrent editing directory
for multiple implementation agents.

Multiple agents must not modify the same working directory concurrently.

The main working copy should normally remain checked out on `dev`.

---

# 3. Branch Naming

Use short-lived task branches for implementation work.

Recommended patterns:

```text
feat/<domain>/<descriptive-name>
fix/<domain>/<descriptive-name>
```

Examples:

```text
feat/work-os/supplemental-work
fix/work-os/checklist-result-state
feat/work-os/workspace-switcher

feat/life-os/life-log
feat/life-os/checklist
fix/life-os/daily-summary
```

Agent/tool-specific prefixes such as:

```text
codex/*
```

may be used when required by an execution workflow.

Such branches are still temporary task branches and follow the same lifecycle
and cleanup rules as `feat/*` and `fix/*`.

The domain namespace is organizational only.

For example:

```text
feat/work-os/checklist
```

does not branch from a `work-os` branch.

It still branches directly from:

```text
dev
```

unless an explicitly approved exceptional workflow requires otherwise.

---

# 4. Feature Branch Scope

Prefer one branch per coherent task or tightly related fix set.

Do not create unnecessary branch fragmentation.

For example, two closely related Checklist fixes may share one branch:

```text
fix/work-os/checklist-result-and-dynamic-items
```

rather than:

```text
fix/checklist-pass-fail
fix/checklist-dynamic-item
fix/checklist-api
fix/checklist-ui
```

when all changes belong to one implementation cycle.

Create separate branches when:

- changes are independently deployable;
- different agents need to work concurrently;
- the features have materially different scopes;
- isolation materially reduces conflict risk.

Do not create branches merely for ceremony.

Every temporary branch must correspond to either:

- active work; or
- a concrete documented reason for temporary retention.

A branch must not remain simply because cleanup was omitted.

---

# 5. Worktree Policy

Use Git worktrees when multiple implementation agents need to work
concurrently.

Each concurrent implementation agent must have:

- its own branch;
- its own worktree;
- a clearly scoped task.

Example:

```text
C:/DEV_SPACE/
│
├── personal-work-os/
│   └── dev
│
└── personal-work-os-worktrees/
    │
    ├── work-os/
    │   ├── checklist/
    │   └── attendance/
    │
    └── life-os/
        ├── life-log/
        └── checklist/
```

Worktree directory nesting is allowed for human organization.

Directory nesting does not create Git branch hierarchy.

For example:

```text
personal-work-os-worktrees/work-os/checklist
```

may contain:

```text
fix/work-os/checklist-result-state
```

but that branch still originates from `dev`.

Worktrees exist for task execution.

They are not archival storage.

The normal expected state of:

```text
personal-work-os-worktrees/
```

is:

- active worktrees only; or
- empty when no parallel implementation work is active.

---

# 6. Temporary Worktree Lifecycle

Worktrees are temporary execution environments.

They are not permanent project structure.

Normal lifecycle:

```text
dev
→ create branch
→ create worktree
→ implement
→ validate
→ commit
→ integrate into dev
→ deploy when approved
→ smoke when required
→ remove worktree
→ delete local temporary branch
→ delete remote temporary branch
→ prune stale references
```

If production deployment is not part of the approved task:

```text
dev
→ create branch/worktree
→ implement
→ validate
→ commit
→ integrate into dev
→ required post-integration validation
→ cleanup
```

Completed worktrees MUST NOT remain without a concrete active reason.

Avoid permanent directories such as:

```text
personal-work-os-integration
```

when they no longer serve active work.

Before removing an existing worktree:

1. inspect `git worktree list`;
2. inspect the worktree's branch;
3. check for uncommitted changes;
4. check for valuable untracked files;
5. check whether commits remain unmerged;
6. check whether another active agent/session still owns it;
7. preserve any existing user or agent work;
8. remove it once safety is established.

Use Git-aware worktree commands.

Do not delete a tracked worktree directory from the filesystem alone.

---

# 7. Definition of Task Completion

A task is not fully complete merely because implementation or merge has
finished.

Unless an explicit retention reason exists, normal task completion requires:

1. intended implementation is complete;
2. required validation has passed;
3. intended work is committed;
4. intended commits are safely integrated into `dev`;
5. any approved deployment cycle has completed;
6. required smoke validation has completed;
7. no valuable uncommitted or untracked work remains;
8. no active agent/session still depends on the worktree;
9. temporary worktree is removed;
10. temporary local branch is deleted;
11. temporary remote branch is deleted;
12. stale worktree/remote references are pruned where appropriate.

Conceptually:

```text
IMPLEMENTED
→ VALIDATED
→ COMMITTED
→ MERGED TO DEV
→ DEPLOYED WHEN APPROVED
→ SMOKE PASSED WHEN REQUIRED
→ WORKTREE REMOVED
→ LOCAL BRANCH DELETED
→ REMOTE BRANCH DELETED
→ CLEANUP VERIFIED
→ DONE
```

If deployment is intentionally deferred:

```text
IMPLEMENTED
→ VALIDATED
→ COMMITTED
→ MERGED TO DEV
→ REQUIRED DEV VALIDATION COMPLETE
→ WORKTREE REMOVED
→ LOCAL BRANCH DELETED
→ REMOTE BRANCH DELETED
→ CLEANUP VERIFIED
→ DONE
```

Deployment approval is not required merely to clean up a task branch that is
already safely integrated into `dev`.

Cleanup is part of task completion.

It is not optional follow-up work.

---

# 8. Temporary Branch Cleanup Policy

Completed temporary task branches MUST be deleted after successful integration
unless a concrete active retention reason exists.

This applies to task-oriented branches such as:

```text
feat/*
fix/*
codex/*
chore/*
experiment/*
```

when they were created for bounded implementation work.

Do not retain completed branches merely:

- as historical records;
- because deletion was not explicitly requested;
- because they might be useful someday;
- because the branch name provides useful context;
- because remote deletion was omitted from the implementation prompt;
- because the agent prefers conservative retention by default.

Git commit and merge history are the historical record.

A completed feature branch is not needed as an archive.

The default rule is:

> Once a temporary task branch has been safely integrated and no active
> dependency remains, delete it.

Retention is the exception.

Deletion is the default.

---

# 9. Valid Branch Retention Reasons

A temporary branch may remain only when there is a concrete reason such as:

- work is intentionally paused and expected to resume from that branch;
- valuable unmerged work remains;
- another active agent/session still owns the branch;
- an exceptional integration experiment is still active;
- the branch is required by an explicitly documented deployment mechanism;
- cleanup would risk destroying unknown or unverified work;
- the branch is part of a currently active recovery/investigation process.

Retention must not be based on vague reasoning such as:

```text
might be useful later
keep just in case
leave it for safety
historical reference
no need to delete yet
```

When the valid retention reason ends, cleanup becomes mandatory.

---

# 10. Protected / Long-Lived Branches

Do not apply temporary-branch cleanup rules blindly to long-lived repository
branches.

Known long-lived branches may include:

```text
dev
prod
stg
```

depending on the actual project deployment contract.

`dev` is always the development integration branch and must be retained.

Whether `prod`, `stg`, or another branch is long-lived must be determined from:

`docs/PROD_OPERATIONS.md`

and:

`agent/PRODUCTION_POLICY.md`

Do not delete or repurpose deployment-related branches based only on branch
names.

Do not create new permanent branches without a concrete documented need.

A branch being old does not automatically make it temporary.

A branch being named `prod` or `stg` does not automatically make it permanent.

Actual repository and deployment policy decides.

---

# 11. Parallel Agent Policy

Multiple agents may work on Personal Work OS concurrently.

Recommended model:

```text
Agent A
→ Worktree A
→ Branch A

Agent B
→ Worktree B
→ Branch B
```

Implementation and validation may run concurrently.

Agents must not:

- edit the same working directory concurrently;
- commit to the same feature branch concurrently unless explicitly coordinated;
- assume another agent's branch state without inspecting it;
- silently overwrite another agent's changes.

Parallel development is encouraged where tasks are reasonably independent.

Routine concurrency is not a reason to ask the user for confirmation.

Agents should resolve safe implementation-level coordination autonomously.

---

# 12. Parallelism vs Serialization

The overall development workflow is intentionally hybrid.

Most work may run in parallel.

Only shared-state critical sections need serialization.

## Parallel by Default

The following may normally happen concurrently:

- repository exploration;
- frontend implementation;
- backend implementation;
- business logic development;
- unit testing;
- targeted integration testing;
- browser QA;
- documentation work;
- independent migration authoring before shared DB mutation.

## Serialized Critical Sections

The following shared-state operations must be serialized where relevant:

- mutation of the shared DEV database schema;
- final integration into `dev`;
- production deployment.

Do not serialize an entire feature lifecycle merely because one short step
uses a shared resource.

Prefer:

```text
parallel implementation
        ↓
short serialized critical section
        ↓
parallel work continues
```

over:

```text
Agent A completes everything
        ↓
Agent B begins everything
```

unless actual dependencies require full serialization.

---

# 13. Shared Resource Awareness

Git worktrees isolate repository files.

They do not automatically isolate all development resources.

Shared resources may include:

- DEV Supabase PostgreSQL;
- Flyway migration history;
- DEV authentication state;
- external APIs;
- Railway environments;
- shared test data;
- localhost ports;
- manually shared fixtures or runtime services.

Agents must account for shared resources when working concurrently.

The existence of a shared resource does not by itself require user confirmation.

Use autonomous coordination where the conflict can be handled safely.

---

# 14. Shared DEV Database Coordination

Database changes are normal implementation work and do not require user
confirmation merely because they modify the shared DEV schema.

Parallel agents should continue autonomously when their database changes are
independent and non-destructive.

Shared DEV database mutation is a serialized critical section.

Before creating or applying a Flyway migration, an agent must:

1. inspect the latest migration state;
2. account for concurrent branches/worktrees that may also contain migrations;
3. avoid version collisions;
4. re-check the migration sequence immediately before applying to the shared
   DEV database;
5. apply the migration only when its ordering and compatibility are clear.

If another agent is currently changing the shared DEV schema, wait or retry
rather than asking the user merely for coordination.

After another migration is applied, refresh the local migration state and
renumber an unapplied local migration when safe to do so.

Ask the user only when there is a genuine conflict that cannot be resolved
safely and autonomously, such as:

- two different migrations already applied under the same Flyway version;
- incompatible schema assumptions between concurrent features;
- a required destructive migration;
- credible production data-loss risk;
- ambiguity requiring a product/domain decision.

Independent additive migrations are not a stop condition.

---

# 15. Flyway Migration Rules

Flyway migrations already applied to a shared DEV or PROD database are immutable.

Never modify an already-applied migration to change schema history.

Schema evolution must happen through new forward migrations.

Example:

```text
V25__existing_change.sql
V26__checklist_result_status.sql
V27__life_log.sql
```

If two agents independently start from:

```text
V25
```

and both create:

```text
V26
```

the collision should normally be resolved autonomously before both migrations
are applied.

For example:

```text
Agent A
V26__checklist_result_status.sql

Agent B
V26__life_log.sql
```

may safely become:

```text
V26__checklist_result_status.sql
V27__life_log.sql
```

when Agent B's migration has not yet been applied and there is no semantic
dependency requiring another order.

Renumbering an unapplied local migration is allowed when needed to resolve
normal concurrent sequencing.

Renumbering or rewriting an already-applied shared migration is not allowed.

Branch state alone must never be treated as proof that a migration has or has
not been applied to a shared database.

When application state is uncertain:

- inspect the migration directory;
- inspect relevant Git state;
- inspect Flyway/shared database state where practical;
- resolve safe ordering autonomously.

An unexpected already-applied migration collision that cannot be safely
resolved is a genuine stop condition.

---

# 16. Migration Critical Section

When actually mutating the shared DEV schema, treat migration application as
a short serialized critical section.

Conceptually:

```text
Agent A
migration ready
     │
     ├── acquire shared migration slot
     │
     ├── refresh migration state
     │
     ├── verify version
     │
     ├── apply migration
     │
     └── release shared migration slot

Agent B
migration ready
     │
     └── wait/retry
          ↓
        refresh state
          ↓
        continue
```

The implementation mechanism may be lightweight.

Do not introduce complex distributed coordination infrastructure solely for
this personal project.

The important invariant is:

> Two agents must not blindly mutate the same shared schema based on stale
> migration assumptions.

If coordination can be performed through fresh repository/database state
inspection, prefer that simple approach.

If a lightweight shared lock mechanism is later introduced, it may be used
to serialize this critical section, but such infrastructure is not required
unless real concurrency problems justify it.

---

# 17. Independent Database Features

Independent database features may be developed concurrently.

Example:

```text
Agent A
Checklist
→ alters checklist result representation

Agent B
Life Log
→ creates new life_log structures
```

If the schema changes are:

- additive;
- non-destructive;
- semantically independent;
- compatible with the shared application state;

both agents should continue autonomously.

Do not stop merely because both tasks contain migrations.

Only the shared mutation step needs coordination.

Database work is part of normal autonomous implementation.

---

# 18. Shared DEV Data

Shared schema is not the only possible collision surface.

Agents should avoid unnecessary destructive mutation of shared DEV test data.

When practical:

- create scoped test data;
- use identifiable test records;
- avoid deleting unrelated records;
- avoid assumptions that the DEV DB is otherwise idle;
- clean up temporary data when safe and useful.

Do not overengineer complete data isolation unless actual concurrent failures
justify it.

For the current personal-project scale, one shared DEV database is acceptable.

Agent-specific databases may be introduced later if concurrency complexity
materially increases.

---

# 19. Local Runtime Coordination

Different worktrees may need to run frontend/backend applications concurrently.

Agents should account for shared local runtime resources such as:

- frontend ports;
- backend ports;
- environment variables;
- local process ownership;
- browser sessions;
- callback URLs.

Do not terminate or replace another agent's active local process unless it is
clearly safe to do so.

When possible, use different ports for concurrent local runtimes.

If a port conflict can be resolved safely by choosing another available port,
do so autonomously.

Routine local runtime coordination is not a user confirmation condition.

---

# 20. Integration into `dev`

`dev` is the single development integration point.

Final integration into `dev` must be serialized.

Only one agent should perform an integration operation against `dev`
at a time.

Before integrating:

1. inspect current Git status;
2. fetch or otherwise refresh relevant branch information;
3. verify the current `dev` HEAD;
4. determine whether another agent has integrated changes since feature
   validation;
5. update the feature branch against latest `dev` when necessary;
6. resolve only safe and understood conflicts;
7. rerun appropriate targeted validation when effective code changed;
8. merge into `dev`.

Do not assume `dev` has remained unchanged during a long-running agent session.

After successful integration and any required validation/deployment cycle,
cleanup is part of the same task.

Do not treat merge completion and branch/worktree cleanup as unrelated jobs.

---

# 21. Concurrent Integration

Consider:

```text
Agent A
feature implementation
→ validation complete

Agent B
feature implementation
→ validation complete
```

If Agent A integrates first:

```text
dev
→ Agent A merged
```

Agent B must not blindly merge or deploy from an old view of `dev`.

Agent B should:

```text
refresh latest dev
→ incorporate latest dev as required
→ check conflict surface
→ rerun targeted validation if needed
→ integrate
```

This is normal agent coordination.

Do not ask the user merely because another independent feature landed first.

Each agent is responsible for cleaning up its completed temporary branch and
worktree after its integration lifecycle is complete.

---

# 22. Conflict Resolution

Safe, mechanical Git conflicts may be resolved autonomously when the intended
result is clear from:

- canonical policy;
- current implementation;
- feature scope;
- non-overlapping semantics.

A merge conflict itself is not automatically a stop condition.

Agents may resolve straightforward conflicts autonomously when doing so
preserves both valid changes.

Stop and ask the user when resolving a conflict would require:

- discarding existing user work;
- discarding another agent's valid implementation;
- choosing between conflicting confirmed product behaviors;
- making a meaningful new product decision;
- guessing through substantial ambiguity.

The consequence of resolving the conflict determines whether confirmation is
required.

---

# 23. Commits

Prefer useful, reversible commits.

A commit should generally represent a stable coherent unit.

Do not:

- create a commit for every tiny file edit;
- combine unrelated feature work into one large commit;
- leave known broken intermediate states committed when avoidable.

For a tightly related fix set, one or a small number of commits is sufficient.

Examples:

```text
fix(checklist): add explicit pass/fail result state

fix(checklist): resolve dynamic same-day item eligibility
```

or one coherent combined commit when appropriate.

Commit messages should remain concise and implementation-focused.

A branch does not need to remain after merge merely to preserve its commit
history.

---

# 24. Push Policy

Push stable implementation milestones when useful for:

- preserving completed work;
- enabling cross-agent visibility;
- preparing integration;
- preventing loss of meaningful progress.

Do not push every trivial intermediate edit.

Before integration, ensure the branch state intended for merge is committed
and available according to the current repository workflow.

Do not force-push over another agent's known shared work without explicit
coordination.

A pushed task branch is still temporary.

Remote publication does not convert a task branch into a permanent branch.

After successful integration and completion, delete the remote temporary
branch unless an explicit valid retention reason remains.

---

# 25. Updating Against Latest `dev`

Before final integration, determine whether the feature branch has become
materially stale relative to `dev`.

If `dev` changed only in unrelated areas and a clean merge is sufficient,
avoid unnecessary ceremony.

If `dev` contains changes touching the same domain or dependency surface:

- refresh the feature branch;
- inspect the combined behavior;
- resolve conflicts;
- rerun relevant validation.

Do not automatically rerun the entire feature validation suite merely because
`dev` advanced.

Follow:

`agent/VALIDATION_POLICY.md`

for risk-based post-integration validation.

---

# 26. Integration Branches

Permanent integration branches are discouraged.

Do not use an additional branch such as:

```text
integration
```

between feature branches and `dev` as the normal workflow.

Normal flow:

```text
feature/fix branch
        ↓
       dev
        ↓
      PROD
```

not:

```text
feature/fix branch
        ↓
integration
        ↓
       dev
        ↓
      PROD
```

Temporary integration branches may be created only when a concrete exceptional
need exists, such as a large experimental multi-branch merge that should not
yet touch `dev`.

Such branches must:

- have a clear temporary purpose;
- have a known owner;
- not become permanent infrastructure;
- be removed after the exceptional integration work finishes.

Do not leave a completed temporary integration branch merely because it once
served a useful purpose.

---

# 27. Domain Structure vs Git Structure

Product/domain hierarchy must not be confused with Git hierarchy.

The product may conceptually be structured as:

```text
Personal OS
├── WORK_OS
│   ├── Checklist
│   └── Attendance
│
└── LIFE_OS
    ├── Life Log
    └── Life Checklist
```

This does not mean Git should become:

```text
dev
├── work-os
│   ├── checklist
│   └── attendance
└── life-os
    ├── life-log
    └── checklist
```

Instead, use a flat integration topology with namespaced branches:

```text
dev
├── fix/work-os/checklist
├── feat/work-os/attendance
├── feat/life-os/life-log
└── feat/life-os/checklist
```

Domain hierarchy belongs in:

- application architecture;
- package/module structure;
- routes;
- documentation;
- branch naming;
- optional worktree directory organization.

It does not require intermediate Git integration branches.

---

# 28. Agent Ownership During a Task

An implementation agent owns its assigned worktree and task branch for the
duration of that task.

Other agents should not modify that branch/worktree unless explicitly taking
over the task.

Ownership ends when:

- implementation is complete;
- required validation is complete;
- work is safely integrated;
- any approved deployment/smoke cycle is complete;
- the temporary workspace has been cleaned up.

Task ownership is operational, not permanent.

No feature branch should become permanently associated with a particular agent.

The owning agent should normally perform cleanup as the final step of the task.

---

# 29. Deployment Serialization Boundary

Implementation and validation may be parallel, but the final shared-state
pipeline must be serialized.

Conceptually:

```text
Agent A ─ implement ─ validate ─┐
                               │
Agent B ─ implement ─ validate ─┤
                               │
                               ↓
                        serialized section

                        latest dev refresh
                               ↓
                         integrate Agent A
                               ↓
                          deploy / smoke
                               ↓
                        cleanup Agent A
                               ↓
                        refresh latest dev
                               ↓
                         integrate Agent B
                               ↓
                          deploy / smoke
                               ↓
                        cleanup Agent B
```

The exact deployment behavior and approval model are defined by:

`agent/PRODUCTION_POLICY.md`

Do not create a second permanent integration branch merely to implement this
serialization.

`dev` is the serialization point.

---

# 30. Deployment Ownership

When multiple agents are ready to deploy, only one should own the
integration/deployment critical section at a time.

The deployment owner should:

1. verify the current `dev` state;
2. integrate only validated intended changes;
3. follow production policy;
4. run required focused smoke validation;
5. finish the deployment lifecycle;
6. clean up the completed task branch/worktree when no retention reason remains;
7. release the deployment critical section before another agent begins its own
   integration/deployment.

Another agent waiting for this critical section should retry after the current
integration/deployment completes.

Routine waiting caused by deployment serialization is not a reason to ask the
user for coordination.

---

# 31. Production Branch / Deployment State

Do not assume branch names alone describe actual production state.

Production may be controlled by:

- a deployment branch;
- hosting-provider configuration;
- CI/CD;
- explicit promotion;
- another repository mechanism.

Use the actual project production contract defined in:

`docs/PROD_OPERATIONS.md`

and the permission/agent behavior defined in:

`agent/PRODUCTION_POLICY.md`.

Do not invent a new branch promotion model solely from assumptions.

Temporary branch cleanup must never accidentally delete a branch that is part
of the documented production contract.

---

# 32. Worktree Cleanup

After successful integration and any required validation/deployment cycle:

1. confirm the worktree contains no valuable uncommitted work;
2. confirm no valuable untracked files would be lost;
3. confirm intended commits are safely integrated into `dev`;
4. confirm no active agent/session still owns the worktree;
5. remove the temporary worktree using Git worktree commands;
6. prune stale worktree metadata where appropriate;
7. delete the temporary local branch;
8. delete the temporary remote branch;
9. fetch/prune remote references where appropriate;
10. verify that cleanup completed successfully.

Example cleanup sequence where appropriate:

```bash
git worktree remove <worktree-path>
git branch -d <branch>
git push origin --delete <branch>
git worktree prune
git fetch --prune
```

Use actual repository state to determine the correct commands.

Do not blindly execute this sequence if doing so could destroy unverified work.

Do not remove a worktree merely because the feature appears complete.

Verify first.

Once verified safe, cleanup should proceed automatically.

---

# 33. Cleanup Verification

A task should not report `DONE` until cleanup has been checked.

Useful verification commands may include:

```bash
git status
git worktree list
git branch -vv
git branch --merged dev
git branch -r --merged origin/dev
git fetch --prune
```

The exact commands may vary according to repository state.

The intended final state is:

```text
main repository
→ stable dev working copy

worktree directory
→ active tasks only

local temporary branches
→ active/unmerged tasks only

remote temporary branches
→ active/unmerged tasks only
```

Completed feature branches should not accumulate indefinitely in GitHub.

Completed worktrees should not accumulate indefinitely on disk.

---

# 34. Existing Legacy Worktrees and Branches

When encountering old worktrees or branches such as:

```text
personal-work-os-integration
feat/old-completed-feature
codex/old-task
```

do not assume they are disposable.

First inspect relevant state using commands such as:

```text
git worktree list
git status
git branch -vv
git branch --merged dev
git log
```

Determine:

- which branch the worktree owns;
- whether it contains uncommitted files;
- whether it contains valuable untracked files;
- whether it contains commits absent from `dev`;
- whether the branch has already been integrated;
- whether it still serves active work;
- whether another agent/session may still depend on it;
- whether it is part of the documented deployment contract.

Then classify it conceptually as:

```text
KEEP
DELETE
INVESTIGATE
```

Use:

```text
KEEP
```

only for active or explicitly required branches/worktrees.

Use:

```text
DELETE
```

when work is safely integrated, inactive, and no valid retention reason remains.

Use:

```text
INVESTIGATE
```

when deletion safety cannot yet be established.

If safe cleanup can be determined from repository state, perform it
autonomously.

Do not ask the user merely to approve routine cleanup.

Ask only when cleanup could destroy unknown valuable work or requires a
product/deployment decision.

---

# 35. Existing User Work

Existing user work has priority over workflow convenience.

Never:

- hard reset unknown user changes;
- delete unknown untracked files;
- force checkout over user modifications;
- discard commits merely to make branch history cleaner;
- remove a worktree containing unverified work;
- force-delete a branch whose unique work has not been understood.

If Git cleanup requires destruction or abandonment of existing work, stop.

A slightly messy Git state is preferable to silent loss of user work.

However, once repository inspection confirms that a completed branch/worktree
contains no unique valuable work, leaving it indefinitely is not safer.

At that point, clean it up.

---

# 36. Normal Autonomous Git Actions

The following normal operations do not require user confirmation when they are
within the approved task scope and safe according to repository state:

- inspect Git status/log/branches;
- inspect worktrees;
- fetch remote updates;
- prune stale remote references;
- create feature/fix branches;
- create temporary worktrees;
- commit task changes;
- push task branches;
- refresh against latest `dev`;
- resolve straightforward non-destructive conflicts;
- merge validated task work into `dev`;
- remove completed safe temporary worktrees;
- delete completed safe local temporary branches;
- delete completed safe remote temporary branches;
- prune stale worktree metadata;
- renumber an unapplied local Flyway migration to avoid a normal version
  collision.

Do not ask the user merely because normal Git operations are required to
complete or clean up the task.

---

# 37. Git Stop Conditions

Stop and ask the user when:

- resolving a conflict requires discarding existing user work;
- two valid implementations conflict at the product-policy level;
- repository state suggests unknown important work may be lost;
- an already-applied Flyway migration conflict cannot be safely resolved;
- branch/history manipulation would require destructive rewriting of shared
  history;
- the correct integration target cannot be determined from canonical policy;
- a branch appears to be part of production/deployment infrastructure but its
  role cannot be determined;
- cleanup would require destroying unique commits or unverified files;
- an operation would materially exceed the scope of the approved task.

Routine branch divergence, clean merge conflicts, worktree creation,
independent migrations, ordinary `dev` refreshes, and cleanup of safely
integrated temporary branches are not stop conditions.

---

# 38. Branch Deletion Safety

Before deleting a temporary branch, establish that its intended work is
preserved.

Useful signals include:

- the branch is merged into `dev`;
- the relevant commits are reachable from `dev`;
- the implementation exists in current integrated code;
- required validation/deployment has completed;
- the branch contains no additional unique intended commits;
- no worktree or active agent still depends on it.

Do not rely on branch naming alone.

Do not rely on a previous verbal statement alone when fresh Git state can be
inspected.

Prefer repository evidence.

If the branch is clearly safe to delete, delete it.

Do not preserve completed branches solely because the agent is reluctant to
perform deletion.

---

# 39. Remote Branch Cleanup

Remote feature branches are temporary too.

After safe integration, the expected lifecycle is:

```text
remote task branch exists
→ work integrated into dev
→ branch no longer needed
→ remote task branch deleted
→ remote-tracking reference pruned
```

Do not allow GitHub to become a historical inventory of every completed task
branch.

Git history already provides history.

A remote task branch should remain only while it serves an active operational
purpose.

---

# 40. Cleanup Ownership

Cleanup belongs to the agent that completes the task lifecycle whenever
practical.

Do not rely on a future generic cleanup task for routine feature completion.

For example:

```text
Agent A
→ creates Branch A / Worktree A
→ implements
→ validates
→ integrates
→ deploys if approved
→ smokes if required
→ removes Worktree A
→ deletes Branch A locally/remotely
→ verifies cleanup
→ reports DONE
```

If another agent takes over ownership, that agent inherits cleanup
responsibility.

The user should not need to manually remind agents to remove every completed
branch/worktree.

---

# 41. Periodic Repository Hygiene

Even with per-task cleanup, periodically inspect repository hygiene.

Review:

```text
git worktree list
git branch -vv
git branch --merged dev
git branch -r --merged origin/dev
```

Look for:

- stale worktrees;
- completed merged local branches;
- completed merged remote branches;
- abandoned agent branches;
- legacy integration branches;
- stale remote-tracking references.

Classify each candidate as:

```text
KEEP
DELETE
INVESTIGATE
```

Clean all entries that are verifiably safe to delete.

Do not retain stale items solely because they are old and therefore seem risky.

Inspect them first.

---

# 42. Efficiency Rules

This is a personal project.

Optimize Git workflow for practical speed rather than enterprise ceremony.

Prefer:

- one coherent branch per task;
- temporary worktrees only when concurrency needs them;
- direct merge back into `dev`;
- targeted conflict inspection;
- lightweight shared-resource coordination;
- autonomous handling of routine Git state;
- prompt worktree cleanup after completion;
- prompt local/remote branch cleanup after completion;
- repository history instead of permanent feature branches.

Avoid:

- permanent integration branches;
- unnecessary nested branch hierarchies;
- excessive worktrees;
- branch creation for trivial substeps;
- repeated Git-state narration;
- asking the user to coordinate routine concurrency;
- full revalidation for unrelated `dev` movement;
- complex distributed locking unless actual concurrency problems justify it;
- retaining completed branches "just in case";
- using GitHub branch lists as project archives;
- postponing cleanup indefinitely.

---

# 43. Canonical Workflow Examples

## Single Agent

```text
dev
 ↓
fix/work-os/checklist
 ↓
create temporary worktree
 ↓
implement
 ↓
validate
 ↓
commit
 ↓
merge → dev
 ↓
deploy if approved
 ↓
smoke if required
 ↓
remove worktree
 ↓
delete local branch
 ↓
delete remote branch
 ↓
prune
 ↓
DONE
```

## Two Parallel Agents

```text
                         Agent A
dev ───────────────→ Worktree A
 │                   Branch A
 │                   implement
 │                   validate
 │
 └───────────────→ Agent B
                     Worktree B
                     Branch B
                     implement
                     validate
```

Then serialize integration:

```text
latest dev
   ↓
merge Agent A
   ↓
deploy / smoke
   ↓
cleanup Agent A
   ↓
latest dev
   ↓
refresh Agent B
   ↓
targeted revalidation if needed
   ↓
merge Agent B
   ↓
deploy / smoke
   ↓
cleanup Agent B
```

## Two Parallel Agents With Independent DB Changes

```text
Agent A
code + migration authoring ──────┐
                                 │
Agent B                          │
code + migration authoring ──────┤
                                 │
                                 ↓
                       Shared DEV DB critical section

                       A refreshes migration state
                                 ↓
                          A applies migration
                                 ↓
                          critical section ends
                                 ↓
                       B refreshes migration state
                                 ↓
                       B renumbers if necessary
                                 ↓
                          B applies migration
```

Neither agent should stop merely because both require database changes.

After each task is safely integrated, its temporary branch/worktree is cleaned
up independently.

---

# 44. Canonical Cleanup Example

Suppose these branches exist:

```text
dev
prod
stg

feat/pos/calendar-multiselect-clipboard-v1
feat/pos/calendar-usability-visual-group-v1
feat/pos/calendar-visual-group-ui-v2
feat/work-os/workflow-calendar-v1
codex/workflow-v1
```

Do not decide from names alone.

Inspect them.

Conceptually:

```text
dev
→ KEEP

prod
→ KEEP if required by PROD operations

stg
→ KEEP only if required by active staging/deployment policy

feat/pos/calendar-multiselect-clipboard-v1
→ DELETE if safely integrated and inactive

feat/pos/calendar-usability-visual-group-v1
→ DELETE if safely integrated and inactive

feat/pos/calendar-visual-group-ui-v2
→ DELETE if safely integrated and inactive

feat/work-os/workflow-calendar-v1
→ DELETE if safely integrated and inactive

codex/workflow-v1
→ DELETE if safely integrated and inactive
```

If a temporary branch contains unique valuable work:

```text
INVESTIGATE
→ preserve work
→ integrate/recover as appropriate
→ cleanup afterward
```

The desired GitHub branch list is not:

```text
dev
prod
stg
dozens of completed feat/*
dozens of completed fix/*
dozens of completed codex/*
```

The desired state is closer to:

```text
dev
prod/stg only when operationally required
currently active temporary branches only
```

---

# 45. Final Task Report

A normal completed implementation report should include cleanup state.

Preferred concise form:

```text
IMPLEMENTATION: COMPLETE
VALIDATION: PASSED
DEV INTEGRATION: COMPLETE
PROD: DEPLOYED / NOT IN SCOPE / DEFERRED
SMOKE: PASSED / NOT REQUIRED
WORKTREE: REMOVED
LOCAL TASK BRANCH: DELETED
REMOTE TASK BRANCH: DELETED
CLEANUP: VERIFIED
STATUS: DONE
```

If cleanup cannot safely complete:

```text
STATUS: NOT FULLY DONE
CLEANUP: BLOCKED

Reason:
- describe the concrete active retention/safety issue
```

Do not report a task as completely finished while knowingly leaving an
unnecessary temporary branch/worktree behind.

---

# 46. Summary

The default Personal Work OS Git model is:

```text
ONE development integration branch:
dev

LONG-LIVED deployment branches:
only those explicitly required by actual deployment policy

MANY temporary parallel task branches:
feat/*
fix/*
codex/*
other task-specific branches

OPTIONAL temporary worktrees:
one per concurrent implementation agent

PARALLEL:
implementation
testing
QA
independent migration authoring

SERIALIZED:
shared DEV schema mutation
dev integration
PROD deployment

AFTER TASK COMPLETION:
merge into dev
deploy if approved
smoke if required
remove worktree
delete local temporary branch
delete remote temporary branch
prune stale references
verify cleanup
```

WORK_OS and LIFE_OS may organize:

- branch names;
- worktree folders;
- code architecture;
- product modules.

They do not create additional permanent Git integration layers.

Database changes are normal autonomous implementation work.

Independent, additive migrations are not stop conditions.

Temporary branches and worktrees are execution environments, not archives.

Git history is the historical record.

The default for completed temporary branches/worktrees is deletion after
safety verification.

Retention requires a concrete active reason.

Agents should coordinate shared resources autonomously and involve the user
only when a conflict is genuinely unsafe, destructive, irreversible, or
requires a product-level decision.

For general agent behavior, see:

`agent/OPERATING_POLICY.md`

For validation behavior, see:

`agent/VALIDATION_POLICY.md`

For production approval and deployment behavior, see:

`agent/PRODUCTION_POLICY.md`

For actual service/environment production details, see:

`docs/PROD_OPERATIONS.md`