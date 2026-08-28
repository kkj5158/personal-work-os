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

`main` is **obsolete and is no longer part of the intended branch model.**
It is not production (`prod` is) and holds no unique work — see "Current
operational state" below for why it still physically exists on `origin`
(local `main` is already gone). Do not treat it as authoritative for
anything.

GitHub's default branch is confirmed to be `dev` (verified live — see
"Current operational state" for why the locally cached
`remotes/origin/HEAD` in this clone may still display `main` regardless).

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

### Historical deviation (now corrected)

An earlier audit in this iteration found that the accepted Work Log v1
work had gone from a feature-branch chain straight into `prod`
(commit `33d3682`), bypassing `dev` entirely — a deviation from the stated
`feat/* → dev → prod` flow, not an intentional policy exception. At that
point `dev` and `main` were both still at the older `5eed9da`, and `stg`
had no unambiguous base while `dev` and `prod` disagreed about what had
actually shipped. Three already-superseded intermediate feature branches
were deleted then; the branch still carrying the unmerged documentation
work (`feature/worklog-preprod-final-polish`) was deliberately left in
place rather than deleted out from under an active checkout.

### Current normalized state

A follow-up normalization pass resolved the gap above:

- `dev` was fast-forwarded (branch-reference advancement, no merge commit)
  to `87d6267` — the tip of `feature/worklog-preprod-final-polish`, which
  contained both the full `prod`-equivalent v1 history (`33d3682` is an
  ancestor of `87d6267`) and this repository's own documentation bootstrap
  on top of it. Verified via `git merge-base --is-ancestor` before and
  after; pushed to `origin/dev` as a clean fast-forward, not a force-push.
  `dev` now strictly contains everything `prod` has, plus the
  documentation commit `prod` does not.
- `stg` was created from that normalized `dev` HEAD (`87d6267`) and pushed
  to `origin/stg` with normal upstream tracking — the earlier ambiguity is
  resolved because `dev` and `prod` no longer disagree about content,
  only about which commit each currently points to.
- `feature/worklog-preprod-final-polish` was deleted, both locally and on
  `origin`, once confirmed to be a strict ancestor of the now-normalized
  `dev` (its tip *is* `dev`'s tip). No stale `feature/*`-prefixed refs
  remain anywhere in this repository.
- `prod` was deliberately **not** advanced. It remains at `33d3682`
  intentionally — synchronizing documentation is not, on its own, a reason
  to promote `prod` (a push to `prod` can trigger a real Railway
  production deployment). It is expected and valid for `dev`/`stg` to sit
  ahead of `prod` whenever unreleased work exists.
- GitHub's actual default branch was confirmed to already be `dev` — via a
  live query (`git ls-remote --symref origin HEAD`), not the locally
  cached `remotes/origin/HEAD` that `git branch -a` shows (that cache is
  set at clone time / by an explicit `git remote set-head` and does
  **not** track a later change made on GitHub through a plain
  `git fetch`; it still displays `-> origin/main` in this repository's
  local clone and will keep doing so until someone runs
  `git remote set-head origin -a` locally, which is cosmetic only and
  changes nothing on GitHub). Whether the default was already `dev`
  before this normalization pass, or changed on GitHub during it, is not
  something this session can determine from Git alone — only that it is
  confirmed `dev` now.
- With that confirmed, `main` (already established to hold no unique
  work — identical to `dev`'s prior commit `5eed9da`, a strict ancestor of
  the current `dev`) was safe to delete. **Local `main` was deleted
  successfully.** The corresponding `git push origin --delete main` was
  **blocked by this session's own runtime permission system** (the Claude
  Code auto-mode classifier), not by any GitHub-side restriction or a
  missing `gh` CLI/API mechanism — the session did not attempt to route
  around that denial. `origin/main` therefore still exists, unchanged, at
  `5eed9da`. **Manual action required:** run
  `git push origin --delete main` (from a context permitted to do so),
  then `git fetch --prune` to clear the resulting stale
  `remotes/origin/main` tracking ref locally.

### Future policy

Once `main` is deleted, the permanent-branch set (`dev`/`stg`/`prod`) and
this document will be fully in sync with no remaining exceptions. `stg`
remains a reserved placeholder, not yet in the enforced promotion path —
see "Promotion flow" above.

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
