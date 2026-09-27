# WORK FLOW V1 - Batch 2 owner-feedback hotfix evidence (2026-09-27)

Classification: **Implementation Evidence**, not Final UI Reference. The design references are S02A / S07A in the Drive UIREF assets. The owner problem-state screenshots (FB01-FB06) live in Drive folder 92.

Captured with headless Chromium on the owner-accessible DEV runtime: `next dev` on `localhost:3000` against the dev-profile backend on `127.0.0.1:8280`, using the shared DEV database at Flyway v61, dev `bb8491c`. Edits touched only `[QA-B2H]` fixture rows, which were removed afterwards. The other rows are existing DEV data.

| File | Shows |
| --- | --- |
| `B2H_PROJECT_HIERARCHY.png` | Project Detail: `미분류 작업` first, Phase header bands, indented rows (HOTFIX-03/04) |
| `B2H_PROJECT_S10_1600.png` | Project-hosted S10 at 1600px, 2-column property grid (HOTFIX-01) |
| `B2H_PROJECT_S10_1280.png` | Project-hosted S10 at 1280px, 1-column grid, two-line rows, selected row (HOTFIX-01/02) |
| `B2H_TODOS_GROUPS.png` | All To-dos Project group bands, `프로젝트 없음` neutral group (HOTFIX-05) |
| `B2H_TODOS_INLINE_CONTROLS.png` | Inline Project / work group / status / priority / plan-date popover / deadline (HOTFIX-08) |
| `B2H_S10_SECTIONS.png` | Sectioned S10 in All To-dos after autosave (HOTFIX-06/07) |
| `B2H_S10_WAITING.png` | WAITING section shown only for WAITING (HOTFIX-06) |
