# MONEY Integrated V2 릴리스 보고서 — 2026-10-11

상태: **검증·DEV 배포 결과 입력 전 초안**. 결정 001–053의 구현을 통합 후보에 반영했으며, 이 문서만으로 릴리스 완료 또는 전체 검증 통과를 선언하지 않는다. 사용자 요청은 구현·검증·DEV 배포까지 승인했고, PROD 반영은 별도 승인 대상이다.

기준: 통합 후보 `11b721c` 및 후속 수정. 최초 통합 QA에서 기존 테스트 픽스처와 설명 작업의 컨텍스트 처리 문제가 발견되어 수정 중이다. 최종 후보 SHA, 재실행 결과, 브라우저 증거 및 배포 SHA는 담당자가 아래 빈칸을 실제 증거로 교체한다.

상태 표기: `구현됨·검증 대기`, `증거 확인됨`, `차단/수정 중`, `미구현(범위 밖)`, `DEV 배포 대기`, `PROD 승인 대기`. 테스트 또는 스크린샷이 없는 항목을 검증 완료로 바꾸지 않는다.

## 1. 구현 요약

월간 가계부, 계좌 관리, AI 분류 작업대, 검토 필요 알림을 분리했다. 월간 화면은 해당 월의 수입·지출·저축 관리에 집중하고, 작업대는 추천 생성·사용자 선택·명시적 저장을 분리한다. 계좌의 자금 구분은 발생 시점 이력으로 조회하며, 검토 일괄 처리는 서버가 확정한 개별 결과를 보여 준다.

재무 원장은 확정 금융 사실의 기준이다. 저축은 기존 소유자 간 확정 이체의 읽기 집계이며, AI 추천 채택은 별도 초안 저장이다. 원문 알림, 원장, 기존 계좌 아이콘을 V2 표시를 위해 다시 쓰지 않는다.

현재 상태: 구현됨·검증 대기. 최종 통합 QA, 브라우저 QA, 인증된 DEV 스모크 및 DEV 배포 확인은 미확정이다.

## 2. 결정 001–053 대응표

각 결정의 구현 파일·API·검증 시나리오·상태는 [전체 결정 대응표](money-integrated-v2-decision-matrix-20261011.md)에 기록한다. 이 링크의 표를 001–053의 최종 범위 기준으로 사용한다. 아래 묶음은 보고서 탐색용이며 개별 결정 검증을 대체하지 않는다.

| 영역 | 구현 근거 | 현재 상태 |
| --- | --- | --- |
| 월간 집계·저축·도넛·표 | MoneyMonthlySummary, MoneyAnalysis, MoneySavingsReadService | 구현됨·검증 대기 |
| 계좌 관리·이력·추적·대표 | MoneyAccountRevision, MoneyAccountManagementService, V80 | 구현됨·검증 대기 |
| AI 작업대·미리보기·채택·저장·복구 | MoneyBookkeepingRecommendations, MoneyRecommendationService, V81 | 구현됨·검증 대기 |
| 검토 필요 알림·선택·배치·Undo | MoneyNotificationReview, MoneyReviewBatchService | 구현됨·검증 대기 |
| 통계/AI 분석 메뉴 책임 | MoneyApp | 메뉴 경계 구현됨; 상세 장기 분석은 미구현(범위 밖) |

## 3. 변경 파일 및 구조

| 책임 | 주요 파일 |
| --- | --- |
| 탐색과 화면 분리 | `frontend/app/money/MoneyApp.tsx`, `MoneyBookkeeping.tsx`, `MoneyFinancialViews.tsx` |
| 월간 화면·읽기 집계 | `frontend/app/money/MoneyMonthlySummary.tsx`, `frontend/lib/money/monthly.ts`, `backend/src/main/java/com/kafka/backend/money/MoneyAnalysis.java`, `MoneySavingsReadController.java`, `MoneySavingsReadService.java` |
| 계좌 카드·편집·보호 | `frontend/app/money/MoneyAccountRevision.tsx`, `frontend/lib/money/accounts.ts`, `backend/src/main/java/com/kafka/backend/money/MoneyAccountManagementController.java`, `MoneyAccountManagementService.java`, `MoneyMobileService.java`, `MoneyService.java` |
| AI 추천 및 분류 선택 | `frontend/app/money/MoneyBookkeepingRecommendations.tsx`, `frontend/lib/money/workbench.ts`, `backend/src/main/java/com/kafka/backend/money/MoneyRecommendationController.java`, `MoneyRecommendationService.java`, `MoneyWebService.java` |
| 검토 배치·정보성 알림 보호 | `frontend/app/money/MoneyNotificationReview.tsx`, `MoneyReviewWorkbench.tsx`, `backend/src/main/java/com/kafka/backend/money/MoneyReviewBatchController.java`, `MoneyReviewBatchService.java`, `MoneyReviewInformationGate.java` |
| 표시와 QA | `money-account-v2.css`, `money-bookkeeping.css`, `money-bookkeeping-recommendations.css`, `money-notification-review.css`, `qa/suites/money-integrated-v2/` |

