# MONEY Integrated V2 릴리스 보고서 — 2026-10-11

상태: **결정 001–053 구현·핵심 QA·DEV 배포·인증 스모크 완료**. 사용자 요청에 승인된 DEV 작업을 완료했다. PROD 반영은 별도 승인 전이다. 검증의 실제 범위와 제외 항목은 아래에 구분한다.

금융·이체 회귀 후보: `16864393ae2dabe0dd5930b9e56195883b93a33f`. 최종 UI 집중 QA: `3e3a88cde5ca3eb753f7ec30b03973794ad63b71`; 최종 제품 및 인증 DEV 후보: `e5f5f1775c883a3665d8e9d15783745940940fef`. 백엔드와 금융/도메인 라이브러리는 회귀 검증 후보와 동일하다. 이후 UI 수정은 대화상자 중앙 배치, 월간 분류 셀 밀도, 필수 `compared` 값 전송, 계좌 선택 유지, 서버 확정 성공 항목만 선택 해제이며 실제 브라우저 검증으로 확인한다. 최신 DEV의 다른 작업도 이 후보에 통합했다. 최초 중단 실행과 구소스 실행기의 결과는 최종 검증 통과 증거에 포함하지 않는다.

상태 표기: 핵심 흐름의 실제 검증 완료, 계약 회귀 검증, opt-in 미실행, 상세 분석 범위 밖, PROD 승인 전을 구분한다. 단일 전체 CLI PASS나 모든 조합의 수동 검증을 주장하지 않는다.

## 1. 구현 요약

월간 가계부, 계좌 관리, AI 분류 작업대, 검토 필요 알림을 분리했다. 월간 화면은 해당 월의 수입·지출·저축 관리에 집중하고, 작업대는 추천 생성·사용자 선택·명시적 저장을 분리한다. 계좌의 자금 구분은 발생 시점 이력으로 조회하며, 검토 일괄 처리는 서버가 확정한 개별 결과를 보여 준다.

재무 원장은 확정 금융 사실의 기준이다. 저축은 기존 소유자 간 확정 이체의 읽기 집계이며, AI 추천 채택은 별도 초안 저장이다. 원문 알림, 원장, 기존 계좌 아이콘을 V2 표시를 위해 다시 쓰지 않는다.

현재 상태: 승인된 구현, 금융 회귀, 핵심 실제 브라우저 QA, DEV 웹/API 성공 및 인증된 DEV 스모크 완료. 2개 opt-in 회귀는 미실행이다.

## 2. 결정 001–053 대응표

각 결정의 구현 파일·API·검증 시나리오·상태는 [전체 결정 대응표](money-integrated-v2-decision-matrix-20261011.md)에 기록한다. 이 링크의 표를 001–053의 최종 범위 기준으로 사용한다. 아래 묶음은 보고서 탐색용이며 개별 결정 검증을 대체하지 않는다.

| 영역 | 구현 근거 | 현재 상태 |
| --- | --- | --- |
| 월간 집계·저축·도넛·표 | MoneyMonthlySummary, MoneyAnalysis, MoneySavingsReadService | 구현·핵심 흐름 검증 완료 |
| 계좌 관리·이력·추적·대표 | MoneyAccountRevision, MoneyAccountManagementService, V80 | 구현·핵심 흐름 검증 완료 |
| AI 작업대·미리보기·채택·저장·복구 | MoneyBookkeepingRecommendations, MoneyRecommendationService, V81 | 구현·핵심 흐름 검증 완료 |
| 검토 필요 알림·선택·배치·Undo | MoneyNotificationReview, MoneyReviewBatchService | 구현·핵심 흐름 검증 완료 |
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

