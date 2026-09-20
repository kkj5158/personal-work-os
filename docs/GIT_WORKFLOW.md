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

`main` is **obsolete, no longer part of the intended branch model, and no
longer exists** — deleted both locally and on `origin` once confirmed to
hold no unique work. If a `main` branch ever reappears in this
repository, treat that as a surprise worth investigating, not as
something to defer to.

GitHub's default branch is `dev` — confirmed via a live query
(`git ls-remote --symref origin HEAD`), which is the authoritative check;
a local clone's cached `remotes/origin/HEAD` (`git branch -a`) only
updates on `git clone` or an explicit `git remote set-head origin -a`,
never on a plain `git fetch`, so don't trust it alone if the two ever
seem to disagree.

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

## Repository state verification **[policy]**

This document defines repository policy, not a snapshot of the repository's
current operational state.

Do not rely on hard-coded branch tips, commit SHAs, branch equality,
ahead/behind relationships, active feature branches, worktrees, or other
time-sensitive repository state recorded in documentation.

Before making any branch, worktree, merge, promotion, migration, or cleanup
decision, verify the relevant repository state directly from Git.

At minimum, inspect the state relevant to the intended operation, including
as appropriate:

- the currently checked-out branch;
- uncommitted and untracked changes;
- active Git worktrees;
- local and remote branches;
- the authoritative remote default branch;
- the latest `dev`, `stg`, and `prod` refs;
- ahead/behind and ancestry relationships between branches;
- active `feat/*` branches;
- whether another session or the user may have in-progress work.

Use live Git state as the source of truth for operational decisions.

For example, when the authoritative remote default branch matters, verify it
with:

`git ls-remote --symref origin HEAD`

Do not rely solely on a clone's cached `remotes/origin/HEAD`.

Likewise, branch integration or deletion decisions must be based on live
ancestry checks, as defined elsewhere in this policy, rather than on a
previously documented repository snapshot.

## Historical repository events **[documentation policy]**

Historical deviations, normalization work, migrations between branch
strategies, and other repository-specific incidents may be documented for
context, but they must not be treated as current operational state.

Detailed historical narratives belong in iteration/history documents such as:

`docs/iterations/2026-08-pre-production-hardening.md`

If a historical document mentions specific branch tips, commit SHAs, or
repository relationships, those values describe that historical moment only.

Agents must never infer the current repository state from those historical
records without re-verifying it directly from Git.

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