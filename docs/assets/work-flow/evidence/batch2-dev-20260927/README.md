# WORK FLOW V1 Batch 2 — shared DEV implementation evidence (2026-09-27)

Classification: **Implementation Evidence** (not Final UI Reference). Final UI references remain `S10_TASK_DETAIL_SPLIT_FINAL.png` / `S06_WORKPAD_BASE_REFERENCE.png` in the Drive UIREF assets.

Captured with headless Chromium (1600×940) against the owner-accessible DEV runtime: `next dev` frontend on `localhost:3000`, dev-profile backend on `127.0.0.1:8280`, **shared DEV Supabase database at Flyway v61** (`V61__work_flow_v1_core.sql`). Edits were made only to `[QA-B2]` fixture rows; other rows shown are existing DEV data.

| File | Shows |
| --- | --- |
| `B2_DEV_S10_TASK_DETAIL.png` | All To-dos with the non-modal S10 split panel open (no overlay, list interactive) |
| `B2_DEV_S10_MULTI_TASK_SWITCH.png` | Panel content after rapidly switching Tasks from the list |
| `B2_DEV_S10_WAITING.png` | WAITING context fields, multiple plan dates, semantic deadline, autosave state |
| `B2_DEV_S10_CONFLICT.png` | Stale second window: same-field conflict, draft preserved, "최신 값 사용" |
| `B2_DEV_WORKPAD_REGRESSION.png` | Workpad continuous date stream with a TaskReference and the three-mode Dock |

The earlier local-only evidence stays in `../batch2-20260927/`.
