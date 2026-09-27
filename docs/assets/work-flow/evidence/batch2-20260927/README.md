# WORK FLOW V1 Batch 2 — Implementation Evidence (2026-09-27)

Classification: **Implementation Evidence**. These images are not Final UI References; the Final UI References are the S01–S10 images in the Drive folder `90_UIREF_ASSETS__WORK_FLOW_V1_20260926`.

Captured with headless Chromium (1672×941) from branch `claude/pos-workflow-v1-audit-ya27xc`. The runtime was a production `next build`/`next start` frontend and a dev-profile backend. The database was a **disposable local PostgreSQL 16**, migrated by Flyway from empty through V60. Shared DEV was not used and not reachable from the implementing environment. All data shown is synthetic seed data.

| File | Shows |
| --- | --- |
| `S10_IMPL_TODO_SPLIT_20260927.png` | All To-dos with the non-modal S10 split: project context, heading title, Add to Today, field grid (project, status, priority, work group, multiple plan dates, real deadline), This Week toggle, plain memo, linked resources and recent Workpad record. The detail was restored from `?task=`. |
| `S10_IMPL_WAITING_FIELDS_20260927.png` | After the list filter was applied and another row was clicked: the swapped detail with status set to WAITING and the conditional waiting fields, autosaved ("저장됨"). |
| `S10_IMPL_FOOTER_ACTIONS_20260927.png` | The detail pane scrolled on its own: explicit Delete / Duplicate / Archive actions and no Save button. |
| `WEEK_FOUNDATION_IMPL_20260927.png` | `/workflow/week` foundation: the week projection keeps "집중 선택" (selected) and "날짜 배치" (planned only) distinct, and S10 shows the This Week toggle on. |
| `WAITING_FOUNDATION_IMPL_20260927.png` | `/workflow/waiting` foundation: the "ready to check" projection vs remaining waiting tasks. |
| `WORKPAD_REGRESSION_20260927.png` | The unchanged Workpad editor with the TaskReference created by Add to Today and a record under it. |
