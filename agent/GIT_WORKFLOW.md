# Personal Work OS — Agent Git Workflow

## Purpose

This document defines the canonical Git, branch, worktree, parallel-agent,
integration, and shared-development-resource workflow for Personal Work OS.

Personal Work OS is a single-owner personal project that may use multiple
AI development agents concurrently.

The goal is to enable high autonomy and parallel development without creating
unnecessary Git hierarchy or requiring user coordination for routine conflicts.

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

---

# 3. Branch Naming

Use short-lived feature or fix branches for implementation work.

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

---

# 6. Temporary Worktrees

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
→ remove worktree
→ delete branch when safe
```

Completed worktrees should not remain indefinitely without a concrete reason.

Avoid permanent directories such as:

```text
personal-work-os-integration
```

when they no longer serve active work.

Before removing an existing worktree:

1. inspect `git worktree list`;
2. inspect the worktree's branch;
3. check for uncommitted changes;
4. check whether commits remain unmerged;
5. preserve any existing user or agent work;
6. remove it only when safe.

Use Git-aware worktree commands.

Do not delete a tracked worktree directory from the filesystem alone.

---

# 7. Parallel Agent Policy

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

# 8. Parallelism vs Serialization

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

# 9. Shared Resource Awareness

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

# 10. Shared DEV Database Coordination

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

# 11. Flyway Migration Rules

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

# 12. Migration Critical Section

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

# 13. Independent Database Features

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

# 14. Shared DEV Data

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

# 15. Local Runtime Coordination

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

# 16. Integration into `dev`

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

---

# 17. Concurrent Integration

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

---

# 18. Conflict Resolution

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

# 19. Commits

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

---

# 20. Push Policy

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

---

# 21. Updating Against Latest `dev`

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

# 22. Integration Branches

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

Such branches should:

- have a clear temporary purpose;
- not become permanent infrastructure;
- be removed after the exceptional integration work finishes.

---

# 23. Domain Structure vs Git Structure

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

# 24. Agent Ownership During a Task

An implementation agent owns its assigned worktree and feature branch for the
duration of that task.

Other agents should not modify that branch/worktree unless explicitly taking
over the task.

Ownership ends when:

- implementation is complete;
- required validation is complete;
- work is safely integrated;
- any approved deployment/smoke cycle is complete;
- the temporary workspace can be cleaned up.

Task ownership is operational, not permanent.

No feature branch should become permanently associated with a particular agent.

---

# 25. Deployment Serialization Boundary

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
                        refresh latest dev
                               ↓
                         integrate Agent B
                               ↓
                          deploy / smoke
```

The exact deployment behavior and approval model are defined by:

`agent/PRODUCTION_POLICY.md`

Do not create a second permanent integration branch merely to implement this
serialization.

`dev` is the serialization point.

---

# 26. Deployment Ownership

When multiple agents are ready to deploy, only one should own the
integration/deployment critical section at a time.

The deployment owner should:

1. verify the current `dev` state;
2. integrate only validated intended changes;
3. follow production policy;
4. run required focused smoke validation;
5. finish or release the deployment critical section before another agent
   begins its own integration/deployment.

Another agent waiting for this critical section should retry after the current
integration/deployment completes.

Routine waiting caused by deployment serialization is not a reason to ask the
user for coordination.

---

# 27. Production Branch / Deployment State

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

---

# 28. Worktree Cleanup

After successful integration and any approved deployment cycle:

1. confirm the feature branch contains no uncommitted work;
2. confirm intended commits are safely integrated;
3. remove the temporary worktree using Git worktree commands;
4. prune stale worktree metadata where appropriate;
5. delete the temporary local branch when safe;
6. delete the remote temporary branch when repository practice allows and it
   no longer serves a purpose.

Do not remove a worktree merely because the feature appears complete.

Preserve work first.

---

# 29. Existing Legacy Worktrees

When encountering old worktrees such as:

```text
personal-work-os-integration
```

do not assume they are disposable.

First inspect:

```text
git worktree list
git status
git branch -vv
git log
```

and determine:

