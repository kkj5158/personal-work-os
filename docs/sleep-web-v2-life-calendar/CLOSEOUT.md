# POS Sleep Web V2 + LIFE OS 통합 캘린더 실행 보고서

2026-10-13 KST. **구현과 자동 검증을 수행해 DEV 후보를 배포했다. 전체 수락 검증과 PROD 승격은 미완료다.** 필수 browser/정상 로그인 gate를 면제하지 않았으며 PROD에는 이번 변경을 올리지 않았다.

## 구현과 경로

| 경로 | 구현 |
|---|---|
| `/life/sleep` | 기본 최근 7일 주간 편집, 일별/주간/월간, 야간·낮잠 동시 표시, 원본 기록 표, 날짜별 요약, 오른쪽 inspector |
| `/life/sleep/records` | 기존 deep link 호환; 같은 통합 Sleep workspace |
| `/life/sleep/statistics` | 기록된 야간 평균과 낮잠 1회 평균, 기존 coverage/규칙성/변화/7·30일 지표 보존 |
| `/life/sleep/settings` | 기존 공유 알림 revision 저장, Android reminderDeviceId와 장치 할당 정책 보존 |
| `/life/calendar` | 별도 LIFE OS 항목, 일/주/월, 네 source 필터, source별 상세와 편집 미리보기 |

SLEEP 상위 메뉴는 Sleep/통계/설정 세 개다. Integrated Calendar는 별도 LIFE OS 메뉴다. Sleep 주간은 전일18–당일18, 통합은 00–24 KST 축을 쓴다. 월간 수치의 원본 귀속일과 실제 시간대 띠를 구분한다. 운동은 96px 이상 blue 카드, Calendar SYS는 30px의 작은 secondary 카드이며 둘 다 실제 점유 선을 유지한다. 밀집 운동은 열 폭을 넓혀 가로 스크롤로 접근한다. 드래그/양끝 resize/Shift+방향키와 직접 날짜·시각 입력은 저장 전 미리보기이고, 저장/취소와 원래 충돌 복구를 연결했다.

## 원본 소유권·실제 API

- Sleep/Nap: 원래 `sleep_sessions`/`sleep_naps`와 UUID를 사용한다. 새 `GET /api/sleep/v1/intervals?start&end&from&to`는 owner 범위의 구간 교차 및 귀속일 조회만 한다. 임의 하루 lookback 없이 긴 구간을 포함하며 원본을 분할하거나 복제하지 않는다.
- 저장: 기존 `/api/sleep/v1/actions`, `/api/sleep/v1/naps/actions`의 operationId/expectedRevision/endpoint provenance/timezone/offset/장시간 확인/idempotency/Undo 규칙을 유지한다. 손대지 않은 endpoint와 초 단위 시각을 보존한다.
- Exercise: 기존 `/api/exercise/v1/state`와 `/api/exercise/v1/mutations` SAVE를 사용한다. ID, revision, mutationId, 세트·수행값·이력·타이머·elapsedSeconds·원본 date를 유지하며 timestamp만 수정한다. 실제 시각의 달력 위치와 원래 운동 귀속일을 구분한다.
- Calendar SYS: 기존 `/api/calendar?from&to`의 실제 persisted 계획/실행/생활 상태 및 시각 미지정 원본을 사용한다. 기존 sourceId/sourceType/date를 유지한다. 통합 화면에 Calendar write API/resize/save/delete 경로가 없다. 원본 수정은 기존 `/calendar`로 이동한다.
- 확인되지 않은 정확한 요청과 초안은 기존 owner별 Web 저장소에 보관한다. 자동 덮어쓰기를 하지 않으며 명시 재시도·서버 비교·최신 revision 가져오기를 제공한다. 확인된 성공 뒤만 재조회/통계를 갱신하고 다른 Web 탭에는 owner별 invalidation 신호를 보낸다.

원본 rows의 두 번째 authoritative store, seed, mock API, source of truth로 쓰는 localStorage facts는 없다. 초안·실패 요청·비교 스냅샷만 owner별로 보관한다. Android/native/Room/outbox는 변경하지 않았다.

## Git와 주요 변경 파일

