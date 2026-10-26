# MONEY 통합 가계부 수정 01–03 운영 배포 — 2026-10-27

**운영 API와 웹 배포, 인증된 운영 읽기 검증을 완료했다.** 금융 유형 독립 열, 비등록 검토 후보 분리, 대출 배분/환불 연결/수입 규칙/일괄 재시도 수정이 반영됐다.

사용자의 이번 `운영까지 배포진행` 요청을 해당 수정의 운영 배포 승인으로 적용했다. 최초 구현 때의 PROD 금지와 DEV 보류는 당시 상태이며, 이번 승인을 다른 대기 기능이나 금융 데이터 정정 승인으로 확대하지 않았다.

## 배포 소스와 실행 상태

|구분|검증한 값|
|---|---|
|운영 화면|https://kafka-sys.life/money/bookkeeping|
|운영 API|https://personal-work-os-prod-production.up.railway.app|
|실제 업로드 후보|`14a722b5873492e6f72be5b621bb8a47ec0aa27c`|
|보존 태그|`money-corrections-20261027-prod`|
|후보 기준|기존 STUDY 운영 웹 후보 `0207819` + MONEY 수정만 cherry-pick|
|원래 DEV 검증|`98d7888` — MONEY 제품 소스 동일성 확인|
|Git prod 통합|`17fddead94eb69eee8749e2bf2546cd1e6e2e0be` — 실행 archive와 구별|
|API 배포|`41ec1db1-9300-42fd-a115-f275b30f67aa` / SUCCESS, 08:31 KST|
|웹 배포|`bdf7ce04-5e01-433c-8c9d-1276a9e01051` / SUCCESS, 08:34 KST|
|production 환경|`c2c20488-311f-4b9e-9ec9-d79508123176`|
|API 서비스|`e46b58f4-e829-430f-a4c4-b27e24d46f19`|
|웹 서비스|`5818a578-b7a2-443a-aaad-ce10f6bb708c`|

기존 WORKPAD source 변경이 staged 상태여서 환경 전체 accept-deploy를 실행하지 않았다. 공식 Railway CLI 5.62.1의 프로젝트·환경·서비스 지정 source upload로 clean 후보를 API에 먼저, 성공/health 확인 후 웹에 배포했다. 기존 STUDY를 유지했으며 WORKPAD 대기 코드는 배포하지 않았다. 새 서비스·인증 설정·환경 변수·DB 설정은 만들거나 바꾸지 않았다.

CLI upload metadata에는 commitHash가 없다. 플랫폼이 SHA를 반환했다고 주장하지 않는다. clean 후보 검사·원격 태그·파일 SHA256 manifest·업로드 명령과 반환 배포 ID·성공 상태·image digest·실제 동작을 함께 증거로 남겼다. API image는 `sha256:1ad736250e30ccdeecb1947ba583ddab1ffbe55c22d49bd6020fee2cb05fa3e0`, 웹은 `sha256:9bf412f28a4f546ede336379decd3069b6c94187eddcf0ca50e9e4da8dbc5ead`다.

## 검증 결과