월간의 4 KPI·3 도넛·8열 표, 도넛 필터 후 합계 유지와 제목/메모 수정 시 원장 불변을 실제 브라우저에서 확인했다. 작업대 단계 자유 이동과 숨은 선택 수, 추천 대상/제외 미리보기도 확인했다. 추천·저장 대화상자의 중앙 배치는 전역 CSS 리셋 영향을 수정한 뒤 실제 위치·폭·높이를 검사했다. 계좌·채택·명시적 저장·부분 충돌·원래 요청 복구의 최종 재검증도 완료했다. 실제 DEV에서 전역 탭 신규 경로 누락을 수정한 뒤 메뉴 이동을 재확인했다.

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

DEV의 V80·V81 적용과 최종 버전 V81·성공 이력 79건은 `qa/suites/money-integrated-v2/MoneyV2Migration.java` 기반 확인에서 검증되었다. 기존 V1–V79 체크섬은 변경되지 않았다. 기존 계좌 아이콘 값은 변경하지 않았다. 적용 영수증은 `migration-receipt.log`, 확인 시각은 2026-10-11 14:56:43 KST다. V80 체크섬은 1024278197, V81은 1360040465이며 성공 이력 행 수는 버전 번호와 다르게 79건이다.

V80 초기 이력은 배포 당시 기존 구분을 고정한다. 이후 변경은 서버 적용 시각 이후 발생한 거래에만 영향을 주며 과거 거래를 자동 재분류하지 않는다. V81은 초안 메타데이터를 추가하고 금융 원문이나 AI 원본 추천을 덮어쓰지 않는다.

## 7. 재무 불변식 검증 근거

아래 금융 계약은 실제 owned PostgreSQL 회귀에서 통과했다. 브라우저 검증은 별도 핵심 UI 흐름의 증거이며 실제 금융 데이터에 쓰기를 수행하지 않았다.

| 불변식 | 구현/검증 근거 | 최종 실행 증거 |
| --- | --- | --- |
| 총 저축 = 일반 자금 → 소유 저축 계좌의 확정 이체; 순 저축 = 총 저축 − 반대 방향 인출 | MoneySavingsReadService, MoneyAnalysis, MoneySavingsReadPostgresTest | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 500,000 + 300,000 + 70,000 = 870,000원; 100,000원 인출 시 순 저축 770,000원 | `monthly-accounts.spec.mjs`, 저축 테스트 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 저축↔저축·일반↔일반 이동은 저축 기여 0, 수입/지출로 변환하지 않음 | 저축 서비스·테스트 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 중복 원문은 canonical 이체 한 건을 늘리지 않음; 제외/병합·소유자 경계 보존 | 저축 읽기 계약, 이체 회귀 및 소유자 테스트 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 불명확한 이력·지원하지 않는 통화는 임의 현재 구분/환산으로 합산하지 않음 | MoneySavingsReadService, `money-monthly-v2.md` | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 발생 시점 구분 조회, 이후 계좌 변경이 과거 합계를 조용히 바꾸지 않음 | V80, MoneyAccountHistoryPostgresTest, account-history 시나리오 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 채택만으로 가계부/원장 저장 없음; AI 원본 불변; 명시적 저장만 분류 투영 변경 | V81, MoneyRecommendationPostgresTest, adopt-without-save/direct-choice-save 시나리오 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 독립 항목의 부분 성공·충돌 구분, 응답 손실 시 원래 요청 조회로 중복 방지 | MoneyRecommendationService, MoneyReviewBatchService, recovery 시나리오 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |
| 금융 사실이 불확실한 원문을 정보성 알림으로 임의 정리하지 않음 | MoneyReviewInformationGate, 관련 테스트 및 review-bulk-undo 시나리오 | 금융 회귀 PASS; 브라우저 최종 결과는 8절 |

저축 목적, 반환 연결, 재입금 의미 추정은 이 집계의 근거가 아니다. 잔액과 대출·펀딩 원장 및 원문 보존도 통합 회귀에서 별도로 확인한다.

## 8. 자동 검증 결과

