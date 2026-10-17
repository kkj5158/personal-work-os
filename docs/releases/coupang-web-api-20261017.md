# 쿠팡 근무 달력 Web · 공유 API — Task 1

작성일: 2026-10-17 KST. 구현·DEV 배포 완료, 인증 브라우저 검증 일부 완료. **`WEB_API_READY` 미선언**. Android 구현과 PROD 배포는 하지 않았다.

## 감사 기준선

- 승인 실행 명세: `01_COUPANG_WEB_BACKEND_IMPLEMENTATION_20261017.md`와 `Coupang_Work_Confirmed_Handoff_20261017.zip`. 최신 사용자 지시인 양수 일급 입력 시 미저장 입금 ON, 수동 OFF 우선 규칙을 적용한다.
- 원격 DEV 및 실제 성공 배포 Web/API: `b389c1440dc102c53ed39e02de0dbd51e2402e8b`.
- 원격 PROD 및 실제 성공 배포 Web/API: `6830c5bfaa16a942ccae773ddc1e6040d372f23c`.
- DEV API 배포 `cdbcfb0e-d34a-4d96-bd73-2b8f69af5c38`, Web 배포 `217d3044-b1d3-4c65-8769-437cc12964b7`. Railway 소스는 `dev` 브랜치이고 대기 중인 설정 변경은 없었다.
- PROD API 배포 `77964206-b7e8-4cb5-873e-17c5a60be7f2`, Web 배포 `ef1c672e-4901-4c84-8ed1-4b0ce446304e`. 소스는 별도 `prod` 브랜치이다. 이 작업에서 변경하지 않는다.
- DEV 시작 로그: PostgreSQL 17.11, `pos_dev_final`, Flyway public V87, up-to-date. 이 작업은 새 마이그레이션을 추가하거나 기존 마이그레이션을 수정하지 않는다.
- 로컬 기존 기본 작업본은 `D:/DEV_Space/personal-work-os`, 오래된 `main`의 `bcf12c518f2c953578b31f2e67d1e2e88bbfc74d`. 기존 `.claude/settings.local.json`, `frontend/package-lock.json` 수정과 미추적 `AGENTS.md`를 보존하고 별도 워크트리를 사용했다. 열린 원격 PR 검색 결과는 0건이었다.
- 이 작업 팀 외의 관련 로컬 활성 구현 작업은 확인되지 않았다. 설정된 주 데스크톱 SSH는 연결 timeout으로 그 호스트의 미커밋 워크트리를 직접 감사하지 못했다. 원격 dev를 통합 직전에 다시 확인한다.

## 구현 계약

기존 `/earnings-records/{id}`를 `contractVersion:4`로 하위 호환 확장한다. 미확정 null 저장, 서버 프리셋 버전 검증·예상액 스냅샷, 날짜 없는 입금 상태·정정 이력을 기존 work JSONB에 원자적으로 저장한다. 기존 V2/V3와 FIX-001/002, 일–토 주급 및 포함 인센 규칙을 유지한다. 기존 payment 배열 교체 함수를 새 입금 토글에서 호출하지 않으며 금융 원장·WORK OS 근태를 생성하지 않는다.

Web은 날짜를 한 번 선택해 편집 대화상자/좁은 화면 시트를 연다. 완료 근무는 확정 일급과 입금 토글을 우선 표시한다. 유효한 양수 일급의 직접 입력 이벤트에만 미저장 ON을 적용하며 수동 OFF는 같은 편집 세션에서 유지한다. 서버 저장 성공값으로 초안과 합계를 갱신한다.

정확한 DTO·인증·오류·예제·호환·안전한 테스트 데이터 정리는 [ANDROID_API_HANDOFF.md](../../ANDROID_API_HANDOFF.md)에 있다.

## 검증 상태

감사 기준선의 기존 frontend `npm run test:money-calendar`: 64/64 PASS. 이는 변경 전 회귀 기준선이며 새 동작의 검증 수치와 합산하지 않는다.

현재 DEV 접근 확인: health 200, JWT 없는 templates 요청 401, DEV 공개 JWKS 200. Chrome의 실제 인증 세션으로 근무 달력 읽기 및 월·주 요약 표시를 확인했다. 변경 후 저장·재조회와 아래 인수 검증 결과는 완료 후 기록한다.

별도 DEV API 토큰/DB 환경 파일은 없으며 연결 도구의 Railway OAuth는 변수 이름만 제공한다. 실제 운영 데이터의 DB 전체 해시 비교를 실행했다고 주장하지 않는다. 실제 DB 접속 없이 로컬 PostgreSQL 전용 인스턴스와 합성 owner/schema에서 payment `ctid`·JSON 원행 보존 및 원장 비생성 회귀를 검증한다.

## 남은 완료 게이트

- 실제 390px 시트에서 성공 저장·재조회. viewport 적용이 다른 탭에 이루어져 `dev-narrow-save.png`는 데스크톱 저장 증거이며 좁은 화면 성공 저장 증거로 계산하지 않는다. 390×844, dialog width390은 별도 충돌 탭 DOM에서 확인했다.
- 더 넓은 MONEY 메뉴·분류·필터 실제 브라우저 회귀. 계좌/분류 초기 읽기 200 및 관련 자동 테스트는 확인했으나 전체 메뉴 smoke로 확대 주장하지 않는다.
- 테스트 fixture 정리 및 OFF/CANCELLED/삭제 흐름의 hosted DEV 재검증. 로컬 PostgreSQL 테스트는 통과했지만 DEV fixture는 아래와 같이 남았다.
- 불확실 응답 뒤 동일 요청 재생은 실제 PostgreSQL에서 통과했으나 hosted DEV의 별도 bearer 클라이언트 재생 테스트는 실행하지 못했다.
- A16 Android↔Web, A17 Android 기기 검증은 Task 2 게이트로 유지.