저장소: `D:/DEV_SPACE/personal-work-os-worktrees/sleep-web-v2-life-calendar`, 브랜치: `codex/sleep-web-v2-life-calendar`.

- `709b066`: Sleep Web V2, 별도 통합 캘린더, canonical read/write adapters, 구간 조회, focused regression 구현.
- `e8c8a67`: 최신 공유 dev의 기존 Attention 변경을 충돌 없이 보존하여 통합.
- `b123c59`: 최종 코드 후보. 날짜별 요약과 운동 원본 date 보존, 추가 QA·읽기 전용 감사. origin/dev에 통합했다.
- 이 보고서와 최종 배포 receipt는 후속 문서 커밋에 보관한다. 해당 문서 커밋은 application code를 바꾸지 않는다.

주요 파일: `frontend/app/life/sleep/SleepWorkspace.tsx`, `frontend/app/life/calendar/page.tsx`, `frontend/app/life/categories/page.tsx`, `frontend/components/life-calendar/{TimeCalendar,RecordSurface}.tsx`, `calendar.css`, `frontend/lib/life-calendar/model.ts`, `frontend/lib/sleep/model.ts`, `frontend/lib/globalTabs.ts`, `backend/.../sleep/{SleepController,SleepService}.java`. 관련 모델/React DOM/PostgreSQL/security 테스트와 `scripts/sleep-life-*`, `scripts/sleep-web-v2-regression.mjs`를 추가했다. 원래 메인 checkout의 사용자 staged PNG·설정·다른 작업 및 Android checkout을 수정하지 않았다.

## DB와 원본 보존

**신규 migration, 운영 schema/table 변경, backfill은 없다.** 기존 V78 Nap 계약을 재사용했다. canonical Flyway는 DEV V82, PROD V81이며 감사 전후 checksum/history가 같다.

DEV 기존 owner 범위와 PROD 전체 canonical rows를 BEGIN READ ONLY로 감사했다. 두 환경의 검사한 9개 테이블 건수와 행 digest 모두 동일하다. PROD 주수면 6건, Exercise 문서 6건, Sleep 설정 1건을 포함해 원래 facts를 보존했다. DEV Calendar SYS 계획 36건, work time 72건, supplemental 5건, life time 109건, state 10건의 실제 persisted 원본을 확인했다. 이 DB 읽기는 정상 로그인 API acceptance의 대체가 아니다.

테스트 fixture는 새 격리 QA schema에만 만들었다. HTTP fixture는 기존 domain DELETE로 정리하고 facts 0을 확인한 뒤 소유 schema만 제거했다. 작업 소유 loopback runtime만 종료했다. 실제 PROD 원본에 생성·수정·삭제 요청을 보내지 않았다.

## 자동·브라우저 QA

| 검사 | 실행 결과 |
|---|---|
| 기존 Sleep/PostgreSQL/recorder/time/security + Exercise 회귀 | 96/96, 실패·skip 0 |
| 추가 실제 Exercise controller/DB 보존·다른 owner 거부 | 2/2, 실패·skip 0 |
| 최신 dev 통합 후 집중 검사 | 29/29: Sleep 경계 2, security 3, Exercise DB 2, 기존 Attention 22 |
| 최종 frontend 모델·React DOM | 35/35, 실패·skip 0; overnight 1 ID, resize/revision/초 보존, 30/45/60/75분, dense lanes, SYS readonly, pointer/keyboard preview |
| scoped ESLint / TypeScript / Next production build / backend bootJar | 성공; lint 오류·경고 0. Next 기존 다중 lockfile 경고는 남음 |
| 실제 격리 loopback HTTP/DB | 6 checks PASS: 경계 조회, 원래 ID/endpoint/replay, 409 보존, Undo, Nap, 공유 reminder 보존 |
| hosted DEV availability/security | 11 checks PASS; health, 로그인 gate, 익명·잘못된 bearer 거부 |
| 기존 PROD availability/security baseline | 11 checks PASS; 이번 구현의 PROD smoke로 분류하지 않음 |
| 기존 별도 GlobalTabs component suite | 4/5. 기존 canonical LIFE OS 표시를 과거 LIFE CODE로 기대하는 사전 존재 assertion 1개 실패 |
| 실제 Chrome/V4 시각·responsive/browser QA | **미실행 / BLOCKED** |
| 정상 Supabase 인증 hosted DEV acceptance | **미실행 / BLOCKED** |
| 실제 Android/Web 양방향 동기화 | **미실행**; backend 계약 회귀만 확인 |

