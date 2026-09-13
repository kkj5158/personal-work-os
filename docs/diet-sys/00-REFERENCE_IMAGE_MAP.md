# DIET SYS — UI Reference Map

Target repository location: `docs/diet-sys`

## Source-of-truth priority
1. Text Canon / implementation prompt
2. These approved UI reference images
3. Developer/agent interpretation

If an image conflicts with a text-locked policy, **the text policy wins**.

## CORE implementation references

- `core/01-diet-home-final.png`
  - Diet Home approved visual reference.
  - Home is intentionally sparse: Hero → goal/progress → full-width weight trend → vertically stacked challenges.

- `core/02-diet-daily-record-day-reference.png`
  - Daily Record day-view visual reference.
  - IMPORTANT text override: checklist interaction is success/failure only; neither selected = missing. Do not implement a third Missing button even if shown in this older visual.
  - Day checklist detail should ultimately expose item title + 핵심 + 메모 + success/failure state.

- `core/03-diet-daily-record-week-final.png`
  - Daily Record week-view visual reference.
  - Week is the primary/default working view.
  - Numeric records and checklist are POS-style tables.

- `core/04-diet-planner-reference.png`
  - Planner overall layout reference with Calendar/Timeline at the top.
  - IMPORTANT text overrides:
    - Calendar cells show only weight targets.
    - Weight challenge periods are horizontal colored lines/bars, with per-challenge colors.
    - Only today's cell additionally shows current actual weight.
    - Checklist challenge details do not clutter calendar cells.

## PHASE 2 references

- `phase2/05-diet-progress-final.png`
  - Progress visual reference for Checklist + Metabolic tabs.
  - Text overrides:
    - Checklist table has no bulk-selection checkbox column.
    - Checklist display order is manual Drag & Drop, independent of CORE/SECONDARY/OPTIONAL grouping.
    - Checklist reference lines are per item, not per importance group.

- `phase2/06-diet-gallery-final.png`
  - Gallery structured-board reference.
  - Section → Column → Image/Text block; structured drag/drop rather than free-form pixel canvas.

- `phase2/07-diet-identity-final.png`
  - Identity/Direction visual reference.
  - IMPORTANT text override:
    - No empty placeholder column.
    - 1 block = 1 full-width column, 2 blocks = equal 2 columns, 3 blocks = equal 3 columns.
    - `+ 블록 추가` is a separate header action.

## Missing standalone month image
A separately preserved approved Month screenshot is not included in this ZIP.
Implement Month view from text Canon:
- vertical week-group list
- Month-only `[기록 | 체크리스트]` mode toggle
- default `기록`
- Day/Week do not show this toggle
- remember last month mode when practical

Phase 1 override: Progress/Statistics is active in Phase 1 despite its historical image folder name.
