# WORK FLOW — Project Groups + DnD polish + Workpad fixes (2026-09-28)

Classification: **Implementation Evidence (DEV)**. These screenshots are not Final UI References.

Captured with headless Chromium at 1920×1080 (the owner's wide desktop) against an isolated QA runtime:
- `next start` on `localhost:3001`
- the feature backend on `127.0.0.1:18280`
- shared DEV, after V64 was applied

The data is `[QA-GRP]` fixtures and 2099 Workpad dates. They were removed afterwards, with zero residue. The owner's DEV projects kept their relative order.

| File | Shows |
| --- | --- |
| `GRP_01_PROJECTS_GROUPS.png` | S01 with two Project Groups and the neutral 그룹 없음 projection; `+ 그룹` |
| `GRP_02_PROJECT_DRAG_FEEDBACK.png` | Real pointer drag of a Project: lifted card, dashed origin placeholder, highlighted target group |
| `GRP_03_INVALID_DROP.png` | Pointer outside every group: the overlay shows the rejection, and releasing changes nothing |
| `GRP_04_PROJECT_DETAIL_TASK_DRAG.png` | Project Detail native Task drag: faded origin row and highlighted Phase target (existing semantics) |
| `GRP_05_ALL_TODOS_DRAG_FEEDBACK.png` | All To-dos group-order drag (a view preference only), insertion indicator; sorted by 프로젝트 순서 = catalog order |
| `GRP_06_WORKPAD_NUMBERED_HEADING_TOOLBAR.png` | Workpad: Commands & formatting always visible; numbered headings `1.` / `2.`; no Block details / keyboard helper |
