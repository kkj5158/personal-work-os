# Daily Work Chart Targets

Backs the Daily Work chart's baselines (post-production iteration 1). See
`docs/product/work-log-policy.md`.

## Table

`work_chart_targets` (`V15__create_work_chart_targets.sql`) — at most one row
per user (`uq_work_chart_targets_user`): `target_work_minutes` (1–1440),
`target_score` (0–100).

Deliberately simple current-value-only storage — no effective-dated history.
Changing a target changes the baseline shown for historical chart
comparisons too; this is an explicit scope decision for this iteration, not
an oversight (see `WorkChartTarget.java`'s class doc).

## API

Base route `/api/work-chart-targets`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/work-chart-targets` | Returns the configured row, or a built-in default (`480` minutes / `80` points) if none exists yet. |
| `PUT` | `/api/work-chart-targets` | Body `{targetWorkMinutes, targetScore}`. Upserts in place. |

No ownership edge cases beyond the standard `CurrentUserProvider` scoping —
this is the simplest domain added in this iteration.
