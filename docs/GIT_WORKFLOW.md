# Git Workflow Policy

This is the authoritative Git branch policy for this repository. Both
`CLAUDE.md` and `.claude/rules/git-and-safety.md` point here for detail —
if either of those ever disagrees with this file, treat this file as
correct and fix the other.

## Permanent long-lived branches **[policy]**

- `dev`
- `stg`
- `prod`

These must never be deleted, force-pushed, reset, or have their history
rewritten — by an autonomous session or otherwise.

`main` also currently exists in this repository but is **not** part of the
permanent-branch policy above. It is not production (`prod` is) and its
role going forward is unresolved — see "Current operational state" below.
Do not delete it, but do not treat it as authoritative for anything either.

## Promotion flow **[policy]**

Current (active now):
```
feat/* → dev → prod
```

Future (once `stg` is introduced into the active flow):
```
feat/* → dev → stg → prod
```

`stg` exists in the permanent-branch list today so its role is reserved,
but it is not yet part of the enforced promotion path.

## Feature branches **[policy]**

- Always originate from `dev`. Never branch a `feat/*` directly from
  `prod`.
- Naming convention: `feat/<descriptive-name>`. (Legacy branches in this
  repository's history used `feature/<descriptive-name>` — that prefix is
  historical, not the current convention. New work uses `feat/*`.)
- Temporary by design: merged back into `dev`, then deleted both locally
  and on `origin` once the work is fully integrated. A `feat/*` branch is
  never expected to live indefinitely.
- Normal structure during active development looks like: `dev`, one or
  more `feat/*` branches, `stg`, `prod` — plus whatever the human has
  currently checked out.

## When a feature branch is safe to delete

A branch is safe to delete only once its meaningful work is verifiably
contained in `dev` or `prod` — checked by commit ancestry
(`git merge-base --is-ancestor <branch> <target>`) and cross-checked with
`git branch --merged <target>`, never by branch name or assumption alone.
Be conservative: if ancestry is ambiguous, or the branch is the one
currently checked out, leave it and flag it rather than deleting it.

Deleting a fully-merged temporary branch (local `git branch -d`, remote
`git push origin --delete`, then `git fetch --prune`) is an explicitly
authorized cleanup action, not a destructive one requiring special
permission each time — this is a correction to the older, more absolute
"never delete a branch" language that used to live in
`.claude/rules/git-and-safety.md`; that blanket rule was written before
`dev`/`stg`/`prod` existed as a formal permanent-branch set and before
this deletion policy was confirmed. The permanent branches remain
absolutely protected regardless.

## Current operational state, as of 2026-08-28 **[state — re-verify before relying on this]**

Established during a full branch audit in this iteration
(`git merge-base --is-ancestor`, `git branch --merged`, `git ls-remote
--heads origin`):

- `prod` is at commit `33d3682` and contains the complete
  pre-production-hardening iteration (see `docs/iterations/`).
- `dev` and `main` are both at an older commit (`5eed9da`) and do **not**
  contain that work — it went from a feature branch straight into `prod`,
  bypassing `dev` entirely. This is a deviation from the stated
  `feat/* → dev → prod` flow, not an intentional policy exception. `dev`
  is currently *behind* what's actually deployed.
- `stg` does not exist yet. Its correct base was evaluated and found
  genuinely ambiguous *because of* the `dev`/`prod` divergence above:
  basing it on `dev` would leave it behind current production; basing it
  on `prod` would put it ahead of `dev`, pre-empting the intended
  `dev → stg → prod` order before `dev` has caught up. It was deliberately
  left uncreated rather than guessing. **Recommended next step (not yet
  taken):** bring `dev` up to `prod`'s content first (a human decision,
  not something to do unilaterally), then branch `stg` from the resulting
  `dev`.
- Three superseded intermediate feature branches
  (`feature/worklog-backend-core`, `feature/worklog-mvp-integration`,
  `feature/worklog-mvp-polish`) were confirmed fully merged into `prod`
  and deleted, both locally and on `origin`.
  `feature/worklog-preprod-final-polish` still exists — its work is also
  fully in `prod`, but it was the actively checked-out branch at cleanup
  time, so it was deliberately left alone rather than switching the
  working checkout as a side effect of a cleanup task.

## Safety rules **[policy]**

- No force-push (`--force`/`--force-with-lease`) to any branch, ever.
- No reset, rebase, or history rewrite on a branch that has already been
  pushed.
- No amending a commit that has already been pushed.
- Never delete `dev`, `stg`, or `prod`.
- Discarding another session's or the user's uncommitted changes
  (`git checkout .`, `git restore .`, `git clean -fd`, `git reset --hard`)
  requires first confirming the changes are truly disposable.
- `.claude/settings.local.json` must never be modified, staged, committed,
  restored, deleted, or overwritten by any session, for any reason. It is
  local-only, intentional configuration.
- Never expose datasource URLs, credentials, tokens, or real user
  UUIDs/personal data in commit messages, code comments, or reports.