| 검사 | 실제 결과/증거 |
| --- | --- |
| MONEY 및 보안 백엔드 회귀 | 44개 XML 클래스, 268건 중 266 통과·2 opt-in 제외·실패/오류 0. `final-backend-regression.json`, `backend-test-results/` |
| 이체 회귀 | 39/39 통과. `final-transfer-39-cases.log` |
| 프런트엔드 도메인 | 18파일 94건 통과, 제외/실패 0. `frontend-domain-final.json` |
| 컴포넌트 | 2파일 5건 통과, 제외/실패 0. `frontend-components-final.json` |
| 정적 검사 | MONEY 전체 및 마지막 전역 탭 수정의 ESLint PASS |
| 배포용 빌드·전체 타입 검사 | 최종 `e5f5f17`에서 PASS, 정적 페이지 40개 생성 |
| 전역 탭·MONEY 메뉴 경로 | 마지막 수정 후보에서 12/12 통과(기존 기간 3건 포함). `frontend-shell-navigation-final.json` |
| 실제 브라우저 핵심 흐름 | 12개 명명된 시나리오 모두 실제 PASS 증거 확보. `final-browser-coverage.json` |
| 실제 DEV 보존 | 배포 전후 8종 범위의 건수·행 해시 동일. `dev-preservation-after-deploy.json` |

브라우저 12건은 전체 명령 한 번의 일괄 PASS가 아닌, 변경된 동작을 최종 소스에서 재검증하고 나머지는 관련 제품 소스 동일성을 확인한 결과다. 검토 52건 처리/Undo는 `4d4fdb1`, 월간·도넛·검토 원래 요청 조회는 `1d30e29`, 작업대 단계·추천 고정 범위·채택 후 미저장은 `0abd4ab`에서 통과했다. 계좌 패널·이력·모바일, 직접 분류 저장, 부분 충돌과 저장 응답 유실 복구의 5건은 `3e3a88c` 최종 집중 실행에서 모두 PASS였다. 이 실행의 API 6개는 200, 런타임 오류 0, 실행 스키마·연결·포트 정리도 PASS였다. 이후 `e5f5f17`은 전역 탭 경로 등록과 해당 테스트만 변경했고 실제 인증 DEV 메뉴 이동을 확인했다.

백엔드 제외 2건은 외부 OpenAI 실호출을 요구하는 `MoneyAiProviderLivePostgresTest`와 과거 특정 기간 실기기 알림을 요구하는 `MoneyRealDeviceReadOnlyTest`다. 실행하지 않았으며 통과 건수에 포함하지 않는다.

전체 MONEY 및 보안 회귀는 DEV 자격증명을 전달하지 않는 소유된 로컬 PostgreSQL 합성 DB에서 실행했다. 백엔드·이체 실행의 종료 영수증은 포트 해제·데이터 제거 PASS다. 브라우저 QA는 실제 DEV DB의 실행 전용 스키마와 소유된 로컬 앱으로 실제 API를 사용했다. 서버 금융 처리 성공을 모킹하지 않았다.

전체 통합 CLI는 금융·이체 회귀 완료 후 병렬 프런트엔드 검사의 60초 제한으로 중단되어 전체 PASS가 아니다. 이후 같은 제품 소스의 프런트엔드 검사를 순차 실행해 통과했다. 최초 브라우저 준비 실행은 외부 node_modules 연결에 대한 Turbopack 거부로 NOT_RUN이었다. 이후 실제 QA에서 발견한 대화상자 위치, boolean, 선택 유지·부분 성공 선택 제거와 콜백 타입 문제를 수정했다. 구소스 실행·중간 실패는 통과로 집계하지 않았고 로그를 보존했다.

증거 폴더: [최종 브라우저 집계](D:/DEV_SPACE/money-v2-evidence-20261011/final-browser-coverage.json), [소스 동일성](D:/DEV_SPACE/money-v2-evidence-20261011/final-source-equivalence.json), [백엔드 회귀](D:/DEV_SPACE/money-v2-evidence-20261011/final-backend-regression.json). 모든 개별 실행 원본은 같은 증거 폴더에 있다.