원장·가계부 투영·AI 원본 추천·사용자 분류 선택을 별도 책임으로 유지한다. 검토 배치의 이력과 Undo는 기존 이벤트 경로를 사용한다. V2를 위해 기존 마이그레이션 파일을 수정하지 않았다.

## 4. 프런트엔드 구현

- 월간: 네 지표 카드와 수입·지출·저축 도넛, 월 합계를 유지하는 중앙 숫자, 도넛 선택에 따른 하단 표 필터와 페이지 이동을 제공한다. 저축 표는 실제 확정 입금 이체를 조회한다.
- 계좌: 생활비 → 저축·적금 → 기타의 카드와 우측 관리 영역을 제공한다. 별칭, 자금 구분, 추적, 자산 포함, 대표 설정을 독립적으로 처리하고 서버 응답 후 완료 상태를 표시한다. 보관/복원과 참조가 없는 계좌의 안전한 삭제를 구분한다.
- 작업대: 대상 선택, 추천 생성, 추천 검토, 저장의 네 단계로 자유롭게 이동한다. 현재 페이지와 필터 전체 선택, 화면 밖 선택 수, 현재 분류·AI 원본·사용자 선택, 저장 전 변경 비교를 표시한다.
- 검토: 밀도 높은 알림 표, 선택 도구 모음, 미리보기의 처리 예정/제외 표, 실제 개별 처리 결과와 허용된 Undo를 제공한다. AI 추천은 검토 화면의 작업에서 분리한다.
- 공통: 실제 계좌 아이콘과 공통 대화상자 동작을 재사용한다. 넓은 표의 가로 이동은 표 내부에서 처리하고 정책 안내와 확인 동작을 대화상자 하단에 유지한다.

화면 일치, 모바일/좁은 폭, 키보드 포커스 및 실제 스크린샷 확인 상태: 검증 대기.

## 5. 백엔드 및 API

| API | 책임 |
| --- | --- |
| `GET /api/money/bookkeeping/savings` | 기간 전체 저축 합계·입금 구성·표; 표 필터는 월 합계를 바꾸지 않음 |
| `GET /api/money/accounts/{id}/fund-history` | 소유자별 자금 구분의 발생 시점 이력 |
| `GET /api/money/accounts/{id}/deletion-eligibility`, `POST /api/money/accounts/{id}/delete` | 삭제 사전 확인 및 버전·참조 재검사 |
| `POST /api/money/ai/classification/recommendations/preview`, `/start` | 고정된 추천 대상·제외 사유·사용량/비용 확인 후 실행 |
| 같은 경로의 `GET /activity`, `/run-outcomes/{requestId}` | 진행 상태와 원래 추천 요청 결과 조회 |
| 같은 경로의 `POST /choices`, `GET /choices` | AI 채택 및 직접 분류 선택의 영속 초안; 가계부 저장 없음 |
| 같은 경로의 `POST /save-preview`, `/save`, `/summary` | 저장 전 비교, 명시적 저장, 동일 서버 조건의 작업 수 집계 |
| 같은 경로의 `GET /save-outcomes/{requestId}` | 응답 손실 후 원래 저장 요청의 확정 결과 조회 |
| `POST /api/money/review/batches/preview`, `/execute` | 선택/필터 범위의 실제 처리 적격성 확인과 개별 처리 |
| `GET /api/money/review/batches/outcomes/{requestId}` | 원래 검토 요청의 결과 조회 |
| `POST /api/money/ai/events/{eventId}/undo` | 기존 이벤트 보호를 적용한 검토 처리 취소 |

소유자 범위, 버전/스냅샷 충돌, 진행 중 중복 요청 및 적격성은 서버에서 다시 검사한다. 저장 미리보기와 실행은 공통 검증을 사용하고, 작업 필요 필터와 요약도 같은 서버 조건을 사용한다. 명시적으로 수동 분류된 원본은 일반 작업 필요 대상에서 제외한다.

