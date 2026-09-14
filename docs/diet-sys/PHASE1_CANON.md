# DIET SYS — Phase 1

Source of truth: **TEXT CANON > UI REFERENCE IMAGE > IMPLEMENTER INTERPRETATION**.
The implementation prompt overrides historical LIFE CODE labels and screenshot artifacts.
DIET SYS is a top-level Personal OS system. Home, Record, Planner and Statistics are active;
Gallery and Identity/Goals remain visible, disabled Phase 2 entries.

## Core behavior

- Record defaults to Week. Day is editable; Month stacks partial/full week groups and alone offers Record/Checklist mode. Numeric and checklist importance each have independent CORE / SECONDARY / OPTIONAL visibility buttons; changing one domain never changes the other.
- Ten optional typed measurements include total fasting hours only. Measurement importance and ordering are configurable.
- Checklist success/failure buttons toggle back to missing. Item importance is independent of persisted manual order.
- Challenges support weight, checklist and manual progress with simultaneous active challenges. Checklist memberships store item IDs, including when selected by importance.
- Missing is included by default. Eligible checks are elapsed days through Seoul today, bounded by item start and challenge dates; future dates never enter the denominator. Excluding missing uses success + failure only.
- Home and Statistics share WeightChart: recorded weight, seven-day mean, daily targets, weekly goal history, monthly goal history, milestones and global reference lines. Period presets clip dates without disabling overlays. Goal labels include type, target weight and core; short-term reference is blue. Weight losses stay red. Seven-day means use available measurements within seven calendar days.
- Global SHORT_TERM / WEEKLY / MONTHLY / FINAL goals are independent of every challenge. Each dated point stores targetWeight, targetDate, core and memoItems. Adding a new dated point preserves history; editing an explicitly selected point changes only that point. Current goal is the nearest upcoming target date, falling back to the latest past point.
- Challenge role (CURRENT_FOCUS / NEXT_FOCUS / FINAL_GOAL) is independent of type and status; each role can contain multiple weight and checklist challenges. Challenge-specific targets never update global goals.
- Planner order is display controls → Current Focus → full-width calendar → full-width horizontal milestone timeline → Next Focus → Final Goal → management. Calendar layers use blue/gray buttons for checklist durations and daily morning-weight records; management status filters do not filter these layers. Calendar record labels say `기록`; global goal markers include goal type.
- Milestone memoItems appear directly below their individual timeline nodes. Global goals, milestones and challenge notes use a bullet editor where Enter adds an item.
- Home active Weight and Checklist challenges occupy separate columns with independent home sort order and 2×2 title/achievement/core/memo cards. Management order stays separate.
- Statistics period buttons are 7일 / 4주 / 이번 달 / Challenge / 전체 / 기간 선택. The last opens a date-range dialog.
- Checklist statistics emphasize counts with per-item weekly/monthly reference counts. Metabolic averages exclude nulls and count each morning/bedtime measurement separately. Editable personal lines/bands are references, not diagnostic rules.

## Persistence / future imports

V36 adds eight owner-scoped Diet tables. V37 adds independent global goals, challenge roles, independent Home order and milestone bullet memos. Measurements are columns, membership is relational, settings use bounded JSON. API access uses the existing authenticated current-user provider, owner constraints and RLS with no public policies.

`GET /api/diet` supplies the Diet snapshot. Entity PUTs use stable client UUIDs; daily records use date keys; checklist entries use date + item ID. Mutations return 204. Ordering endpoints accept ID lists and preserve nonselected positions. Item deletion archives it, preserving historical checks and challenge memberships. Global goals have no challenge foreign key. Milestones remain challenge-specific. Home ordering uses `/challenges/home-order` with type + IDs and never changes another type or management order.

V37 copies only legacy goals with `challenge_id IS NULL` into the new global model. Existing challenge-owned `diet_goals` rows are preserved as legacy data: their intended global meaning cannot be inferred safely. They are not silently promoted to global targets, nor rewritten by challenge edits. A later explicit mapping can recover them; their existing challenge-delete cascade remains, so deleting the parent challenge still deletes its legacy rows. Existing milestone memo text is retained and represented as bullet items. Applied migrations remain immutable.

Later import work should map Notion IDs to stable UUIDs, convert dates to Seoul calendar keys, preserve null vs zero, initialize item start dates, resolve challenge item snapshots, and preserve sort order. There is no importer in Phase 1. Keep applied Flyway migrations immutable and evolve via additive migrations.

## References

`00-REFERENCE_IMAGE_MAP.md` and the `core` / `phase2` image folders preserve the supplied visual package, copied from the main checkout's `docs/assets/diet-sys` without changing that user's staged source. No ZIP was present in the provided repository assets. Historical `phase2/05-diet-progress-final.png` is used as a Phase 1 statistics visual reference per the implementation prompt.
