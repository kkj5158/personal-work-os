# DIET SYS — Phase 1

Source of truth: **TEXT CANON > UI REFERENCE IMAGE > IMPLEMENTER INTERPRETATION**.
The implementation prompt overrides historical LIFE CODE labels and screenshot artifacts.
DIET SYS is a top-level Personal OS system. Home, Record, Planner and Statistics are active;
Gallery and Identity/Goals remain visible, disabled Phase 2 entries.

## Core behavior

- Record defaults to Week. Day is editable; Month stacks partial/full week groups and alone offers Record/Checklist mode.
- Ten optional typed measurements include total fasting hours only. Measurement importance and ordering are configurable.
- Checklist success/failure buttons toggle back to missing. Item importance is independent of persisted manual order.
- Challenges support weight, checklist and manual progress with simultaneous active challenges. Checklist memberships store item IDs, including when selected by importance.
- Missing is included by default. Eligible checks are elapsed days through Seoul today, bounded by item start and challenge dates; future dates never enter the denominator. Excluding missing uses success + failure only.
- Home and Statistics share WeightChart and reference settings. Weight losses use red. Seven-day moving averages use available measurements within seven calendar days.
- Planner contains calendar/timeline first, then challenges, shared goals and milestones. Actual weight appears only in today's cell. FINAL weight goals and challenge target/end date update atomically.
- Checklist statistics emphasize counts with per-item weekly/monthly reference counts. Metabolic averages exclude nulls and count each morning/bedtime measurement separately. Editable personal lines/bands are references, not diagnostic rules.

## Persistence / future imports

V36 adds eight owner-scoped Diet tables; no existing data is transformed. Measurements are columns, membership is relational, settings use bounded JSON. API access uses the existing authenticated current-user provider, owner constraints and RLS with no public policies.

`GET /api/diet` supplies the Diet snapshot. Entity PUTs use stable client UUIDs; daily records use date keys; checklist entries use date + item ID. Mutations return 204. Ordering endpoints accept ID lists and preserve nonselected positions. Item deletion archives it, preserving historical checks and challenge memberships. Goals/milestones belong to challenges; challenge deletion removes its planning children. FINAL goals are maintained with the weight challenge and cannot be independently deleted or reassigned.

Later import work should map Notion IDs to stable UUIDs, convert dates to Seoul calendar keys, preserve null vs zero, initialize item start dates, resolve challenge item snapshots, and preserve sort order. There is no importer in Phase 1. Keep applied Flyway migrations immutable and evolve via additive migrations.

## References

`00-REFERENCE_IMAGE_MAP.md` and the `core` / `phase2` image folders preserve the supplied visual package, copied from the main checkout's `docs/assets/diet-sys` without changing that user's staged source. No ZIP was present in the provided repository assets. Historical `phase2/05-diet-progress-final.png` is used as a Phase 1 statistics visual reference per the implementation prompt.
