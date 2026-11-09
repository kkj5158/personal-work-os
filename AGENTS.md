# Personal Work OS — Agent Entry Guide

This repository may be developed by multiple AI coding agents.

General agent behavior is defined under:

`/agent`

Start with:

- `agent/README.md`
- `agent/OPERATING_POLICY.md`

Read additional policies according to the task:

- Git / worktrees / parallel development:
  `agent/GIT_WORKFLOW.md`

- Testing / QA:
  `agent/VALIDATION_POLICY.md`

- Production deployment:
  `agent/PRODUCTION_POLICY.md`

Product and service knowledge lives under:

`/docs`

Do not treat this file as the canonical source of detailed policy.

The `/agent` documents are authoritative for agent workflow.
The `/docs` documents are authoritative for product/service behavior.

## Owner browser preference — 2026-11-10

The TEAM KAFKA dedicated browser profile normally retains the owner's signed-in
session. Inspect and reuse that session first, and repair the designated launcher
when needed. Do not repeatedly ask the owner to log in or switch accounts. Ask
only after an actual required authentication failure cannot be recovered through
the existing normal session. Never request passwords or tokens in chat.

For API automatic deployment, follow `agent/API_AUTODEPLOY.md`.
