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

## Current operational state, as of 2026-08-28 **[state — re-verify before relying on this]**

### Historical deviation (resolved)

Earlier in this iteration, the accepted Work Log v1 work went from a
feature-branch chain straight into `prod` (commit `33d3682`), bypassing
`dev` entirely — a process deviation, not an intentional exception. `dev`
and the (now-deleted) `main` sat behind that work for a time, and `stg`
had no unambiguous base while `dev` and `prod` disagreed about what had
actually shipped. A follow-up normalization pass (below) resolved all of
this. Full narrative: `docs/iterations/2026-08-pre-production-hardening.md`.

### Current normalized state (final)

- `dev` and `stg` are both at the same commit — `dev`'s tip after the
  normalization pass, containing the full `prod`-equivalent v1 history
  (`33d3682` is an ancestor of it) plus this repository's own
  documentation. `stg` was fast-forwarded to match `dev` a second time
  after a documentation-correction commit landed on `dev`; both moves
  were plain branch-reference fast-forwards, no merge commits, no
  force-pushes. Whenever they diverge again in the future through normal
  work, that is expected — this note only describes the state
  immediately after this normalization pass completed.
- `prod` was **not** advanced and remains at `33d3682` — untouched
  throughout this entire normalization effort. Documentation/workflow
  synchronization is never, on its own, a reason to promote `prod` (a
  push to `prod` can trigger a real Railway production deployment). It is
  expected and valid for `dev`/`stg` to sit ahead of `prod` whenever
  unreleased work exists.
- `main` no longer exists, locally or on `origin` — deleted after
  confirming it held no unique work (a strict ancestor of `dev`) and that
  GitHub's default branch had already moved to `dev`.
- No `feature/*`-prefixed branches remain anywhere in this repository —
  the last one (`feature/worklog-preprod-final-polish`) was deleted once
  confirmed to be a strict ancestor of the normalized `dev`.

### Future policy

The permanent-branch set (`dev`/`stg`/`prod`) and this document are now
fully in sync with no remaining exceptions. `stg` remains a reserved
placeholder, not yet in the enforced promotion path — see "Promotion
flow" above.

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
