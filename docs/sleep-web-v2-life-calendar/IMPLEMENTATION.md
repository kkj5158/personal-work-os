# Sleep Web V2 / LIFE OS 통합 캘린더 구현 후보

2026-10-13 KST. 기준 `b8443eb`; 격리 브랜치 `codex/sleep-web-v2-life-calendar`. 최종 배포·gate 상태는 CLOSEOUT.md에 기록한다. **브라우저·정상 로그인 DEV 수락 검사 전이며 PROD 승인 gate를 통과했다고 주장하지 않는다.**

## 경로와 구현

- `/life/sleep`: 최근 7일 주간 편집 기본, 일별/주간/월간, 야간·낮잠 동시 표시, 원본 기록 표와 오른쪽 inspector. 기존 `/life/sleep/records` deep link도 같은 workspace를 연다.
- `/life/sleep/statistics`: 야간 평균·낮잠 1회 평균을 첫 지표로 표시하고 기존 coverage/시각 규칙성/변화/7·30일 계약을 유지한다.
- `/life/sleep/settings`: 기존 revision 기반 공유 알림 설정과 Android 알림 장치 할당을 보존한다.
- `/life/calendar`: SLEEP의 세 메뉴와 별도 LIFE OS 항목. 일/주/월, Sleep/Nap/Workout/Calendar SYS 필터, 원본 귀속일과 KST 실제 구간을 구분한다.
- Calendar SYS는 30px의 secondary 카드와 전체 실제 점유 선, 원본 상세/기존 `/calendar` 이동만 제공한다. 계획/실행/상태 및 시각 미지정 항목은 실제 서버 데이터로만 구성한다.
- 운동 카드는 최소 96px. 실제 점유 선과 resize 종료 지점은 원래 분 단위를 사용한다. 표시 높이까지 포함해 충돌 lane을 계산하고, 밀집 운동은 가로 스크롤 가능한 열을 넓혀 읽기와 다른 기록 접근을 유지한다.
- 모든 시간 이동/양끝 조절은 미리보기이며 명시 저장한다. Shift+방향키, resize 키보드와 날짜/시각 입력을 제공한다. 취소는 로컬 미리보기만 버린다.

## 원본과 API

| 원본 | 조회 | 수정 | 경계 |
|---|---|---|---|
| Sleep | 기존 today/metrics/settings/detail + 새 `GET /api/sleep/v1/intervals` | 기존 `POST /api/sleep/v1/actions` | 기존 UUID/revision/actionType/operationId/Undo |
| Nap | 동일 intervals + 기존 nap detail/summary | 기존 `POST /api/sleep/v1/naps/actions` | 별도 Nap 원본 namespace, 원본 startLocalDate |
| Exercise | 기존 `GET /api/exercise/v1/state` | 기존 `POST /api/exercise/v1/mutations`, SAVE | 원래 문서 ID/expectedRevision/mutationId, 세트·수행값·타이머·이력·elapsedSeconds·원본 date 보존 |
| Calendar SYS | 기존 `GET /api/calendar?from&to` | 통합 화면에서는 호출 없음 | persisted 계획/실행/생활 상태 원본 ID/sourceType; readonly |

새 intervals는 기존 Sleep 테이블의 **구간 교차 또는 원본 귀속일**을 owner 범위에서 읽는다. 63일 이하 조회이며 원본 복제/분할/새로운 mutation API가 없다. 장기 수면에 임의 lookback을 사용하지 않는다. Calendar SYS 계획은 기존 overlap 조회, 실행/상태는 기존 backend의 같은 날짜 안 구간 계약을 따른다. naive Calendar SYS wire는 기존 AppTimeZone 계약에 따라 KST로 해석한다.

확인되지 않은 mutation 본문은 owner별 기존 draft 저장소에 operationId/mutationId까지 보관한다. HTTP 실패/오프라인/충돌에서 입력을 보존하고 명시 재시도·서버 비교·최신 revision 가져오기를 제공한다. 성공 응답을 검증한 뒤만 조회와 통계를 갱신하며 다른 Web 탭에는 owner ID만 담은 invalidation 신호를 보낸다. 저장된 날짜/초 단위 시각·수정하지 않은 endpoint의 provenance/timezone/offset을 보존한다. localStorage는 초안/기존 Web 장치 ID용이며 source facts/demo store가 아니다.

## 확인된 차이와 미해결 gate

- 원래 Exercise SESSION에는 `startedAt`/`finishedAt`와 세트 수행값이 있지만 계획 시작/종료 필드가 없다. 시각 없는 계획은 목록으로 표시하고 시간을 생성하지 않는다. 진행 중 운동도 완료 구간 편집을 제공하지 않는다. 기존 Exercise Web 원본 경로가 없어 원본 Android 앱 안내를 표시한다.
- 기존 통계 API는 7·30일만 지원한다. 목업의 14일을 가짜 server metric으로 만들지 않는다.
- 기존 Web 삭제는 영구 삭제이며 Undo가 없다. 기존 주수면 수정 Undo를 유지한다. Android/outbox/room/네이티브 소스는 변경하지 않았다.
- V4의 624px 수면 축, 보라/녹색 구간, inspector, 96px blue workout/30px SYS 계층을 구현했다. 밀집 기록은 가로 스크롤을 넓힌다. 실제 1366/1600/1024/390px light/dark 캡처와 시각 비교는 **미실행**이다.
- TEAM KAFKA 프로필은 Chrome 프로세스 인자와 확장 storage의 instance ID exact-match로 확인했다. 현재 브라우저 API에는 전용 창 지정/소유권·groupId 검증이 없다. 세션 설정의 그룹 생성 여부도 비활성화할 수 없다. owner-wide Chrome 정책에 따라 창/탭을 제어하지 않았다. 개인 Chrome/기존 탭/그룹은 조작하지 않았다.
- 정상 Supabase 세션을 통한 hosted DEV 수락·Web↔실제 Android 동기화·PROD 인증 smoke는 미실행이다. 로컬 fixed-owner DEV 테스트나 DB 직접 읽기를 정상 로그인 acceptance로 바꾸어 표기하지 않는다.

## 검증과 DB

회귀 96/96, 추가 Exercise 영속성 2/2, 추가 새 경로 포함 production security 3/3, frontend 35/35, 타입 검사와 production build, scoped lint 오류/경고 0을 확인했다. 로컬 HTTP 6 checks는 실제 PostgreSQL의 새 격리 schema에서 canonical overnight/read/action/replay/409/Undo/nap/shared reminders를 검사했다. 각 로그와 구조화 결과는 evidence에 있다.

초기 테스트 작성의 컴파일 타입 오류, CSS 좌표 부동소수점 exact equality, Exercise LongNode/IntNode equality와 최초 기록 설정 초기화 단언은 시험 도구를 고친 뒤 재실행했다. 별도 기존 GlobalTabs component suite는 4/5로, 한 테스트가 이미 변경된 LIFE OS 표시를 예전 LIFE CODE로 기대한다. 해당 사전 존재 실패를 숨기거나 관련 없는 production 동작을 고치지 않았다.

신규 migration/authoritative table/원본 backfill은 없다. DEV는 기존 owner 범위, PROD는 전체 canonical 행의 건수/digest와 Flyway 이력을 **BEGIN READ ONLY**로 검사한다. 테스트의 fixture는 새 격리 schema에만 쓴다. 실제 PROD 사실에 synthetic writes를 하지 않는다.