## 9. 브라우저 스크린샷

승인된 설계 화면을 기준으로 실제 앱의 카드·도넛·8열 표·우측 패널·대화상자를 비교했다. 아래 이미지는 실행 전용 스키마의 합성 사실을 실제 API와 브라우저로 처리한 증거다. 금융 성공을 모킹하지 않았다.

| 증거 | 실제 확인 |
| --- | --- |
| [월간 네 KPI·세 도넛](../assets/money-integrated-v2-20261011/01-monthly-kpis-donuts.png) | 총 저축 870,000원·순 저축 770,000원, 필터 후 월 합계 유지, 제목/메모 편집의 원장 불변 |
| [AI 추천 미리보기](../assets/money-integrated-v2-20261011/02-ai-recommendation-preview.png) | 2개 선택 중 1개 대상·1개 기존 선택 제외, 실제 서버 스냅샷·사유, 이후 신규 거래가 고정 범위를 늘리지 않음 |
| [모바일 저장 미리보기](../assets/money-integrated-v2-20261011/03-mobile-save-preview.png) | 390px 화면, 정책·하단 CTA 가시성, 내부 표 스크롤·페이지 외부 넘침 없음 |
| [검토 52건 적격·1건 보호](../assets/money-integrated-v2-20261011/04-review-52-eligible-one-protected.png) | 53건 필터 전체 선택, 모호한 금융 알림 제외 |
| [실제 결과·Undo](../assets/money-integrated-v2-20261011/05-review-confirmed-results-undo.png) | 실제 52/52 서버 확정 진행, POST 1회, 허용된 이벤트 Undo |
| [계좌 생성·선택 유지](../assets/money-integrated-v2-20261011/06-accounts-create-selection-preserved.png) | 세 그룹·우측 패널, 생성 계좌 및 수동 선택이 새로고침 뒤 유지 |

추가 원본은 D:/DEV_SPACE/money-v2-evidence-20261011의 각 실행에 보존했다. 모바일·계좌 이력·부분 성공·0건 제외·원래 요청 복구와 실패한 이전 실행도 분리 보존한다. 대화상자는 실제 경계값으로 중앙 ±2px, 최대 1100px, 높이 92vh 이하를 검사했다. 검토 52건 처리·진행 확인·Undo 전체 시나리오는 254.431초였다. 원격 QA 스키마와 2연결 풀에서 측정했으며 운영 처리 속도를 보장하는 수치는 아니다.

## 10. 기존 계좌 이모지 확인

기존 `AccountIcon` 렌더러와 저장된 이모지/이미지를 재사용했다. 실제 DEV에서 기존 8개 계좌의 은행 이미지와 💳 계좌 카드·패널 값을 확인했고, 월간·작업대의 계좌 표시에서도 기존 렌더러를 유지한다.

아이콘 8건의 SHA-256은 배포 전후 모두 `6b1625b4fdccbbe837e87fd3c983ddfd7dd55f4bfd52a9cff7e7176f35400dcd`다. 계좌 행 전체도 8건·동일 해시였다. 전후 기준은 V80·V81 적용 뒤와 애플리케이션 배포·인증 스모크 뒤이며, 존재하지 않는 마이그레이션 전 전체 해시를 주장하지 않는다.

실제 사용자 데이터가 포함된 DEV 화면과 AX 원본은 로컬 증거 폴더의 `dev-authenticated-accounts-before.jpg`, `dev-authenticated-accounts-after.jpg`, `dev-accounts-authenticated.ax.txt`, `dev-authenticated-recommendation-preview.jpg`에 보존하고 Git에는 합성 QA 이미지만 추가했다. [보존 비교](D:/DEV_SPACE/money-v2-evidence-20261011/dev-preservation-after-deploy.json).