## 6. DB 마이그레이션

| 버전 | 파일 | 추가 내용 |
| --- | --- | --- |
| V80 | `backend/src/main/resources/db/migration/V80__money_account_fund_group_history.sql` | 기존 자금 구분의 기준 이력, 신규 계좌 초기 이력, 서버 시각으로 적용되는 구분/세부 유형 변경 이력 |
| V81 | `backend/src/main/resources/db/migration/V81__money_classification_draft_choices.sql` | 소유자·거래별 사용자 분류 초안, AI 참조와 원본 비교 스냅샷, 버전 및 범위 보호 |

DEV의 V80·V81 적용과 성공 이력 81건은 `qa/suites/money-integrated-v2/MoneyV2Migration.java` 기반 확인에서 검증되었다. 기존 V1–V79 체크섬은 변경되지 않았다. 기존 계좌 아이콘 값은 변경하지 않았다. 상세 마이그레이션 증거 파일/실행 시각: **[통합 담당자 입력 대기]**.

V80 초기 이력은 배포 당시 기존 구분을 고정한다. 이후 변경은 서버 적용 시각 이후 발생한 거래에만 영향을 주며 과거 거래를 자동 재분류하지 않는다. V81은 초안 메타데이터를 추가하고 금융 원문이나 AI 원본 추천을 덮어쓰지 않는다.

## 7. 재무 불변식 검증 근거

아래는 구현과 테스트의 확인 대상이다. 최종 실행 증거와 결과는 아직 입력 전이다.

| 불변식 | 구현/검증 근거 | 최종 실행 증거 |
| --- | --- | --- |
| 총 저축 = 일반 자금 → 소유 저축 계좌의 확정 이체; 순 저축 = 총 저축 − 반대 방향 인출 | MoneySavingsReadService, MoneyAnalysis, MoneySavingsReadPostgresTest | 대기 |
| 500,000 + 300,000 + 70,000 = 870,000원; 100,000원 인출 시 순 저축 770,000원 | `monthly-accounts.spec.mjs`, 저축 테스트 | 대기 |
| 저축↔저축·일반↔일반 이동은 저축 기여 0, 수입/지출로 변환하지 않음 | 저축 서비스·테스트 | 대기 |
| 중복 원문은 canonical 이체 한 건을 늘리지 않음; 제외/병합·소유자 경계 보존 | 저축 읽기 계약, 이체 회귀 및 소유자 테스트 | 대기 |
| 불명확한 이력·지원하지 않는 통화는 임의 현재 구분/환산으로 합산하지 않음 | MoneySavingsReadService, `money-monthly-v2.md` | 대기 |
| 발생 시점 구분 조회, 이후 계좌 변경이 과거 합계를 조용히 바꾸지 않음 | V80, MoneyAccountHistoryPostgresTest, account-history 시나리오 | 대기 |
| 채택만으로 가계부/원장 저장 없음; AI 원본 불변; 명시적 저장만 분류 투영 변경 | V81, MoneyRecommendationPostgresTest, adopt-without-save/direct-choice-save 시나리오 | 대기 |
| 독립 항목의 부분 성공·충돌 구분, 응답 손실 시 원래 요청 조회로 중복 방지 | MoneyRecommendationService, MoneyReviewBatchService, recovery 시나리오 | 대기 |
| 금융 사실이 불확실한 원문을 정보성 알림으로 임의 정리하지 않음 | MoneyReviewInformationGate, 관련 테스트 및 review-bulk-undo 시나리오 | 대기 |

저축 목적, 반환 연결, 재입금 의미 추정은 이 집계의 근거가 아니다. 잔액과 대출·펀딩 원장 및 원문 보존도 통합 회귀에서 별도로 확인한다.

## 8. 자동 검증 결과

최초 통합 실행 기준 SHA: `11b721c`. 기존 픽스처 실패 7건과 설명 작업 컨텍스트 문제를 수정 중이며 최종 테스트 수나 전체 통과를 확정하지 않는다. 범위별 검사 기록은 통합 담당자가 최종 후보의 원본 로그와 함께 정리한다.

| 검사 | 결과/증거 |
| --- | --- |
| 최종 프런트엔드 타입·lint·단위 테스트·빌드 | **[최종 후보 실행 결과 입력 대기]** |
| 최종 백엔드 단위·PostgreSQL 통합 테스트 | **[재실행 결과 및 테스트 수 입력 대기]** |
| 기존 이체·중복·원장·잔액·대출 회귀 | **[최종 결과 입력 대기]** |
| V2 재무·계좌·추천·검토 배치 회귀 | **[최종 결과 입력 대기]** |
| 브라우저 QA 시스템 `money-integrated-v2` | **[실행 결과 입력 대기]** |
| 원장·계좌·아이콘·Flyway 전후 보존 비교 | **[증거 파일 입력 대기]** |

