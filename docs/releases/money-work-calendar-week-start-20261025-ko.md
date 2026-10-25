# MONEY SYS 근무 달력 주 시작 선택 · 운영 배포 보고서

2026-10-25 (Asia/Seoul) · 구현/DEV/PROD/실제 브라우저 검증 완료

## 구현 결과

알바 근무 달력 헤더의 근무지·근무 상태 필터 옆에 `주 시작` 선택을 추가했다. 선택지는 `일요일 시작`과 `월요일 시작`이며 저장값이 없는 계정은 기존 일요일 배치로 시작한다. 선택 즉시 요일과 날짜 행을 재배치하고 현재 월·필터·선택 날짜·열린 편집 초안을 유지한다.

표시 주와 정산 주는 독립이다. 기존 일–토 API 정산을 종료일이 포함된 표시 행에 한 번만 배치한다. 월요일 표시 첫 행 `2026-09-28–10-04`에는 원래 `2026-09-27–10-03` 정산을 표시하고 두 합계 열에 실제 정산 기간을 붙인다. 특근·주휴수당은 분배하거나 중복 가산하지 않는다. 근무지별 내역과 원래 정산 시작일을 사용한 상세 열기도 유지한다.

기존 API가 전체 실제 정산 기간을 집계한다. 필요한 이전/다음 월 응답을 기존 GET으로 보완해 월요일 격자의 경계 날짜와 보관 기록을 확보한다. 기록은 UUID, 정산은 근무지/시작/종료로 중복 제거한다. 경계 조회 실패·미완료 시 추가 경계 날짜의 신규 편집을 잠시 막고 재시도를 제공한다. 새로운 API 인자나 쓰기는 없다.

월 KPI는 기존 선택 월의 API summary를, 아래 주별 비교는 기존 선택 월의 정산 목록을 유지한다. 표시 행에 종료일이 들어오지 않는 정산은 아래 표에서 계속 확인한다. 따라서 월에 따라 표시 격자에 들어오는 기간은 달라질 수 있지만 원래 월별 비교 기준이나 정산 금액을 바꾸지 않는다. 현재 도메인의 모든 근무지는 일–토 정산이다. 별도의 근무지별 정산 요일 설정은 이번 기능에서 만들지 않았다.

설정은 `money:work-calendar:week-start:v1:<계정 ID>` 키의 브라우저 localStorage에 enum만 저장한다. 계정별로 분리되며 새로고침과 세션 갱신 후 유지된다. **기기·브라우저 간 동기화는 제공하지 않는다.** 저장 차단 시 현재 페이지 메모리에서만 유지한다. 금융 기록·인증 정보는 저장하지 않는다. 운영 검증 후 화면 선택은 기본 일요일로 돌려두었다.

## 변경 파일

|경로|변경|
|---|---|
|`frontend/app/money/MoneyCalendar.tsx`|헤더 선택, 경계 GET 병합, 종료일 기준 배치와 실제 기간 표시|
|`frontend/lib/money/workCalendarDisplay.ts`|날짜·표시 행·경계 조회·병합·설정 키 순수 함수|
|`frontend/app/money/useWorkCalendarWeekStart.ts`|계정별 표시 설정 저장과 구독|
|`frontend/lib/money/cache.ts`|기존 세션 scope에서 계정 식별자만 읽는 getter|
|`frontend/app/money/money-calendar.css`|기존 디자인 토큰을 쓰는 합계 열 컨테이너|
|`frontend/lib/money/workCalendarDisplay.test.ts`|경계·금액 불변·복수 기간·계정 분리 테스트|
|`frontend/app/money/MoneyCalendarWeekStart.test.tsx`|실제 React 컴포넌트 전환·필터·편집기·설정 회귀|
|`frontend/package.json`|기존 달력 검증 명령에 신규 테스트 포함|
|`docs/contracts/money-part-time-calendar-v1.md`|표시 설정과 정산 분리 계약 기록|

