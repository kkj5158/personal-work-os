# WORK FLOW V1 - Batch 4 Projects worker evidence (2026-09-27)

Classification: **Implementation Evidence (worker, pre-integration)**. These are not Final UI References; the design references are S01 / S02 / S02A / S03 in the Drive UIREF assets.

Captured with headless Chromium at 1600×940 against a short-lived validation runtime:

- `next start` on `localhost:3001`
- a dev-profile backend built from `feat/workflow-v1-b4-projects`, on `127.0.0.1:18280`
- the shared DEV database, with no migration applied

Edits used a `[QA-B4] Project`, removed afterwards. The Workpad reference for 최근 기록 used the fixture date 2099-01-05. Central integration will capture the canonical set.

| File | Shows |
| --- | --- |
| `B4_S01_PROJECTS_LIST.png` | S01 wide rows: goal, 이어갈 작업, 이번 주, progress basis, status; 준비/진행/보류/완료 + 보관됨 filters |
| `B4_S03_CREATE_PANEL.png` | S03 non-modal create panel: name, type 개발, 기본 작업 묶음 25×4 |
| `B4_S02_WEIGHTS.png` | Inline weights editor: Phase weight, automatic vs manual progress, basis |
| `B4_S02_PROJECT_DETAIL.png` | S02: goal / resume / latest Workpad record, This Week projection, 미분류-first hierarchy, resources + 최근 기록 rail |
| `B4_S02_WITH_S10.png` | Shared S10 opened from a Project row in the non-modal split |
