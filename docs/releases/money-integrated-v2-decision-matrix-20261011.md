# MONEY Integrated V2 — 결정별 구현 근거

날짜: 2026-10-11 (Asia/Seoul). 출처: 소유자가 승인한 최종 검토 패키지 `MONEY_INTEGRATED_FINAL_REVIEW_20261011`, 특히 `02_DECISION_REGISTER_001-053_KO.md`, `DECISION_051_KO.md`, `DECISIONS_052_053_KO.md`. 패키지의 예시와 합성 스크린샷은 설계 참고 자료이며, 운영 환경의 동작 증거나 추가 승인을 의미하지 않는다.

각 행의 제품 구현과 자동 계약 검증을 확인했다. 브라우저 증거는 승인된 핵심 흐름을 검증하며 모든 네트워크·키보드·동시 편집 조합을 수동으로 재현했다는 뜻은 아니다. 아래 상태는 최종 릴리스 보고서의 실제 실행 결과와 함께 읽는다. 상세 장기 통계/AI 분석은 이번 승인 범위에 포함되지 않는다.

아래 근거 약어는 저장소 경로를 가리킨다.

| 코드 | 구현 근거 |
|---|---|
| MONTH | `frontend/app/money/MoneyMonthlySummary.tsx`, `MoneyBookkeeping.tsx::SavingsLedger`, `frontend/lib/money/monthly.ts`, `backend/src/main/java/com/kafka/backend/money/MoneySavingsReadService.java` |
| HISTORY | `backend/src/main/resources/db/migration/V80__money_account_fund_group_history.sql`, `MoneyAnalysis.java`, `MoneyAccountManagementService.java`, `MoneyService.java`, `MoneyMobileService.java` |
| ACCOUNT | `frontend/app/money/MoneyAccountRevision.tsx`, `money-account-v2.css`, `frontend/lib/money/accounts.ts`, 기존 `MoneyWebViews.tsx::AccountIcon` |
| WORK | `frontend/app/money/MoneyBookkeepingRecommendations.tsx`, `MoneyBookkeeping.tsx`, `money-bookkeeping-recommendations.css`, `frontend/lib/money/workbench.ts`, `backend/src/main/java/com/kafka/backend/money/MoneyRecommendationService.java` |
| CHOICE | `backend/src/main/resources/db/migration/V81__money_classification_draft_choices.sql`, `MoneyRecommendationService.java`, `MoneyRecommendationController.java` |
| REVIEW | `frontend/app/money/MoneyNotificationReview.tsx`, `money-notification-review.css`, `backend/src/main/java/com/kafka/backend/money/MoneyReviewBatchService.java`, `MoneyReviewBatchController.java`; 기존 `MoneyAiService`, `MoneyReviewService`, 금융 명령 |
| NAV | `frontend/app/money/MoneyApp.tsx`, `MoneyFinancialViews.tsx`, `frontend/app/money/[[...view]]/page.tsx`, `frontend/lib/globalTabs.ts`, `frontend/lib/money/period.test.ts` |

계좌 구현 계약은 `docs/contracts/money-account-v2.md`에도 기록되어 있다. 위 상대 경로는 저장소 안에서 찾아가기 위한 참조이며, 해당 심볼과 파일의 존재를 확인했다.