backend, migration, 기존 금액 함수, Android API handoff와 dependency lockfile에는 변경이 없다.

## 검증 결과

- `npm --prefix frontend run test:money-calendar`: DEV 및 좁은 PROD 후보 각각 **78/78 PASS**, skip/fail 0. 기존 72개와 신규 6개를 포함한다.
- frontend 디렉터리에서 변경 TypeScript 파일에 `npx eslint ...`, `npx next typegen`, `npx tsc --noEmit`: PASS.
- `npm --prefix frontend run build`: DEV 기준과 PROD 후보 각각 PASS. 운영 Railway 빌드도 SUCCESS.
- backend에서 `./gradlew.bat test --tests com.kafka.backend.money.MoneyCalendarTest --tests com.kafka.backend.money.MoneyCalendarSecurityTest --no-daemon`: **13/13 PASS**. 이번에 실행한 금액·권한 회귀이며 전체 backend/격리 PostgreSQL suite를 재실행했다는 의미는 아니다.
- 결정적 합성 fixture의 `09.27–10.03` 정산은 양 모드 모두 확정 일급 102000 + 특근 10000 + 주휴 20000 = 132000원이다. 인센 5000, 공제 원본 3000, 입금 완료 marker와 revision도 반복 전환 전후 동일하다. 실제 사용자 기록은 fixture로 수정하지 않았다.
- 단위 검증: 4/5/6행, 윤년 2월29일, 일·월·토와 인접 월 날짜, 빈 주, 보관 근무지, 복수 종료 기간, 중복 병합, invalid/차단된 storage, 세션 변경 및 계정 간 분리.
- React 검증: 0/1/N 기록 경로를 기존 suite와 함께 확인했다. 인접 11월1일 편집, 같은 날짜 N개 목록, 열린 편집기 동일성, 상태 필터, 월 KPI/주별 비교 및 금액 불변, reload에 해당하는 remount와 계정 변경, 금액 쓰기 0을 확인했다.
- 실제 TEAM KAFKA Chrome DEV: 두 모드 4회 전환, 10월 경계, 설정 reload, 신규 편집기 열기/취소, 11월 6행 탐색, 근무지 필터 보존 PASS. DEV의 현재 달 조회는 기록 0건이므로 비영 금액은 합성 fixture와 아래 운영 읽기 비교로 구분해 검증했다.
- 실제 운영 Chrome: 근무 기록 **29건**, 정산 **5개**를 읽고 두 모드 4회 전환 시 월 KPI·아래 비교표·각 주급·공통 날짜의 근무/입금 표시 동일 PASS. 기존 기록 편집기 열기/취소, 새로고침 후 MONDAY 보존 PASS. 운영 기록을 저장·수정하지 않았다.
- DEV/PROD 모두 1440/1024/768px에서 날짜·주급·상세 열의 y좌표 일치, 페이지 가로 overflow 없음 PASS. 기존 표 내부 가로 스크롤은 유지한다. 1600px 실제 화면 캡처도 육안 확인했다.
- 운영 검증 중 달력 쓰기 요청 0, uncaught page error 0, 관측 HTTP 5xx 0. 최초 브라우저 검증의 DOM 준비/응답 대기 오류는 대기 경계를 수정해 재실행했으며 제품 PASS와 구분했다. 최초 추가 테스트의 루트 디렉터리 alias 해석 실패도 frontend 작업 디렉터리에서 재실행해 통과했다.

## 배포와 현재 상태

|환경|배포 SHA|Railway 배포 ID|결과|
|---|---|---|---|
|DEV Web|`a4cb16095097a1b4f32b4877b3332b46eccff273`|`2e765009-b78e-44d3-bf1f-43998499e1a7`|SUCCESS, 실제 UI PASS|
|PROD Web|`b445b682c04df830e71a7906a0a574c52ace871c`|`835dfe3c-b493-4ea7-a217-e7231fac9113`|SUCCESS, 실제 UI PASS|

