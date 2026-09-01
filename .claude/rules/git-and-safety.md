# Git and Safety Rules

## Branch roles

Full authoritative detail: `docs/GIT_WORKFLOW.md`. Summary:

- `dev`, `stg`, `prod` — the permanent branches. Never deleted, never force-pushed, never rewritten. `prod` is production; `main` also exists in this repository but is not part of this permanent set and is not production — see `docs/GIT_WORKFLOW.md` for its current unresolved status.
- `feat/<descriptive-name>` — temporary feature branches, always cut from `dev`. (Older branches in this repository's history use a `feature/*` prefix — that's legacy naming, not the current convention.)

Autonomous sessions **never commit implementation work directly to `dev`, `stg`, or `prod`**. Implementation commits land only on a `feat/*` branch. Merging a feature branch into `dev` is a human decision, done through the repository's normal review process — an autonomous session does not perform that merge itself. Promoting `dev`/`stg`/`prod` forward (fast-forwarding one permanent branch to another's verified commit) is only done when the user explicitly directs that specific promotion.

## Never do these, autonomously or otherwise

- Force-push (`git push --force` / `--force-with-lease`) to any branch.
- Reset, rebase, or otherwise rewrite history on a branch that has already been pushed.
- Amend a commit that has already been pushed.
- Delete `dev`, `stg`, or `prod` — under any circumstances.
- Discard or overwrite another session's or the user's uncommitted changes (`git checkout .`, `git restore .`, `git clean -fd`, `git reset --hard`) without first confirming the changes are truly disposable.
- Edit a Flyway migration file already applied to a shared database (the DEV or PROD Supabase project). Schema changes after that point are new migration files that `ALTER` the existing structure. See `docs/GIT_WORKFLOW.md` for why "merged to a given branch" isn't currently a reliable proxy for this in this repository.
- Touch production data or trigger a production deployment without explicit user approval for that specific action.
- Weaken authentication, ownership validation (`CurrentUserProvider` scoping), concurrency protection (optimistic locking), or a database constraint that exists for data integrity.
- Read, modify, stage, or commit `.claude/settings.local.json`. It is local-only and must never appear in a diff you produce.
- Expose datasource URLs, credentials, tokens, or real user UUIDs/personal data in commit messages, code comments, or reports.

Deleting a `feat/*` (or legacy `feature/*`) branch is different from the above: it is an explicitly authorized cleanup action once its work is verifiably merged into `dev` or `prod` (checked by commit ancestry, never by name alone), and it is not currently the branch checked out. See `docs/GIT_WORKFLOW.md` for the full deletion policy.

## Before every commit

1. `git status` — know exactly what's dirty.
2. Stage only the files that belong to the one unit being committed.
3. `git diff --cached --stat`, then read the actual staged diff.
4. Confirm `.claude/settings.local.json` is not staged.
5. Confirm no unrelated domain (a different backend package, Planning, an unrelated frontend area) is staged.
6. Commit with a message describing that one unit.
7. Push the current feature branch.

## Secrets

Never commit a password, API key, token, or datasource credential. Secrets live in environment variables (see `.env.example`). If a command's output could contain a credential, don't paste that output into a commit message, code comment, or report — summarize instead.