QA는 소유된 격리 런타임과 synthetic 데이터로 실제 API를 실행한다. 결과를 모킹하여 성공 수를 만들지 않는다. 53건 검토 중 52건 처리와 1건 제외는 실제 서버 처리 후 확인하며, 완료 대기 시간은 원격 실행의 확인 지연을 수용하도록 별도 QA 수정에 반영한다.

## 9. 브라우저 스크린샷

스크린샷과 실행 결과의 연결: **[QA 실행 경로·보고서 링크 입력 대기]**. 아래는 필요한 증거 목록이며 생성 완료를 의미하지 않는다.

| 화면/흐름 | 필요한 증거 |
| --- | --- |
| 월간 | 네 카드·세 도넛·월 합계·표 필터 전후·저축 상세 |
| 계좌 | 세 그룹·실제 아이콘·우측 패널·이력·보관/복원·삭제 차단 |
| 작업대 | 네 단계·숨은 선택·추천 대상/제외 스냅샷·채택 후 미저장·저장 비교·부분 결과·원래 요청 복구 |
| 검토 | 53건 선택·52건 적격/1건 제외·서버 확정 결과·Undo·응답 손실 복구 |
| 반응형 | 데스크톱·좁은 화면·모바일, 표 내부 가로 스크롤과 대화상자 동작 |

## 10. 기존 계좌 이모지 확인

기존 아이콘 렌더러 `AccountIcon`과 저장된 이모지/이미지를 재사용했다. DEV 마이그레이션에서 기존 아이콘 값은 변경하지 않았다. 다음 두 증거를 최종 보고서에 추가한다.

- DB 전후 아이콘 비교: **[비교 증거 링크 입력 대기]**.
- 계좌·월간·작업대 실제 화면과 사용자 기존 계좌 아이콘 대조: **[스크린샷 및 확인 결과 입력 대기]**.

## 11. AI 작업대 UX 준수

| 요구 | 구현 내용 | 확인 상태 |
| --- | --- | --- |
| 네 단계, 순서 강제 없음 | 단계별 자유 이동과 서버 상태 요약 | 브라우저 대기 |
| 선택 범위 명확화 | 페이지/필터 전체 선택, 선택 수와 화면 밖 선택 수 | 브라우저 대기 |
| 실제 대상 미리보기 | 서버 대상·제외 스냅샷, 사유, 실제 사용량/비용 정보 | API/브라우저 대기 |
| 채택과 저장 구분 | 영속 선택 초안; 채택 API는 분류 쓰기 0; 별도 저장 확인 | 통합 검증 대기 |
| 원본 비교 | 현재 분류·AI 원본·사용자 선택과 원본 스냅샷 보존 | 통합 검증 대기 |
| 직접 선택과 간단 생성 | 기존 카테고리 API 사용, 선택 후 별도 저장 | 브라우저 대기 |
| 충돌 보호 | 최신 버전 재검사, 원본/현재 비교와 명시적 확인 | 통합 검증 대기 |
| 실패·부분 결과·미확인 | 항목별 상태, 확정 실패와 미확인 구분, 원래 요청 ID로 조회 | 통합 검증 대기 |
| 넓은 표 대화상자 | 대상/제외 탭, 고정 정책/확인 영역, 내부 스크롤, 포커스 관리 | 반응형/접근성 대기 |

작업 필요 대상에는 미분류·자동 분류·대기/오류 상태가 반영되며, 명시적 수동 분류 원본을 무조건 다시 작업 대상으로 만들지 않는다. 전체 선택과 실제 저장 선택은 독립적으로 유지한다.

## 12. DEV 배포 URL 및 SHA

