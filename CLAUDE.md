# Personal Work OS — Claude Code Entry Guide

This repository uses shared agent policies.

Claude-specific instructions in this file are intentionally minimal.

## Canonical Agent Policies

Follow:

- `agent/OPERATING_POLICY.md`
- `agent/GIT_WORKFLOW.md`
- `agent/VALIDATION_POLICY.md`
- `agent/PRODUCTION_POLICY.md`

Use `agent/README.md` as the policy map.

## Product / Service Knowledge

Product and service documentation lives under:

`docs/`

Read only the canonical documents relevant to the current task.

Do not infer product policy from implementation code when canonical
documentation exists.

## Work Log — Canonical Documents and Precedence
Before making any Work Log change (frontend or backend), read the canonical documents in this order. Where they disagree, the earlier document wins:
1. Confirmed product policy — `docs/product/work-log-policy.md`
2. API/domain contract — `docs/contracts/work-log-contract.md`
3. Backend persistence docs — `docs/backend/work-record.md`, `docs/backend/work-time-entry.md`, `docs/backend/supplemental-work.md`, `docs/backend/activity-categories.md`, `docs/backend/start-time-criteria.md`, `docs/backend/leave-allowance.md`, `docs/backend/checklist.md`, `docs/backend/work-chart-reference-lines.md`
4. Frontend UI specification — `docs/frontend/work-log/work-log-ui-spec.md`
5. Historical handoff documents (e.g. `docs/backend/handoff-work-schedule-ui.md`, `docs/backend/time-work-management-v1.md`, `docs/backend/db-schema.md`) — record of past decisions only, not current policy where it conflicts with 1–4.

## Claude-Specific Rules

- Prefer execution over narration.
- Use targeted repository exploration.
- Minimize unnecessary token usage.
- Follow risk-based validation.
- Respect parallel-agent worktree isolation.
- Do not request redundant PROD confirmation when task-level approval exists.
- `.claude/settings.local.json` is local-only and must never be committed.

Claude-specific convenience rules must never override canonical `/agent`
or `/docs` policy.