## 11. AI 작업대 UX 준수

| 요구 | 실제 확인 및 범위 |
| --- | --- |
| 자유로운 네 단계 | 4→2→1→3→1 이동, 채택은 저장 단계로 안내, 직접 선택에서 AI 없이 저장 가능 |
| 선택 범위 | 페이지 6건 선택, 1건만 보일 때 화면 밖 5건 유지. 필터 전체 고정 범위는 서버 회귀에서 51건 이상 검증 |
| 대상/제외 | 기존 명시 선택 제외, 적격 ID·실제 사유, 신규 거래가 실행 스냅샷에 추가되지 않음 |
| 단건·일괄 채택 | 3건 영속 선택 후 재조회; 가계부·원장·AI 원본 추천은 채택 전과 동일 |
| 간단 생성·명시적 저장 | 하위 분류 생성·선택만으로 거래 저장 없음, 실제 저장 뒤 투영 변경·원장 불변 |
| 성공·충돌 | 동시 메모 수정 뒤 1 SAVED·1 STALE_CONFLICT, 양쪽 결과 표시, 성공 선택만 제거·충돌 초안/선택/최신 메모 유지 |
| 0건 보호 | 확정 분류의 추천 제외·충돌 초안의 저장 제외를 실제 표에서 확인, 0건 CTA 비활성화 |
| 미확인 복구 | 실제 커밋 뒤 응답 유실, 새 POST 없이 원래 requestId GET으로 SAVED 확인·중복 이벤트 없음 |
| 표 대화상자 | 대상/제외 탭·3개 건수·정책·고정 하단 버튼, 데스크톱 중앙·모바일 390px 검사 |
| 근거·비용·예산 | 근거 도크는 명시 열기; 설명/질문/이력 분리. 예산·확정 실패·늦은 설명 응답·학습 보호·Undo는 PostgreSQL 계약 회귀 |

외부 AI 실호출과 모든 네트워크/키보드 조합을 수동 검증했다는 뜻은 아니다. 브라우저 추천은 실제 소유자 승인 규칙과 서버 엔진으로 생성했다. 미리보기·채택만으로 확정 분류·금융 상태·학습을 변경하지 않는다.

## 12. DEV 배포 URL 및 SHA