- which branch the worktree owns;
- whether it contains uncommitted files;
- whether it contains commits absent from `dev`;
- whether it still serves active work;
- whether another agent/session may still depend on it.

If no valuable or active work remains, clean it up.

If valuable unmerged work exists, preserve and integrate or otherwise retain it
before cleanup.

If safe cleanup can be determined from repository state, do it autonomously.

Ask the user only when cleanup would risk destroying work or the correct intent
cannot be determined safely.

---

# 30. Existing User Work

Existing user work has priority over workflow convenience.

Never:

- hard reset unknown user changes;
- delete unknown untracked files;
- force checkout over user modifications;
- discard commits merely to make branch history cleaner;
- remove a worktree containing unverified work.

If Git cleanup requires destruction or abandonment of existing work, stop.

A slightly messy Git state is preferable to silent loss of user work.

---

# 31. Normal Autonomous Git Actions

The following normal operations do not require user confirmation when they are
within the approved task scope and safe according to repository state:

- inspect Git status/log/branches;
- fetch remote updates;
- create feature/fix branches;
- create temporary worktrees;
- commit task changes;
- push task branches;
- refresh against latest `dev`;
- resolve straightforward non-destructive conflicts;
- merge validated task work into `dev`;
- remove completed safe temporary worktrees;
- delete completed safe temporary branches;
- renumber an unapplied local Flyway migration to avoid a normal version
  collision.

Do not ask the user merely because normal Git operations are required to
complete the task.

---

# 32. Git Stop Conditions

Stop and ask the user when:

- resolving a conflict requires discarding existing user work;
- two valid implementations conflict at the product-policy level;
- repository state suggests unknown important work may be lost;
- an already-applied Flyway migration conflict cannot be safely resolved;
- branch/history manipulation would require destructive rewriting of shared
  history;
- the correct integration target cannot be determined from canonical policy;
- an operation would materially exceed the scope of the approved task.

Routine branch divergence, clean merge conflicts, worktree creation,
independent migrations, and ordinary `dev` refreshes are not stop conditions.

---

# 33. Efficiency Rules

This is a personal project.

Optimize Git workflow for practical speed rather than enterprise ceremony.

Prefer:

- one coherent branch per task;
- temporary worktrees only when concurrency needs them;
- direct merge back into `dev`;
- targeted conflict inspection;
- lightweight shared-resource coordination;
- autonomous handling of routine Git state;
- prompt worktree cleanup after completion.

Avoid:

- permanent integration branches;
- unnecessary nested branch hierarchies;
- excessive worktrees;
- branch creation for trivial substeps;
- repeated Git-state narration;
- asking the user to coordinate routine concurrency;
- full revalidation for unrelated `dev` movement;
- complex distributed locking unless actual concurrency problems justify it.

---

# 34. Canonical Workflow Examples

## Single Agent

```text
dev
 ↓
fix/work-os/checklist
 ↓
implement
 ↓
validate
 ↓
merge → dev
 ↓
deploy if approved
 ↓
smoke
 ↓
cleanup branch/worktree
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
latest dev
   ↓
refresh Agent B
   ↓
targeted revalidation if needed
   ↓
merge Agent B
   ↓
deploy / smoke
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

---

# 35. Summary

The default Personal Work OS Git model is:

```text
ONE integration branch:
dev

MANY temporary parallel branches:
feat/*
fix/*

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

AFTER COMPLETION:
merge
deploy if approved
smoke test
remove worktree
delete temporary branch
```

WORK_OS and LIFE_OS may organize:

- branch names;
- worktree folders;
- code architecture;
- product modules.

They do not create additional permanent Git integration layers.

Database changes are normal autonomous implementation work.

Independent, additive migrations are not stop conditions.

Agents should coordinate shared resources autonomously and involve the user only
when a conflict is genuinely unsafe, destructive, irreversible, or requires a
product-level decision.

For general agent behavior, see:

`agent/OPERATING_POLICY.md`

For validation behavior, see:

`agent/VALIDATION_POLICY.md`

For production approval and deployment behavior, see:

`agent/PRODUCTION_POLICY.md`

For actual service/environment production details, see:

`docs/PROD_OPERATIONS.md`