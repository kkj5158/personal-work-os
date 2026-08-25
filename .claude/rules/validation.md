# Validation Rules

## Fast-validation policy

For each implementation unit:

1. Implement one complete vertical slice first — don't validate a half-finished slice.
2. Run one focused validation pass (the package/test scope directly affected).
3. If something fails, correct only that failure, then re-run only the checks affected by the correction — not the entire suite again.
4. Run `git diff --check` before every commit.

Across a whole milestone (multiple units), run one broader validation pass only at the end — not after every individual unit.

## Avoid

- Running both a build and a test command when one already covers the other (e.g. `./gradlew test` already compiles).
- Re-running a check that already passed because of an unrelated later edit.
- Rebuilding or re-testing after a documentation-only change.
- Large browser regression sweeps for a change scoped to one component — verify the actual affected surface only.
- Pasting long command logs into a report — summarize pass/fail and the count, not the raw output.

## Distinguish pre-existing failures from new ones

Some checks are known to fail in this environment independent of any change here (for example, `BackendApplicationTests.contextLoads()` fails whenever no live datasource is configured). Before reporting a failure as caused by your change, confirm it wasn't already failing beforehand for an unrelated, known reason. Never spend time troubleshooting a failure that traces to missing local credentials — report it as "live verification pending" instead.

## Never claim a check passed unless it actually ran

If a datasource, browser, or other dependency was unavailable and a check was skipped, say so explicitly. Do not report "tests passed" or "verified" for anything that wasn't actually executed in this session.
