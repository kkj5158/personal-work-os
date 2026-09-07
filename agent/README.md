# Personal Work OS — Agent Policy Map

This directory defines how AI development agents operate in this repository.

These documents describe development behavior and workflow.
They are separate from `/docs`, which describes the Personal Work OS product,
architecture, domain contracts, persistence, UI, and runtime environment.

## Canonical Agent Policies

Read only the policies relevant to the current task.

1. `OPERATING_POLICY.md`
    - General agent behavior
    - Autonomy
    - Efficiency and token usage
    - Decision and confirmation policy
    - Genuine stop conditions

2. `GIT_WORKFLOW.md`
    - `dev` integration model
    - Feature/fix branches
    - Git worktrees
    - Parallel agent development
    - Merge and cleanup rules

3. `VALIDATION_POLICY.md`
    - Risk-based validation
    - Targeted tests
    - Build/type checks
    - Browser QA
    - Regression scope

4. `PRODUCTION_POLICY.md`
    - Task-level production approval
    - Deployment permissions
    - Deployment serialization
    - Production safety
    - Operations requiring explicit confirmation

## Product / Service Documentation

Product and service facts live under `/docs`.

Important entry points:

- `/docs/PROJECT.md`
- `/docs/ARCHITECTURE.md`
- `/docs/PROD_OPERATIONS.md`
- `/docs/product/`
- `/docs/contracts/`
- `/docs/backend/`
- `/docs/frontend/`

Agent policy must not redefine product behavior.

Product behavior must not be inferred from agent workflow documents.

## Precedence

For agent behavior:

1. Explicit user instruction for the current task
2. `agent/*.md`
3. Agent-specific adapters such as `CLAUDE.md`
4. Tool defaults

For product behavior:

1. Confirmed product policy
2. API/domain contracts
3. Architecture/persistence documentation
4. Frontend specifications
5. Historical iteration/handoff documents

A product policy conflict is a genuine stop condition.