| 항목 | 실제 확인 |
| --- | --- |
| 웹 | [WORK FLOW DEV](https://workflow-web-development-development.up.railway.app/money/bookkeeping) |
| API | [WORK FLOW API DEV](https://workflow-api-development-development.up.railway.app) |
| 최종 제품 SHA | `e5f5f1775c883a3665d8e9d15783745940940fef` |
| 웹 배포 | `db76d7c0-9517-4698-adf8-ebce52fd48a6` · SUCCESS · 2026-10-11 17:52:48 KST |
| API 배포 | `815bb181-bbef-401a-a91b-729d54769848` · SUCCESS · 2026-10-11 17:53:10 KST |
| 일치 확인 | 두 서비스 `dev` 브랜치·위 제품 SHA, canRollback/canRedeploy=true |
| DEV DB | V80·V81 적용 확인; 최종 버전 V81·성공 이력 79건; 기존 성공 이력 체크섬 보존 |

상태: **DEV 제품 배포 성공·인증 스모크 완료**. 최초 `3e3a88c` 배포 뒤 인증 스모크에서 전역 탭의 신규 메뉴 경로 누락을 발견해 수정했고 위 SHA를 재배포했다. 상세 식별자는 [배포 영수증](D:/DEV_SPACE/money-v2-evidence-20261011/deployment-final.json)에 있다. 이후 릴리스 문서·합성 스크린샷만의 커밋은 제품 코드가 위 SHA와 동일하며, 추가 자동 배포가 발생하면 별도 로컬 배포 부록에 기록한다.

## 13. 인증된 DEV 스모크

기존 Chrome 인증 세션으로 실제 배포된 MONEY를 확인했다. 공개 랜딩·건강 점검만으로 완료 처리하지 않았다. 실제 사용자 금융 사실에는 분류 저장·알림 처리·Undo를 실행하지 않았고 외부 유료 AI도 실행하지 않았다. 쓰기·부분 실패·응답 유실은 별도 실행 스키마의 실제 API 브라우저 QA로 확인했다.

| 실제 DEV 확인 | 결과 |
| --- | --- |
| 인증 및 소유 데이터 | 로그아웃 제어와 기존 소유 계좌·거래·검토 데이터 로딩 PASS. 타 소유자 거부는 백엔드 보안 회귀로 검증 |
| 월간 합계·도넛 필터 | 네 KPI·세 도넛·8열 거래표 PASS; 분류 선택으로 30→1행이 되어도 네 KPI 동일 |
| 기존 계좌 | 기존 8개·세 그룹·이미지/💳·미확정 잔액 표시·기준 자금 이력·이력 있는 계좌 삭제 보호 PASS |
| 계좌 딥링크 | “이 계좌 거래 보기”의 선택 계좌 필터, “잔액 점검”의 URL·선택 계좌 일치 PASS |
| 독립 작업대 | 최종 수정 뒤 사이드바에서 작업대 이동 및 정확한 전역 탭 제목 PASS; 기본 작업 필요 2건/전체 5건, 네 단계 표시 |
| 추천 미리보기 | 실제 1건 선택·실행 적격 1·제외 0·비용/예산·정책·고정 범위 표 PASS; 실행 없이 닫음 |
| 검토 미리보기 | 실제 11건 중 적격 3·제외 8, 금융 불명확 항목의 사유·개별 금융 확인 안내 PASS; 실행 없이 닫음 |
| 분석 경계 | 최종 수정 뒤 독립 메뉴 이동·탭 제목·후속 상세 기능 안내·월간 복귀 PASS |
| 재무 보존 | 계좌 8, 원장 73, 원문 103, 거래 연결 83, 파싱 이력 103, 잔액 기준점 1, 대출 5, 아이콘 8의 행 해시 모두 배포 전과 동일 |

스모크 영수증: [실제 확인 범위](D:/DEV_SPACE/money-v2-evidence-20261011/dev-authenticated-smoke-final.json). 실제 DEV 비공개 화면·AX 원본은 로컬에 보존했다. 추천 채택·명시 저장·검토 실행/Undo·부분 충돌·원래 요청 복구는 8–11절의 합성 사실 실제 API 증거와 구분한다.

## 14. 남은 결함 및 차단 요소

승인된 핵심 흐름의 미해결 제품 결함은 최종 검증에서 확인되지 않았다. 대화상자 위치, 월간 분류 셀 높이, 채택 요청의 필수 boolean, 새로고침 시 계좌 선택 복귀, 부분 저장 성공 항목의 선택 잔존을 수정하고 실제 흐름을 재검증했다. 콜백 타입 누락도 전체 타입 검사에서 잡아 수정했다. 인증 DEV에서 전역 탭의 작업대·분석 경로 누락을 발견해 수정했고 실제 사이드바 이동을 재검증했다. 실패한 중간 실행을 통과로 집계하지 않았다.

- 외부 OpenAI 실호출·과거 특정 기간 실기기 검증 2건은 opt-in 제외이며 미실행이다.
- 통계/AI 분석의 상세 장기 분석은 이번 승인 범위 밖이다.
- DEV 배포·인증 스모크·배포 후 8종 보존 대조는 완료했다.
- PROD는 별도 승인 전이며 MONEY 작업으로 앱·DB를 변경하지 않았다.
- 과거 계좌 담당자의 소유된 임시 PostgreSQL 데이터 삭제를 자동 승인 검토가 두 번 거절했다(사유: blocked by policy). 서버 종료·포트 해제는 확인했지만 데이터와 계좌 작업 폴더/브랜치는 보존한다. 우회 삭제를 시도하지 않았다. 최종 루트 회귀의 별도 임시 DB와 최종 브라우저 스키마는 정상 정리됐다.

주 작업 폴더의 사용자 변경 9개 파일은 내용 SHA-256과 스테이징 항목이 작업 전과 동일함을 확인했다. 관련 없는 작업과 사용자 탭을 변경하지 않았다.

## 15. 롤백 절차

1. 현재 DEV 웹/API 배포 SHA·배포 ID, 직전 정상 배포와 해당 DB 버전 및 인증 스모크 기록을 확보한다. 직전 정상 DEV는 `beebdf2e24e281bb0c79e21a4ef97e08e6824124`이며 웹 배포 `a707092a-2697-471f-9bdb-b9dff235e166`, API 배포 `d1161e21-c0e3-4c77-a82e-3ee0a707dda6`가 SUCCESS·canRollback=true다. 실제 롤백은 실행하지 않았다.
2. 응답 손실·실행 중 요청은 원래 requestId로 결과를 먼저 조회한다. 새 ID로 같은 저장이나 금융 명령을 재실행하지 않는다.
3. 프런트엔드는 직전 정상 DEV 웹 배포로 복귀할 수 있다. 백엔드는 V80 이후 새로운 자금 구분 변경 이력이 없는지 먼저 확인한다. 구버전 백엔드는 현재 자금 구분으로 과거 집계를 계산하므로, 새 변경 이력이 있다면 V80 시점 조회를 보존하는 백엔드로 복귀하거나 수정 배포한다. 이후 생성된 금융 사실과 원문은 보존한다.
4. 추가형 V80·V81은 유지한다. 성공한 Flyway 이력을 지우거나 기존 파일 체크섬을 변경하거나 운영 테이블을 역삭제하지 않는다. 구버전 애플리케이션과 추가 테이블의 호환성을 확인하고, 필요하면 추가 수정 마이그레이션으로 복구한다.
5. 계좌 구분·분류·검토 처리의 의미 복구는 권한·버전 검사를 거치는 기존 명시적 변경 또는 허용된 이벤트 Undo로 수행한다. 금융 원장을 일괄 되감거나 새 이력을 소급 삭제하지 않는다.
6. 롤백 후 인증, 소유자 경계, 월간 합계, 원장/원문/아이콘 보존, 진행 중 요청 결과를 다시 확인하고 실제 결과를 기록한다.

백업 복원과 PROD 데이터 복구는 별도 결정 대상이다. 이 문서는 PROD 변경 또는 금융 기록 삭제를 승인하지 않는다.

## 16. PROD 준비 상태 및 승인

상태: **구현·DEV 검증 완료, PROD 승인 전**. 이번 MONEY 작업으로 PROD 앱·DB를 변경하지 않았다. 최종 조회에서도 PROD 웹/API는 병행 작업의 `6da09511f5b002f950e36c583ff6b27d7adafeac`·SUCCESS를 유지했다.

운영 반영안은 검증한 MONEY 제품 SHA와 문서 커밋을 기준으로 최신 PROD/DEV 차이를 다시 확인하고, PROD 소유자 데이터의 보존 기준·DB 백업/복구 식별자를 확보한 뒤 추가형 V80·V81을 정상 Flyway 경로로 적용하는 것이다. 웹/API의 같은 반영 SHA, 기존 체크섬, 인증·월간·계좌 아이콘·이력·검토 보호와 배포 후 금융 해시를 재확인한다. V80 이후 이력 사용 여부를 고려한 롤백 조건은 15절을 따른다.

운영 승인 요청·응답, 운영 반영 SHA·마이그레이션·배포/스모크 기록은 현재 존재하지 않는다. 이 보고서와 결정 대응표는 DEV 결과를 검토하기 위한 자료이며 PROD 반영 승인을 대신하지 않는다.
