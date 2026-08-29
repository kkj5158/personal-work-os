# Work Chart Reference Lines

Backs the "기준선 설정" feature on the Work Record page's Daily Work and
Work Trend chart sections (post-production iteration 1, batch 2). Replaces
the earlier single-value Daily Work chart target (`work_chart_targets`,
V15) — see the migration note below.

## Table

`work_chart_reference_lines` (`V19__create_work_chart_reference_lines.sql`)
— up to 3 rows per `(user_id, scope)`, positioned `0..2`
(`uq_work_chart_reference_lines_position`): `scope`, `position`, `label`
(1–20 chars), `value`, `color`.

## Scopes

`scope` is one of `DAILY_TIME`, `DAILY_SCORE`, `WEEKLY_TIME`,
`WEEKLY_SCORE`. Daily and weekly time scopes are kept strictly separate:
`DAILY_TIME` is a clock-of-day-ish duration bounded to a single day
(1–1440 minutes), while `WEEKLY_TIME` is an aggregated weekly duration that
can exceed 24 hours (1–10080 minutes, i.e. up to 7 days) — a value like
34:15 is a valid `WEEKLY_TIME` value but would be meaningless as
`DAILY_TIME`. `DAILY_SCORE`/`WEEKLY_SCORE` both use the existing 0–100 Work
Score range. All four ranges are enforced by both the DB CHECK constraint
(`chk_work_chart_reference_lines_value`) and
`WorkChartReferenceLineService`.

## Color

`color` is one of a fixed 6-token palette (`BLUE`, `GREEN`, `AMBER`, `RED`,
`CYAN`, `GRAY`) — deliberately not a free-form picker. Each token maps to
an existing Personal Work OS chart/semantic CSS variable on the frontend
(`--primary-emphasis`, `--success-emphasis`, `--warning-emphasis`,
`--danger-emphasis`, `--chart-score-emphasis`, `--fg-muted` respectively) —
see `frontend/app/worklog/referenceLine.ts`.

## API

Base route `/api/work-chart-reference-lines`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/work-chart-reference-lines` | Returns every line for the current user, all scopes, ordered by scope then position. |
| `POST` | `/api/work-chart-reference-lines` | Body `{scope, label, value, color}`. Appends at the next position (`existing count`); rejected with 400 once the scope already has 3. |
| `PUT` | `/api/work-chart-reference-lines/{id}` | Body `{label, value, color}`. `scope`/`position` are immutable via this endpoint. |
| `DELETE` | `/api/work-chart-reference-lines/{id}` | `204`. Re-numbers the scope's remaining lines back to a contiguous `0..n-1` range, preserving relative order, so a later `POST` always appends correctly. |

No dedicated reorder endpoint — creation order is display order (product
decision: reference lines don't need drag-and-drop in this batch, unlike
`ActivityCategory`'s reorder/move — see `docs/product/work-log-policy.md`).

Standard `CurrentUserProvider` ownership scoping applies to every endpoint;
a foreign-owned or missing `id` returns 404.

## Migration from `work_chart_targets` (V19)

`work_chart_targets` (one row per user: `target_work_minutes`,
`target_score`) is dropped in the same migration that creates this table.
Each existing row is migrated into two reference lines before the drop:

- `DAILY_TIME` position 0, label `목표`, value = `target_work_minutes`, color `GRAY`
- `DAILY_SCORE` position 0, label `목표`, value = `target_score`, color `GRAY`

`WEEKLY_TIME`/`WEEKLY_SCORE` are newly introduced scopes and intentionally
start empty for every user — no prior data maps to them.

## Frontend status

`frontend/app/worklog/DailyWorkChart.tsx` renders `DAILY_TIME`/
`DAILY_SCORE` lines; `frontend/app/worklog/WorkLogTrendSection.tsx` renders
`WEEKLY_TIME`/`WEEKLY_SCORE` lines. Both read/write through
`frontend/lib/api/workChartReferenceLines.ts` and share one settings
UI shell, `frontend/app/worklog/ReferenceLineSettingsModal.tsx` (opened via
each section's "기준선 설정" button), parameterized by which pair of scopes
it manages.
