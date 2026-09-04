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