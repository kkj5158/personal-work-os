# 수면 캘린더 복사·붙여넣기 구현 근거 — 2026-10-28

## 입력과 범위

- 주 입력: 사용자가 지정한 `수면-웹-캘린더-복붙_수정.md`. 이 문서는 기능·검증·DEV→PROD 요구사항으로 사용했다. 별도 ZIP·이전 채팅을 추가 요구사항으로 사용하지 않았다.
- 정본 정책 READ: `1PdhTAZW8S2nO9k5jEWCSdQuMBEMIzcCQxCg7L3Pr2DU`, 본문 Updated 2026-10-25 Minimal A v1.0. 현재 요청의 정상 배포 승인을 재질문하지 않는다. 플랫폼 승인은 별도다.
- 시작점: origin/dev `f2b57e835cad54dfbc9b000c3ecc804b30ccab30`. 오래된 main의 사용자 변경은 보존하고 별도 worktree를 사용한다.

## 기존 업무 Calendar에서 확인한 사실

- `frontend/app/calendar/page.tsx`: 블록 선택 → 복사 → 대상 날짜/시간 → 붙여넣기. 선택 작업 바의 복사·붙여넣기 버튼, 날짜·시간 입력이 실제 존재한다.
- `useCalendarClipboard.ts`: Ctrl/Cmd+C/V, 추가 선택·범위 선택, 복제·이동·삭제·Undo. 메모리 clipboard는 날짜 이동 후에도 유지된다. 입력 필드에서 단축키를 가로채지 않는다. leave/run/locked를 통해 미저장 입력과 중복 명령을 보호한다.
- `clipboard.ts`: `PasteTarget`의 실제 날짜/분 단위 anchor, `isCalendarTextTarget`, snapshot clone, 상대 시각 이동. date-only target은 원래 시각 유지. Actual은 같은 날 시각 쌍으로 처리하므로 밤샘 Sleep에 그대로 적용할 수 없다.
- `TimeGrid.tsx`: 복사 버퍼가 있을 때 빈 그리드 클릭이 대상 위치 선택으로 바뀐다. 날짜 헤더·날짜 입력 경로도 있다.
- backend `CalendarClipboardService` 및 `/api/calendar/clipboard/*`: WORK/PLAN/ACTUAL/GROUP 전용 snapshot·atomic paste·conflict/Undo 계약. Sleep 기록과 호환되는 형식은 아니다.

## 재사용과 수면 어댑터

- 직접 재사용: 업무 Calendar의 `isCalendarTextTarget`, `PasteTarget` 계약. 기존 수면 `draftOf/endpoint/resolve/localParts/actionBody`, `send`, scoped API, owner별 pending 저장, 동일 operation 재시도, 기존 편집·drag/resize·조회 경로.
- 별도 Sleep 어댑터는 유형·시작 instant·정확한 duration·점수·한 줄 메모만 snapshot한다. 새 UUID/revision0으로 기존 수동 생성 액션을 보낸다. 원본 ID/revision/automatic/device/audit/sync/excluded metadata를 복제하지 않는다.
- 주간 18–18의 column 표시일과 실제 시작 날짜를 구분한다. 빈 공간 클릭은 기존 `selectedInterval`/그리드 좌표 변환을 재사용하며, 전날 저녁은 실제 전날 날짜를 대상에 넣는다.
- 저장 성공 후 receipt의 새 기록을 기존 우측 편집기에 선택한다. 저장 응답 유실은 pending의 동일 request·operation으로 재시도한다. 생성 성공 전 성공 알림을 표시하지 않는다.
- 저장 전 편집 중에는 복사/붙여넣기 버튼을 비활성화하고, 단축키에는 저장·취소 안내를 표시한다. 기존 미저장 입력을 덮어쓰지 않는다.

## 명시적 차이와 보존 규칙

- 한 번에 한 수면 블록. 업무 Calendar는 다중 선택을 지원하지만, Sleep에는 여러 기록을 원자적으로 생성·부분 실패 복구하는 API가 없다. WORK batch API나 선택 엔진을 수면 도메인에 확장하지 않았다.
- 선택·복사 버퍼는 현재 수면 workspace/owner에 한정한다. 날짜·주 이동 후 유지되며 reload·owner 전환 후 복사 해제된다. 붙여넣은 서버 기록은 reload 후 유지된다.
- 시작·종료가 모두 있는 저장된 야간/낮잠만 복사한다. 미기록 시각을 합성하지 않는다.
- 미래 시각 금지, 18시간 이상 확인, 기존 서버 겹침 정책, active session 규칙을 유지한다. 새 blanket overlap 정책은 추가하지 않는다.
- 명세의 2026-10-26 23:30→10-27 06:30를 10-28 23:30→10-29 06:30로 옮기는 계산은 단위 테스트로 검증한다. 실행 시점보다 미래인 기록을 실제 서버에 저장하기 위해 규칙을 우회하지 않는다. 실제 저장 QA는 과거 날짜 합성 기록을 사용한다.
- backend/API/schema/Android/인증 변경 없음. 신규 migration 없음.

## 검증과 배포

실행 명령·정확한 SHA·실제 환경 상태·완료/미실행 검사는 최종 REPORT/HANDOFF와 로컬 증거에 기록한다. Git push, staged SHA, 로컬 browser PASS는 배포 성공과 구분한다.
