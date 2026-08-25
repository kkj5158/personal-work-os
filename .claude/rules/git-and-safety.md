# Git and Safety Rules

## Branch roles

- `main` — production baseline. Stable only.
- `dev` — reviewed development integration. Feature branches are cut from here.
- `feature/*` — isolated autonomous implementation branches. All autonomous implementation work happens here.

Autonomous sessions **never commit implementation work directly to `main` or `dev`**. Implementation commits land only on a `feature/*` branch. Merging a feature branch into `dev` or `main` is a human decision, done through the repository's normal review process (e.g. a pull request) — an autonomous session does not perform the merge itself.

## Never do these, autonomously or otherwise

- Force-push (`git push --force` / `--force-with-lease`) to any branch.
- Reset, rebase, or otherwise rewrite history on a branch that has already been pushed.
- Amend a commit that has already been pushed.
- Delete a branch.
- Discard or overwrite another session's or the user's uncommitted changes (`git checkout .`, `git restore .`, `git clean -fd`, `git reset --hard`) without first confirming the changes are truly disposable.
- Edit a Flyway migration file that has already been merged to `main` (or is otherwise known to have been applied to a shared database). Schema changes after that point are new migration files that `ALTER` the existing structure.
- Touch production data or trigger a production deployment without explicit user approval for that specific action.
- Weaken authentication, ownership validation (`CurrentUserProvider` scoping), concurrency protection (optimistic locking), or a database constraint that exists for data integrity.
- Read, modify, stage, or commit `.claude/settings.local.json`. It is local-only and must never appear in a diff you produce.
- Expose datasource URLs, credentials, tokens, or real user UUIDs/personal data in commit messages, code comments, or reports.

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
