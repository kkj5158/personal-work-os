# WORK FLOW V1 - final stabilization evidence (2026-09-28)

Classification: **Implementation Evidence (central integration)**. These are not Final UI References; the design references are S01–S10 / S02A / S07A in the Drive UIREF assets.

**How it was captured**

- Headless Chromium at 1600×940, against an isolated integration runtime:
  - `next start` on `localhost:3001`
  - the integrated dev-profile backend on `127.0.0.1:18280`
  - the shared DEV database (Flyway V63, no WORK FLOW migration)
- The integrated revision is `integration/workflow-v1-b4-b5-stabilization`: Batch 4 `7393f62` + Batch 5 `34bb40a` + fix `06bc444` on dev `d1dd261`.
- All data shown is `[QA-B6]` fixtures in Feb 2099, removed afterwards with zero residue.
- Rows such as `WF QA Execution` / `WF QA 0914` are pre-existing DEV Projects owned by other sessions.
- S03 (create panel) evidence is in `../batch4-20260927/B4_S03_CREATE_PANEL.png`.

| File | Shows |
| --- | --- |
| `FINAL_S01_PROJECTS.png` | S01 Projects list |
| `FINAL_S02_PROJECT_DETAIL.png` | S02 detail with the canonical Task under its Phase |
| `FINAL_S04_THIS_WEEK.png` | S04 This Week (week 2099-02-02), canonical Task 진행 중 after Waiting resume |
| `FINAL_S05_WEEKDAY_BOARD.png` | S05 board: the same Task on its Wed and Fri plan days |
| `FINAL_S06_WORKPAD.png` | S06 Workpad date 2099-02-04 showing the planned Task |
| `FINAL_S07_ALL_TODOS_WITH_S10.png` | S07 search + 마감 가까운 순 (deadlineDate order), S10 open beside it |
| `FINAL_S08_WAITING.png` | S08 with a title-only ready item and a 확인 표시 flagged item |
| `FINAL_S09_TIMELINE_QUARTER.png` | S09 Quarter right after a real pointer drag moved only the Build Phase bar |
| `FINAL_S09_TIMELINE_MONTH.png` | S09 Month after a real mouse drag moved one plan day (02-06 → 02-10); deadline 02-25 fixed |
| `FINAL_S10_TASK_DETAIL.png` | S10 opened from a Timeline plan marker |