초기 테스트 작성 컴파일 타입, 좌표 부동소수점 exact equality, Exercise 숫자 node 타입 equality, 최초 기록의 기존 설정 초기화 기대를 수정하고 해당 검사를 재실행했다. application regression 실패를 감추려고 기대 동작을 바꾸지 않았다. 전체 96개를 마지막 frontend 수정 뒤 다시 실행했다고 주장하지 않는다. 해당 backend source는 동일하며 통합 후 필요한 29개를 재검증했다.

## 배포 상태

최종 application 후보는 `b123c5945ee70bb2dc10d12a5ccb8e98e2444a1b`. 동일 후보의 DEV Web/API 두 deployment가 SUCCESS다. 배포 후 공개 health·로그인 gate·익명/잘못된 bearer 거부 11개를 재확인했다.

| 환경 | Web/API URL | 이번 작업 상태 |
|---|---|---|
| DEV | [DEV Sleep](https://workflow-web-development-development.up.railway.app/life/sleep) · [통합 캘린더](https://workflow-web-development-development.up.railway.app/life/calendar) | Web receipt `383bb105-c212-4852-96cd-6252815e9ff6` |
| DEV API | [DEV API](https://workflow-api-development-development.up.railway.app/actuator/health) | API receipt `e410c2d8-8ad0-4347-9fe2-a9bbbfd11476` |
| PROD | [현재 PROD Sleep](https://personal-work-os-frontend-prod-production.up.railway.app/life/sleep) | **이번 후보 승격 없음**. 기존 `dfad5ad` 유지 |
| PROD API | [현재 PROD API](https://personal-work-os-prod-production.up.railway.app/actuator/health) | 기존 `dfad5ad`, 이번 작업 재배포 없음 |

정상 인증된 DEV UI/원본 API acceptance와 필수 browser gate가 통과하지 않아 PROD 브랜치·서비스를 변경하지 않았다. PROD smoke를 수행했다고 주장하지 않는다.

## 남은 blocker·V4 차이

1. owner Chrome 정책은 TEAM KAFKA의 별도 normal/ungrouped 창 소유권과 groupId 검증을 요구한다. 프로필은 프로세스 인자와 extension storage의 정확한 instance ID로 확인했지만, 현재 API에는 창 지정·소유권/groupId 확인이 없고 세션 설정의 그룹 동작을 비활성화할 수 없다. 정책에 따라 browser control을 중단했다. 개인 Chrome, 다른 사용자 창/탭/그룹은 제어하지 않았다.
2. 1366/1600/1024/390px light/dark 및 실제 drag/resize/dense/mobile/focus/시각 일치 캡처가 필요하다. React DOM 검사는 브라우저 시각 QA가 아니다. V4와 pixel/시각 일치가 검증됐다고 주장하지 않는다.
3. 정상 로그인 DEV acceptance, 실제 Android 동기화, PROD 승격 후 인증 smoke가 남아 있다. 서비스 토큰·가짜 JWT·DB 직접 읽기로 acceptance를 대체하지 않았다.
4. 기존 Exercise에는 계획 시작/종료 필드와 Web 원본 편집 경로가 없다. 계획은 시각 미지정 목록, 진행 중은 readonly이며 완료 구간만 수정한다. 이를 해결하기 위해 Android 계약을 임의 확장하거나 계획 시간을 생성하지 않았다.
5. 기존 통계 7·30일 계약, 영구 삭제/no-delete-Undo, Android의 실제 추천/알림·기기 할당을 유지한다. 목업의 14일/삭제 Undo/브라우저 후보 수집을 만들어내지 않았다.

구현 브랜치/worktree와 검증 증거는 위 미해결 QA·release gate를 재개하기 위해 유지한다. “구현·검증·PROD 전체 완료” 상태가 아니다.
