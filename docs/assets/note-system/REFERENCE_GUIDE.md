# NOTE SYSTEM V1 — Final UI Reference Pack v3

이 패키지는 NOTE SYSTEM V1 구현용 최신 UI Reference Set입니다.

## 우선순위

1. 최신 텍스트 제품 정책 / 구현 프롬프트
2. 이 v3 이미지 세트
3. 이전 탐색 이미지

## 이번 v3 변경점

- 기존 저화질 crop 기반 `04`, `05`, `09`, `10`, `12`, `14`, `15`를 독립 1600×1000급 UI reference로 다시 제작했습니다.
- Reflection 관련 이미지는 최신 확정안으로 통일했습니다.
  - `01`: Daily Note 안의 Reflection card가 **Calendar Block 방식의 계획 vs 실제**를 표시합니다.
  - `09`: Reflection 추가 시 `계획 vs 실제 / 실제만 / 계획만 / Calendar 없이 회고만` 선택.
  - `10`: Reflection Snapshot을 PNG로 저장하는 것이 아니라 **구조화된 frozen snapshot data를 frontend renderer가 Calendar Blocks로 렌더링**하는 기준 화면입니다.
- System 전환과 Workspace 전환은 별도 UI입니다.
- 이전 v2의 저해상도 crop들은 이 v3에서 구현 기준으로 사용하지 않습니다.

## Reflection 구현 계약

현재 WORK_OS Calendar 구현 완료를 기다리지 않습니다.

1. NOTE SYSTEM 쪽에서 `ReflectionSnapshot` 데이터 계약을 먼저 정의합니다.
2. 초기에는 fixture/mock structured data로 Calendar Block Renderer를 구현합니다.
3. WORK_OS Calendar 구현이 완료되면 동일 계약으로 실제 snapshot producer를 연결합니다.
4. Snapshot의 Source of Truth는 이미지가 아니라 구조화 데이터입니다.
5. Snapshot은 회고 시점의 Plan + Actual 전체 데이터를 frozen state로 보존합니다.
6. Embed의 display mode만 `COMPARE / ACTUAL_ONLY / PLAN_ONLY / TEXT_ONLY`로 변경합니다.

## 파일 목록

| No. | File | Purpose |
|---|---|---|
| 00 | `00-master-ui-reference-board-v3.png` | 전체 화면 overview (확대 검토용) |
| 01 | `01-daily-note-main-reflection.png` | Daily Note + 최신 Calendar Block Reflection |
| 02 | `02-note-detail-linked-metrics.png` | 일반 Note 상세 + Pin/Tag/연결 지표 |
| 03 | `03-all-notes-pin.png` | 모든 노트 + Pin |
| 04 | `04-recent-notes.png` | 최근 방문 Note (최대 50) |
| 05 | `05-tags.png` | Tag Index + Tag별 Note |
| 06 | `06-connected-notes-metrics.png` | 연결된 노트 + V1 지표 |
| 07 | `07-pending-links.png` | 미생성 Wiki Link + Note 생성 |
| 08 | `08-graph-lite.png` | Graph Lite + 우측 Preview |
| 09 | `09-reflection-add-popover.png` | Reflection 추가 display mode 선택 |
| 10 | `10-reflection-display.png` | Calendar Block Reflection Snapshot Renderer |
| 11 | `11-rich-image-editing.png` | 이미지 resize / 1~3 row / caption / DnD |
| 12 | `12-workspace-switcher.png` | Workspace 전환 Dropdown |
| 13 | `13-workspace-settings.png` | Workspace identity / built-in module 관리 |
| 14 | `14-note-system-settings.png` | NOTE SYSTEM 공통 설정 |
| 15 | `15-global-search.png` | Ctrl/Cmd+K Workspace Search |

## Connected Notes V1 Metrics

- 연결된 고유 Note 수
- 서로 다른 날짜 등장 수
- 총 언급 횟수
- 최근 30일 연결 증가
- 마지막 연결일
- Incoming
- Outgoing

Bridge Score / Centrality / Clustering 등 고급 graph analytics는 후속 cycle.

## Image V1

- 한 row 최대 3장
- 1장: 기본 100%, 25/33/50/66/75/100% preset + 자유 resize
- 최소 폭 약 220px
- 2장 기본 50/50
- 3장 기본 33/33/33
- row 내부/간 DnD, caption optional, left/center/right
- crop/rotation/filter 제외

## 사용법

Repository에는 다음 경로로 넣는 것을 권장합니다.

```text
docs/assets/note-system/
```

Codex 구현 프롬프트에서는 위 폴더를 먼저 검토하게 하되, 이미지와 최신 텍스트 정책이 충돌하면 텍스트 정책을 우선하도록 명시하세요.
