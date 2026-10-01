# Calendar QA — attendance header, 23:59 drag, server-persisted category colors (2026-10-01)

Classification: **Implementation Evidence (DEV)**. These screenshots are not Final UI References.

Captured with headless Chromium at 1920×1080 against a local QA runtime:
- `next dev` on `localhost:3001`
- the feature backend on `localhost:8291`
- shared DEV, with Flyway `V65__money_mobile_funds.sql` (applied earlier by the MONEY track) followed by `V66__calendar_category_colors.sql`

All fixtures were disposable: `QA-*-20261001` WORK/LIFE categories and Plan/Actual blocks in the week of 2020-01-06, plus one Reflection on 2020-01-09. They were removed afterwards with zero residue. The owner's own categories were only read; their order, names and blocks were not changed.

`dev-qa-results.json` holds the 35 automated checks (35 PASS, 0 FAIL).

| File | Shows |
| --- | --- |
| `DEV_01_ATTENDANCE_HEADERS.png` | Week of 2026-09-14 on real records: 근무 from the WorkRecord where no plan exists, 결근 over a planned 근무, 근태 미정 only where neither exists |
| `DEV_02_INITIAL_COLORS_RAIL_AND_BLOCKS.png` | New roots with their generated (name-based) color; children inheriting; Plan and Actual blocks matching the rail |
| `DEV_03_EDITED_COLORS_AFTER_RELOAD.png` | A WORK child and a LIFE root recolored through the rail picker, after a full reload |
| `DEV_04_SECOND_SESSION_SAME_COLORS.png` | A separate browser session with empty storage resolving the same colors |
| `DEV_05_STALE_LOCAL_OVERRIDE_IMPORT.png` | A session seeded with stale `calendar.appearance.v1` colors: the owner-chosen server color wins, a still-generated color is imported once, and the local copy is cleared |
| `DEV_06_EDITOR_PRESET_NO_RECOLOR.png` | Editor open on a block after applying a saved quick block carrying another color: no color write, category color unchanged |
| `DEV_07_DAY_END_BLOCK_MOVED_ON_GRID.png` | A 23:00–23:59 Plan moved one hour earlier, saved as 22:00–23:00 |
| `DEV_08_DRAG_RESIZE_FINAL_STATE.png` | Final state after Plan/Actual day-end moves, cross-date moves and resizes; every stored time on the five-minute grid, no date rollover |
| `DEV_09_REFLECTION_SAME_COLOR.png` | Completed Reflection for 2020-01-09 drawing the Actual block in the same server color as the rail |

## Read-only off-grid Plan scan (DEV, 2026-10-01)

All 10 timed `planned_time_blocks` rows are on the five-minute grid. None end at 23:59, none are off-grid, none cross midnight. Nothing was normalized.
