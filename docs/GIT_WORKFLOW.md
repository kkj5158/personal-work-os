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
operational state" below for why it still physically exists. Do not treat
it as authoritative for anything. It is slated for deletion; see that
section for the one remaining blocker.

GitHub's default branch is being normalized to `dev` (see "Current
operational state").

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
- `main` still exists, both locally and on `origin`, and is **still
  GitHub's default branch** (`origin/HEAD -> origin/main`) — this is the
  one item this normalization pass could not complete. No `gh` CLI or
  other authenticated GitHub API mechanism was available in the session
  that attempted it, and changing a repository's default branch requires
  GitHub API/UI access, not just `git push`/`fetch`. **Manual action
  required:** in the GitHub repository's Settings → Branches, change the
  default branch to `dev`. Once that's done, `main` (which was already
  confirmed to hold no unique work — it is identical to `dev`'s prior
  commit `5eed9da` and a strict ancestor of the current `dev`) can be
  safely deleted locally and on `origin` with no further investigation
  needed; do not delete it before the default-branch change lands, or
  GitHub will simply pick a new default on its own.

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
