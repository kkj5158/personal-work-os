# WORK FLOW V1 - Batch 3 implementation evidence (2026-09-27)

Classification: **Implementation Evidence**, not Final UI Reference. The design references are S04 / S05 / S06 in the Drive UIREF assets.

Captured with headless Chromium on the owner-accessible DEV runtime: `next dev` on `localhost:3000` against the dev-profile backend on `127.0.0.1:8280`, using the shared DEV database at Flyway v61. The integration candidate was dev `8ce0e21`. All edits used `[QA-B3]` fixtures in the week of 2099-01-05, removed afterwards. The other rows are existing DEV data.

| File | Shows |
| --- | --- |
| `B3_S04_THIS_WEEK_PLAN.png` | S04 plan list: Project inclusion buttons, week-ordered section, scope line, selection kinds, rail |
| `B3_S04_FOCUS_GOALS.png` | Exactly three Focus slots (one empty) and Weekly Goals with the checkbox on the right |
| `B3_S05_WEEKDAY_BOARD.png` | Seven-day board with the same Task on Wed and Thu, move notice with Undo, 날짜 미정 rail |
| `B3_S05_BOARD_1280.png` | Board at 1280px (contained scroll, readable columns) |
| `B3_S06_TODAY_PLANNED_COLLAPSED.png` / `_EXPANDED.png` | Workpad "이 날짜 예정" projection collapsed / expanded |
| `B3_S06_TASKREFERENCE_META.png` | TaskReference meta line: Project · Phase · 높음 · 마감 1.20 |
| `B3_COMPLETED_ACROSS_VIEWS_BOARD.png` | Linked Workpad completion reflected on the board (both placements done) |
| `B3_PREVIOUS_STATUS_RESTORED.png` | After unchecking in Workpad, All To-dos / S10 shows 진행 중 (previousStatus restored) |