DEV: https://workflow-web-development-development.up.railway.app/money/coupang-work-calendar

PROD: https://kafka-sys.life/money/coupang-work-calendar

DEV에는 기존 Sleep 등 다른 작업이 포함돼 있다. 그 전체를 운영에 올리지 않기 위해 현재 운영 `8e0fa48` 위에 이번 패치만 cherry-pick했다. **전체 SHA는 다르지만 이번 runtime 기능 파일과 테스트 blob은 모두 동일하며 `git diff ... --exit-code` 0으로 확인했다.** package.json은 각 환경의 기존 다른 테스트 스크립트를 유지했다. PROD 후보도 독립적으로 78개 테스트와 build를 통과했다. 두 SHA는 각각 원격 dev/prod에 통합됐다. 전체 브랜치 병합 시 기존 unrelated 파일의 충돌이 확인돼 병합을 취소했으며 기존 트리를 수정하지 않았다.

PROD source pin과 실제 SUCCESS deployment metadata가 모두 b445b68로 일치한다. pending staged change는 없다. API와 인증/DB 서비스는 재배포하지 않았다. 공개 API `/actuator/health`는 UP, 운영 달력 주소 HTTP200 및 실제 인증된 달력 접근 PASS다. rollback은 실행하지 않았다.

## 데이터 보존과 복구

기존 credential-safe `qa/money-calendar-preservation.mjs`를 DEV/PROD 각각 before/after로 실행했다. 실제 `pos_dev_final` / `pos_prod_final`에서 READ ONLY transaction으로 기존 MONEY **52개 테이블**의 baseline 이전 행 수·원본 해시를 비교했고 양쪽 모두 changed=[]다. 운영의 근무29, 주간 정산2, 입금1, 거래246행을 포함한다. 원본 행 payload는 증거에 저장하지 않았다. 운영 브라우저 검증 후 최종 비교 시각은 **2026-10-25 15:31:58 KST**다.

운영 10월 API 응답 SHA-256은 배포 전후 모두 `9e397a4d231dc537c48cdcffaf8ae53f1a31033dfa03fd1e76f39e8fc9a96ccf`다. 정산 배열 digest는 `cebcba9fa4b7cf49d628fbda24490c65adc249bdfb74cb9f8577c5e9b8f2750a`로 동일하다. 해당 비교와 쓰기 요청 0, backend/migration diff 없음에 근거해 과거 급여·수당·입금·근무·원장 데이터를 변경하지 않았음을 확인했다.

문제가 발생하면 최신 prod 위에서 b445b68의 이번 표시 패치만 forward revert하고 Web만 다시 배포한다. 이후 다른 기능을 덮는 오래된 branch 강제 배포나 DB 복원·down migration은 하지 않는다. 기존 V99 multi-shift 스키마와 원본 정산은 그대로 유지한다. 이번 기능은 DB 복구를 요구하지 않는다.

## 증거와 정리

로컬 증거: `F:/artifacts/money-week-start-20261025/`의 validation.json, prod-smoke.json, 테스트/build 로그, DEV/PROD 보존 receipts와 화면 캡처. 실제 금액이 보이는 캡처는 로컬에만 유지하며 Drive에는 이 요약 보고서를 게시한다. 브라우저는 owner가 승인한 기존 TEAM 프로필과 공식 Playwright MCP만 사용했다. bootstrap의 프로세스 확인과 실제 연결/인증된 DOM 확인은 구분했다. 타인 탭·개인 프로필·새 디버깅 포트에는 접근하지 않았다.

원래 주 작업 디렉터리의 미커밋/스테이징 변경은 보존했다. 작업 완료 후 전용 managed worktree를 archive하고 두 로컬 임시 브랜치를 정리한다. 원격 임시 브랜치는 생성하지 않았으며 dev/prod는 유지한다. 보고서는 기존 09_MONEY_SYS 폴더에서 같은 제목을 검색한 뒤 신규 게시하고 connector readback으로 검증한다.