|검사|결과|
|---|---|
|운영 후보 백엔드|12개 클래스 131 tests PASS, 실패/오류/skip 0. 신규 소유 loopback 합성 PostgreSQL 실행·정리 PASS|
|운영 후보 프론트엔드|37 tests, 변경 파일 lint, production build/TypeScript PASS|
|기존 종단 근거|앞선 개발 단계 실제 UI/API 17개 묶음 PASS. 같은 MONEY 소스이며 이번 실행 횟수와 합산하지 않음|
|스키마/프로필|새 API runtime에서 95 migrations validated, public V100, up to date / no migration necessary, active_profile=prod / db_environment=PROD|
|Public health/auth|API health 200/UP, 비로그인 API accounts 401, 비로그인 가계부 307→로그인. 인증 우회 없음|
|API 계약|인증된 운영 일반 가계부 응답 50행 모두 financialType 포함|
|표 구조|일반/전체 거래의 금융 유형이 카테고리 바로 왼쪽 독립 열. 일시 셀 유형 버튼 0개. 1366/1920 헤더 캡처|
|등록/원시 후보 경계|배포 전 등록 50행 + 검토 전용 7행 = 57행 → 배포 후 등록 50행, 검토 전용 0행|
|검토 보존|위 7개 원시 후보가 검토 대기 4개 + 보류 3개에 모두 남아 있음을 실제 응답으로 확인|
|기존 UI|4 KPI·3 도넛 유지. 원래 분류 선택기/저장 버튼 열림·취소, 금융 유형 문맥 편집기 실거래 조회 확인. 운영 저장 버튼은 누르지 않음|
|금융 사실 보존|선택 월 전체 거래 192건 중 같은 기존 20개 ID의 주요 금융 필드 digest가 배포 전후 일치|
|주변 경로|검토 필요·분류/규칙·계좌·대출·잔액 점검·AI 작업대·STUDY 정상. 해당 읽기 시나리오 page error / HTTP 5xx 0|

20건 digest는 `8bcfe6c584dd1987823ce935f587e30a2048195e825f9e344a41f8afbe7b388a`다. id, type, meaning_state, 양쪽 계좌, 금액/통화/발생시각, version, 제외/merge 상태, 환불/대출 식별과 배분 필드를 같은 ID로 비교했다. **전체 DB 완전 무변경 감사나 모든 과거 집계의 운영 재검증은 아니다.** 실제 금융 값·계좌명·원문은 보고서에 내보내지 않았다.

대출 500000→420000+70000+10000, 배분 부분 수정/null 복귀, 환불 100000/18000, 순저축 300000와 이자 12000, 경합·재시도는 격리 합성 검증 근거를 사용했다. 운영 금융 데이터를 fixture로 바꾸지 않았다. 강한 식별 근거 없는 자동 연결과 Android 실기기는 기존 PARTIAL/NOT_TESTED 상태다.

처음에는 과거 `/review/queue` 응답을 기다려 테스트 waiter가 timeout됐다. 실제 화면의 `/ai/workbench` 경로를 확인한 뒤 검토 대기/보류 탭을 읽어 7개 보존을 검증했다. 제품 오류나 금융 쓰기 실패로 분류하지 않았다.

## 기존 대기 패치와 복구

production staged patch `2a4d8968-915d-4a49-9ba3-76188c0935f6`는 배포 전후 동일하다. 웹 예정 pin `66e32b8`, API 예정 pin `9fadeb8`을 적용·삭제·덮어쓰지 않았다.

**이 오래된 source pin을 나중에 그대로 적용하면 이번 MONEY 수정이 되돌아갈 수 있다.** 해당 기능 배포 때 MONEY와 현재 운영 STUDY를 포함하도록 후보를 재정합하고 재검증해야 한다. Git prod HEAD `17fddea`에는 이전 WORKPAD 대기 코드도 있어, 전체가 지금 실행 중이라고 보거나 그대로 배포하면 안 된다. DEV에 남아 있는 다른 작업의 승인 거절된 패치도 이번 승인으로 우회하지 않았다.

장애 시 직전 호환 소스(API `5146fa4`, 웹 `0207819`)를 검토할 수 있으나 실제 사용자 변경을 보존하고 V100을 유지해야 한다. 이전 의미 상태를 모르는 서버로 내리거나 DB rollback/금융 기록 일괄 정정은 하지 않는다. 가능하면 검증된 수정으로 전진 복구한다. 이번에 rollback은 하지 않았다.

검증 DB·프로세스와 공용 release lock은 정상 정리했다. 기존 기본 작업 사본과 대기 패치를 보존했다. 자료는 익명 집계, 헤더만 자른 실제 운영 캡처, 선별 startup 로그로 제한하며 자격증명·raw PROD 로그/DB dump·개인 금융 화면은 포함하지 않는다. 증거는 `money-corrections-prod-20261027/evidence`에 보존하고, 기존 Google Drive 구현 보고서와 같은 MONEY 폴더에 배포 보고서·증거 패키지를 게시한다.