| ID | 승인된 동작 | 구현 근거 | 확인한 계약과 검증 범위 |
|---|---|---|---|
| 001 | 순 저축은 유지하고 출금 후 반환의 의미 부여·연결을 제거하며, 실제 이체 경계를 기준으로 분류 | MONTH 저축 기여액; HISTORY 발생 시점별 양쪽 계좌 | 구현 확인: 일반→저축은 증가, 반대 방향은 감소, 저축→저축은 0; 음수 순 저축; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 002 | 월간 KPI 네 개를 같은 크기로 배치하고 순 저축을 은은하게 강조 | MONTH KPI 그리드: 수입/지출/총 저축/순 저축 | 구현 확인: 데스크톱 네 열 배치와 재무 합계; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 003 | 더 큰 구성 도넛 세 개에 상호작용 제공 | MONTH 도넛 컴포넌트와 차트→가계부 표 필터 연결 | 구현 확인: 배치 크기, 클릭, 필터링되지 않은 KPI 유지; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 004 | 도넛 중앙에는 항상 해당 월 전체 합계 유지 | MONTH `Donut`에 선택 값과 별도로 전체 기간 합계 전달 | 구현 확인: 카테고리/계좌 클릭 후 중앙 숫자와 선택 상세 비교; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 005 | 수입·지출의 상위/하위 카테고리 탐색과 표 필터링 | MONTH 카테고리 집계/최상위 상태/필터 콜백 | 구현 확인: 상위, 하위, 뒤로, 초기화 동작; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 006 | 저축 목적 카테고리·기본 목적·목적 선택 제거 | MONTH 계좌 기준 저축; ACCOUNT는 세부 유형만 사용 | 구현 확인: 목적 선택 흐름이 추가되지 않았는지 확인; 수입/지출 카테고리 유지; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 007 | 수취 계좌별 저축 구성, 내부 이동 제외 | MONTH 구성 집계 + 저축 표의 `accountId` | 구현 확인: 입금만 대상으로 한 계좌 상세 탐색과 내부 이체 제외; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 008 | 작업대 카테고리 팝오버에서는 간단 생성만 지원 | WORK 카테고리 선택/생성, 기존 카테고리 관리 재사용 | 구현 확인: 거래 저장 없이 새 카테고리를 즉시 선택 가능; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 009 | 자금 구분/유형 변경은 효력 발생 시점 이후 발생한 거래에 적용 | HISTORY 기준 이력과 서버 시각의 이력 추가; 발생 시점 기준 SQL 조인 | 구현 확인: 변경 전/후, 늦게 도착한 과거 거래, 세부 유형 이력; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 010 | 하나의 검토 목록에서 행별 사유와 동작 제공 | REVIEW 통합 표 | 구현 확인: 원문/금융 거래의 검토 의무가 혼재한 경우와 상세 화면 연결; **근거:** ReviewBatch 소유자·고정 범위·부분 충돌 회귀 + 실제 52건/Undo 및 원래 요청 조회 브라우저 |
| 011 | 지원 명령별 일괄 선택과 미리보기/제외/충돌/부분 실패 처리 | REVIEW 영속 미리보기, 명령 그룹, 항목별 트랜잭션 처리 결과 | 구현 확인: 서로 다른 적격 상태, 오래된 버전, 중복 재실행 방지; **근거:** ReviewBatch 소유자·고정 범위·부분 충돌 회귀 + 실제 52건/Undo 및 원래 요청 조회 브라우저 |
| 012 | 작업대 상단 흐름과 행별 결과/진행 상태, 결과 미확인 복구 | WORK 단계/활동 상태/대기 중인 요청 ID; CHOICE | 구현 확인: 저장 초안을 유지하면서 항목별 성공/실패/충돌/미확인 표시; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 013 | 독립된 최상위 통계/AI 분석 메뉴 | NAV 분석 항목과 범위를 제한한 안내 화면 | 구현 확인: 독립 탐색, 승인되지 않은 상세 분석 없음; **근거:** 탐색 구현 확인 + 최종 경로 회귀 12건 및 인증 DEV 메뉴 스모크 PASS; 상세 분석은 범위 밖 |
| 014 | 검토 화면에서 추천/재추천 제어 제거 | REVIEW 알림 전용 UI; WORK 분류 중심 화면 | 구현 확인: 검토 화면에 AI 분류 동작 없음; **근거:** ReviewBatch 소유자·고정 범위·부분 충돌 회귀 + 실제 52건/Undo 및 원래 요청 조회 브라우저 |
| 015 | 최소한의 알림 정리를 우선 지원하고 금융 정보의 모호함에 대한 보호 유지 | REVIEW 정보성 알림 정리/보류/재개 지원; 더 엄격한 일괄 처리 조건 | 구현 확인: 금융 의미가 불명확한 메시지는 정보성 알림 정리에서 계속 제외; **근거:** ReviewBatch 소유자·고정 범위·부분 충돌 회귀 + 실제 52건/Undo 및 원래 요청 조회 브라우저 |
| 016 | 계좌 목록과 우측 설정 패널 | ACCOUNT 카드; NAV 기존 도크 연결 | 구현 확인: 선택 및 데스크톱 목록/상세 배치; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 017 | 생활비 / 저축·적금 / 기타 그룹, 저축/적금 세부 유형 | ACCOUNT `groupedFundAccounts`, 저장된 그룹/세부 유형 | 구현 확인: 목적 분류 체계 없이 정확히 세 그룹; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 018 | 그룹 카드, 헤더 합계, 접기/펼치기, 선택 상세 | ACCOUNT 카드 그룹/접기 상태 | 구현 확인: 접어도 선택 유지, 올바른 그룹 소계; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 019 | 계좌 식별 정보·기관·세부 유형·잔액·주요 상태를 균형 있게 표시 | ACCOUNT 카드 필드 + 보존된 AccountIcon | 구현 확인: 카드 정보 밀도, 사용자 지정 아이콘, 상태 가시성; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 020 | 하나의 설정 페이지에 기본 정보 / 자금 구분 / 관리 배치 | ACCOUNT `RevisionAccountPanel` 영역 | 구현 확인: 설정 관리에 추가 탭 불필요; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 021 | 별칭 등 필드별 독립 저장, 재무 영향 확인, 서버 응답 확인 | ACCOUNT `run`/버전 검사와 메타데이터 보존을 적용한 갱신 | 구현 확인: 서버 확인 전 완료 표시 없음; 오류 시 초안 유지; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 022 | 상단 추가 동작으로 패널을 생성 모드로 전환하고 중복 검사/취소 제공 | ACCOUNT 생성 폼, `/mobile/accounts` | 구현 확인: 추가/취소/선택 복귀, 보관 계좌를 포함한 중복 검사; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 023 | 최소 이름/기관/그룹/세부 유형 입력과 금융 식별 정보 보존 | ACCOUNT 생성 입력; HISTORY 최초 그룹의 원자적 삽입 | 구현 확인: 등록 전 추적/대표 설정 폼 없음; 올바른 최초 그룹; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 024 | 보관 계좌를 기본으로 숨기고 복원 지원, 참조 없는 계좌만 삭제 | ACCOUNT 표시 범위/보관; 관리 적격성/삭제 서비스 | 구현 확인: 모든 참조가 삭제를 차단; 보관 시 금융 이력 유지; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 025 | 계좌 바로가기로 기존 거래 화면을 해당 계좌 필터와 함께 열기 | ACCOUNT 바로가기; NAV `FinancialTransactions` 쿼리 연결 | 구현 확인: 보관 계좌 이력을 포함해 선택 계좌 필터가 정확히 적용; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 026 | 계좌 바로가기로 선택 계좌의 잔액 점검 열기 | ACCOUNT `/money/reconciliation?account=` | 구현 확인: 선택 계좌의 정확한 잔액 점검과 기존 명령; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 027 | 그룹 순서를 고정하고 그룹 내 기존 순서 유지 | ACCOUNT `groupedFundAccounts` | 구현 확인: 새 그룹 UI가 API 순서를 바꾸지 않음; 새 정렬 API 없음; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 028 | 확정된 동일 통화 소계, 알 수 없는 값은 명시적으로 제외 | ACCOUNT 자금 현황의 미지원 통화 조건과 잔액 `asOf` | 구현 확인: 혼합 통화, 기준점 누락, 자금 현황을 불러올 수 없는 상태; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 029 | 그룹/세부 유형/역할/추적/자산/대표를 제한 수와 함께 독립적으로 유지 | ACCOUNT 독립 요청 값; 기존 추적/환경설정 엔드포인트 | 구현 확인: 한 축을 바꿔도 다른 메타데이터 유지; 5/5/10 제한; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 030 | 새 효력 발생 시점 확인/이력, 충돌 시 최신 상태 비교 | ACCOUNT 그룹 확인/최신 버전 비교; HISTORY | 구현 확인: 오래된 버전으로 그룹 저장, 무관한 메타데이터의 동시 저장; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 031 | 데스크톱 두 열 배치, 좁은 화면 상세 흐름에서 초안/선택 유지 | ACCOUNT 반응형 카드; NAV 기존 도크/미저장 변경 보호 | 구현 확인: 모바일 상세, 닫기/탐색 보호, 입력한 초안 보존; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 032 | 비어 있음/불러오는 중/새로고침/저장/오류/충돌/통화 미확인/잔액 미확인 상태 구분 | ACCOUNT `LoadState`, 오류/최신 상태 비교와 빈 그룹 | 구현 확인: API 실패가 계좌 화면을 비우지 않음; 복구 동작; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 033 | 계좌 관리는 기존 거래/잔액 금융 화면 재사용 | ACCOUNT 바로가기; 기존 잔액 점검/편집 동작 | 구현 확인: 계좌 설정 패널에 거래 표를 중복 구현하지 않음; **근거:** 계좌/모바일/삭제 회귀 + account-panel-icons/account-history/responsive 브라우저 |
| 034 | 밀도 높은 8열 가계부 표/편집 유지, KPI 네 개/도넛 세 개/필터 추가 | MONTH; WORK는 기존 가계부 열 유지 | 구현 확인: 기존 수입/지출 편집과 원문 금융 계약; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 035 | 작업대를 미리보기/복구/간단 생성을 갖춘 추천·분류 중심 화면으로 구성 | WORK; CHOICE; 기존 분류 명령 | 구현 확인: 단일 중심 화면, 추천/채택/저장 동작 구분; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 036 | 검토 정리에 페이지/필터 전체 선택, 미리보기/이력/복구 지원 | REVIEW 서버에서 고정한 범위와 영속 요청 결과 | 구현 확인: 51건 이상, 금융 항목 제외, Undo 지원과 부분 실패; **근거:** ReviewBatch 소유자·고정 범위·부분 충돌 회귀 + 실제 52건/Undo 및 원래 요청 조회 브라우저 |
| 037 | V2에 출금 후 반환/목적 UI·DTO·상태를 도입하지 않음 | MONTH 경계 어댑터; ACCOUNT 세부 유형만 있는 폼 | 구현 확인: 새 반환 연결 또는 저축 목적 흐름 없음; 다른 환불/대출 유지; **근거:** 저축/이력 PostgreSQL 회귀 + monthly-savings/donut-filter 브라우저 |
| 038 | 기존 메뉴/계약 유지, 독립 분석 항목의 범위 제한 | NAV 개요/거래/대출/카테고리/설정/잔액 점검 유지 | 구현 확인: 탐색 회귀와 분석 범위 안내 문구; **근거:** 탐색 구현 확인 + 최종 경로 회귀 12건 및 인증 DEV 메뉴 스모크 PASS; 상세 분석은 범위 밖 |
| 039 | 작업 필요 목록을 기본으로 제공하고 전체 보기 선택 가능, 숨은 선택 ID 표시 | WORK 화면/필터 제어와 화면 밖 선택 수 | 구현 확인: 기본 보기에서 완료 행 제외; 전체 보기 선택 가능; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 040 | 상태 요약 카드로 빠른 필터 제공 | WORK 서버 요약과 카드 | 구현 확인: 집계 수가 해당 필터 범위와 일치하고 월간 KPI와 분리됨; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 041 | 검색 우선의 간결한 필터, 계좌/유형 상세는 접기 | WORK 작업대의 가계부 필터 | 구현 확인: 검색/펼친 필터 제어, 선택 ID 유지; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 042 | 페이지 선택과 필터의 모든 페이지 선택 구분, 숨은 ID 유지 | WORK 페이지/필터 명령과 서버 ID 선택 | 구현 확인: 페이지를 넘나드는 선택, 필터 변경, 화면 밖 선택 수; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 043 | 고정된 ONE/SELECTED/FILTER 미리보기와 적격성/비용/요청 보호 | WORK 실행 미리보기; 기존 추천 서버 보호 | 구현 확인: 과금 실행 조건, 불변 범위, 보호 상태; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 044 | 현재 분류 / AI 원본 / 명시적 선택을 별도로 표시 | WORK `RecommendationCategory`/근거 패널; CHOICE | 구현 확인: 사용자가 선택해도 AI 원본 리비전은 변경되지 않음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 045 | 단건/일괄 채택은 선택만 생성하고 명시적 저장으로 확정 | WORK `adopt`→`choose`; CHOICE; 저장 미리보기 | 구현 확인: 채택이 분류/금융 사실을 변경하지 않음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 046 | 카테고리 선택/간단 생성만 지원하고 고급 관리는 다른 화면에서 제공 | WORK 선택기 + 카테고리 관리 경로 | 구현 확인: 생성/선택 시 거래를 암묵적으로 저장하지 않음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 047 | 흐름, 선택/화면 밖 선택 수, 진행 상태와 행별 결과를 표시 | WORK 단계 제어와 활동 상태 표시 | 구현 확인: 요청 진행 중에도 표를 사용할 수 있고 상태가 보임; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 048 | 확정 실패는 재시도, 미확인은 원래 결과 조회, 충돌/초안 보존 | WORK 대기 중인 시작/저장 ID와 결과 조회; 서버 재실행 보호 | 구현 확인: 통신 결과 미확인을 중복된 새 요청으로 전환하지 않음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 049 | 근거 패널은 명시적으로 열고 컨텍스트/질문/이력 분리 | WORK `RecommendationPanel`, 탭, `onOpen` 핸들러 | 구현 확인: 근거 도크를 자동으로 열지 않음; 컨텍스트 편집이 채팅 메시지가 되지 않음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 050 | 기존 밝은 스타일/밀도 높은 가계부 표, 반응형 표 내부 스크롤/오버레이 | WORK 스타일시트; 기존 반응형 도크/탐색 | 구현 확인: 데스크톱/좁은 화면 스크린샷, 스크롤과 포커스 처리; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 051 | 자유롭게 접근 가능한 네 단계, 안내된 전환과 행의 주요 동작 | WORK 단계 1–4, `workbenchAction`, 유지되는 독립 선택 상태 | 구현 확인: 단계 전환, 직접 선택→저장, 채택→저장, 명시적 패널 열기; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 052 | 분류 저장 미리보기 대화상자: 건수, 저장 가능/제외 비교 표, 명시적 저장 | WORK `SavePreview` + 공통 미리보기 대화상자; 서버 저장 적격성 | 구현 확인: 건수 간 합계 관계, 저장 가능 0건일 때 비활성화, 행별 결과, 금융/학습 상태 변경 없음; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |
| 053 | AI 실행 미리보기 대화상자: 고정 범위, 건수, 적격/제외 표, 보호/비용 조건 | WORK 실행 미리보기 + 공통 대화상자; 기존 서버 추천 정책 | 구현 확인: 실행 보호가 미리보기 정책과 일치, 아이콘 메타데이터 보존, 반응형 정책 안내 문구; **근거:** 추천 PostgreSQL 32건 회귀 + 작업대 5개 브라우저 흐름 |


검증 기록: 백엔드 44클래스 266통과·2 opt-in 제외, 이체 39/39, 프런트엔드 도메인 94/94 및 컴포넌트 5/5. 각 브라우저 시나리오의 최종 상태와 SHA, 증거 경로는 릴리스 보고서 8–13절에 기록한다. 실패/취소된 이전 실행은 통과 증거로 합산하지 않는다. 계좌의 드문 저장 실패·통화 미지원·버전 충돌·추적 한도, AI 예산/확정 실패/설명 후보 이력은 서버·도메인 회귀로 검증했으며 모든 조건의 실사용 화면 캡처가 있는 것은 아니다.

최종 제품 SHA: `e5f5f1775c883a3665d8e9d15783745940940fef`. 핵심 브라우저 12개 흐름의 실제 PASS 증거와 소스 동일성을 확인했고, 마지막 전역 탭 경로 수정은 자동 12건·빌드/타입·인증 DEV의 작업대/분석 메뉴 이동으로 재검증했다. DEV 웹/API SUCCESS 및 배포 후 8종 금융 행 해시 불변을 확인했다. 상세 실행과 미실행 항목은 [릴리스 보고서](money-integrated-v2-release-20261011.md)를 따른다.