`WEB_API_READY`: **아직 아님**.

## 완료된 변경 후 검증

- backend `b27e6fac6caf4991b55d373a4194f9d2c4d0f39a`: Calendar **56/56**, 실패0·skip0. companion8, earnings15, pay9, legacy11, security7, unit6. `bootJar` PASS.
- frontend `923dea651628e9387a10b6fef031eaed80e39ad0`: 전체 Calendar **65/65**, 집중 editor/draft/receipt13/13, Next typegen·TypeScript·수정 파일 ESLint PASS.
- 통합 구현 `96f454364216d492f27e1545d2ad6087cfc8fc44`: production frontend build PASS. 변경 충돌 없이 dev에 통합했다.
- 위 SHA의 DEV Web `cb116ec0-fec1-4a61-aaca-bf4da2c281e0`, API `88f882a3-4b95-40b5-97fc-047cd00a28a1` 모두 SUCCESS. 새 backend 시작 로그도 V87/up-to-date/no migration이다.
- 실제 인증 Chrome과 Railway HTTP 로그를 대조했다. templates GET/PUT200, earnings-calendar GET200, earnings-records PUT200·GET200, earnings-weeks GET/PUT200. 무인증 calendar GET401. 프리셋 stale PUT409와 동시 편집 PUT409를 실제 DEV에서 확인했다. 로그에는 요청 본문·토큰을 저장하지 않았다.
- A01: 날짜 한 번→근무 편집 modal. 열기 전후 배경 달력 폭1520px 유지. 기존 모달/focus 코드를 재사용했다.
- A02/A03/A07: null 완료/예정 저장과 42,140/38,410/84,280원 실제 영속화·월 새로고침. 미래 예정에서 양수 입력은 SCHEDULED/미입금 유지.
- A04/A05/A06: 템플릿42,140→43,000 변경 후 메모 저장은 옛42,140 유지. 명시 재적용만43,000 반영. 새 초안 stale409 후 메모·42,140 유지, 목록 새로고침만으로 변경되지 않고 재적용 후43,000 저장.
- A08/A09/A10/A19: 38,410/포함 인센2,000 입력은 미저장 ON. 수동 OFF 후38411→38410 재입력에도 OFF 유지·저장·재열기 확인. 다음 세션 입력 ON 저장·재조회. paid40,000 정정 안내 및 이전38,410 확인 이력 보존. OFF 저장 시 wage38,410 유지. 단순 재열기는 자동 ON 없음.
- A11: 두 편집 세션 중 한쪽만 저장. 다른 쪽409에서 메모 초안 유지, 서버 값 비교로 승자 메모 확인. 초안 교체 확인창에서 이후 자동화가 종료됐다.
- A12/A14: 확정 일급112,970 + 특근10,000 + 주휴15,000 = **137,970**. 인센 포함내역2,000 별도 재가산 없음. 입금 완료 근무월 합계38,410→40,000→0 표시, 주급 산식 불변.
- A13: 오늘 COMPLETED/null 저장 후 `오늘 일급 확인` 표시, 연체 표현 없음. 나머지 KST·상태 적격성은 기존 predicate와 자동 테스트로 확인.
- A15: 전용 loopback PostgreSQL18에서 복수 dated payment의 ctid·JSON 원행을 ON→paid금액 정정→OFF 매 단계 비교해 불변. V2 예외·V3·과거 스냅샷 보존, 금융 원장0건. 실제 PROD/기존 사용자 근무를 수정하지 않았다. 실제 DEV 전체 DB hash 비교는 자격 증명 부재로 미수행.

## 브라우저 중단과 보존된 검증 데이터

Windows 브라우저 확인창에서 도구 timeout이 발생했다. 복구용 `computer-use` helper는 현재 브라우저 URL을 정책 적용에 충분한 확신으로 확인할 수 없다고 보고하고 이 턴의 Computer Use를 종료했다. 이후 UI 입력을 중단했으며 보안·인증을 우회하지 않았다. 확인창 또는 미저장 합성 초안이 Chrome에 남을 수 있다.

DEV에 남은 합성 기록(원래 빈 날짜만 사용):

| 날짜 | UUID | 마지막 성공 version |
| --- | --- | --- |
| 2026-10-14 | af60badc-3254-4edc-a05a-84e19f93baf0 | 8 |
| 2026-10-15 | 2007f2c5-fd80-4f80-be8f-abf766edaecd | 2 |
| 2026-10-16 | 4a562239-e6b0-4244-ae74-b72d5954c42a | 1 |
| 2026-10-17 | eb7a2a34-f162-43c0-9407-962c0e79b91e | 1 |
| 2026-10-18 | 6551f277-fe64-4e92-9287-16ddd142281e | 1 |
| 2026-10-19 | 6330da53-c011-4fe4-819a-1a5e0f33bba5 | 1 |

QA 템플릿 `e5d650fb-0dd9-4b21-a057-0b64ba1852e8` version2, `9fc35d3a-152f-4037-8161-ea90f76b361b` version1. 2026-10-11 주간 정산 version1에 합성 수당10,000/15,000이 남았다. 정확한 UUID/version을 검증하는 `qa/coupang-dev-fixture-cleanup.mjs`를 제공하며 아직 실행하지 않았다. 범위 밖 데이터에 대한 일괄 DELETE/변경은 하지 않는다.

로컬 전용 PostgreSQL은 정상 종료했고 임시 scenario schema0을 확인했다. 산출물은 `D:/DEV_Space/coupang-artifacts-20261017`에 보존했다. PROD는 감사 기준선 `6830c5bf...` 배포 그대로이다.