| 항목 | 값 |
| --- | --- |
| 웹 | [WORK FLOW DEV](https://workflow-web-development-development.up.railway.app) |
| API | [WORK FLOW API DEV](https://workflow-api-development-development.up.railway.app) |
| 최종 통합 후보 SHA | **[최종 검증 완료 후 입력]** |
| 웹 배포 SHA·배포 ID·완료 시각 | **[DEV 배포 확인 대기]** |
| API 배포 SHA·배포 ID·완료 시각 | **[DEV 배포 확인 대기]** |
| DEV DB | V80·V81 적용 확인; 성공 이력 81건; V1–V79 체크섬 보존 |

상태: **DEV 배포 대기**. URL이 존재한다는 사실은 V2 애플리케이션 배포 성공 증거가 아니다. 웹과 API가 같은 승인 후보를 실행하는지 실제 배포 메타데이터 및 인증 스모크로 확인한다.

## 13. 인증된 DEV 스모크

| 확인 | 결과 |
| --- | --- |
| 기존 인증·소유자 범위·권한 거부 | **[대기]** |
| 월간 전체 합계/저축/도넛 필터 | **[대기]** |
| 실제 계좌 아이콘·이력 조회·변경 영향 확인 | **[대기]** |
| 추천 미리보기·채택 후 미저장·명시적 저장 | **[대기]** |
| 검토 미리보기·부분 결과·Undo | **[대기]** |
| 응답 손실 후 원래 요청 조회 | **[대기]** |
| 재무 원장·원문·중복·잔액·대출 보존 | **[대기]** |

인증된 DEV의 실제 API·브라우저 결과와 synthetic 테스트 데이터를 연결해 기록한다. 공개 랜딩 화면이나 HTTP 상태만으로 MONEY 기능 스모크를 완료 처리하지 않는다.

## 14. 남은 결함 및 차단 요소

- 최초 통합 QA에서 발견된 기존 픽스처 실패와 설명 작업 컨텍스트 문제: 수정 및 최종 재실행 결과 대기.
- 최종 통합 SHA에 대한 전체 자동 검증·브라우저 QA·스크린샷·보존 비교: 대기.
- 웹/API DEV 배포와 인증된 스모크: 대기.
- PROD 승인 및 운영 반영: 승인 대기. PROD 기준 `db90a584`는 변경하지 않았다.
- 통계/AI 분석의 상세 장기 분석은 이번 결정에서 메뉴 책임만 정리한 후속 기획 영역이다.

새로 확인된 결함: **[QA 종료 후 실제 결함·심각도·처리 상태 입력]**. 미확정 결과를 결함 없음으로 기입하지 않는다.

## 15. 롤백 절차

1. 현재 DEV 웹/API 배포 SHA·배포 ID, 직전 정상 배포와 해당 DB 버전 및 인증 스모크 기록을 확보한다. 직전 정상 배포 식별자: **[배포 전/후 기록 입력 대기]**.
2. 응답 손실·실행 중 요청은 원래 requestId로 결과를 먼저 조회한다. 새 ID로 같은 저장이나 금융 명령을 재실행하지 않는다.
3. 애플리케이션 장애 시 호환성을 확인한 직전 정상 DEV 웹/API 배포로 되돌린다. 이후 생성된 금융 사실과 원문은 보존한다.
4. 추가형 V80·V81은 유지한다. 성공한 Flyway 이력을 지우거나 기존 파일 체크섬을 변경하거나 운영 테이블을 역삭제하지 않는다. 구버전 애플리케이션과 추가 테이블의 호환성을 확인하고, 필요하면 추가 수정 마이그레이션으로 복구한다.
5. 계좌 구분·분류·검토 처리의 의미 복구는 권한·버전 검사를 거치는 기존 명시적 변경 또는 허용된 이벤트 Undo로 수행한다. 금융 원장을 일괄 되감거나 새 이력을 소급 삭제하지 않는다.
6. 롤백 후 인증, 소유자 경계, 월간 합계, 원장/원문/아이콘 보존, 진행 중 요청 결과를 다시 확인하고 실제 결과를 기록한다.

백업 복원과 PROD 데이터 복구는 별도 결정 대상이다. 이 문서는 PROD 변경 또는 금융 기록 삭제를 승인하지 않는다.

## 16. PROD 준비 상태 및 승인

상태: **PROD 승인 대기**. PROD 기준 `db90a584`와 기존 운영 DB는 이번 DEV 작업에서 변경하지 않았다.

승인 검토 전에 최종 결정 대응표, 자동/브라우저 QA, 재무 불변식 및 전후 보존 증거, DEV 배포 SHA, 인증 스모크, 미해결 결함과 롤백 식별자를 채운다. 그 결과를 포함한 구체적인 운영 반영안에 대해 사용자 승인을 받은 뒤 저장소의 운영 배포 정책을 적용한다.

최종 승인 요청·응답·반영 SHA·운영 마이그레이션·배포/스모크 증거: **[현재 승인 전; 추후 실제 승인 및 실행 후 입력]**.
