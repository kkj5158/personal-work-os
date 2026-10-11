# MONEY Android V2 — native client and durable commands

2026-10-11. 기존 Android 패키지 `com.kafka.money.notificationpoc`, Compose, 금융 원장,
Bridge 및 사용자 JWT 보안 경계를 유지한다. 새 금융 의미나 DB 마이그레이션은 없다.

## 화면과 API

모든 경로는 `/api/money` 기준이며 DEV의 개발 프로필 외에는 사용자 JWT가 필요하다.
Bridge ingest 전용 토큰은 아래 읽기·쓰기 권한이 없다.

| 화면/행동 | 공유 계약 | 모바일 처리 |
|---|---|---|
| 홈 기간 흐름 | `GET /overview?from&to` | 서버 수입·소비·저축 순이동, 내부이체 제외 의미 유지 |
| 현재 자산/생활/저축 | `GET /overview/current-stock` | null·unknown·미지원 통화 표시, 누락 잔액을 0으로 대체하지 않음 |
| 대표 계좌/잔액 | `GET /overview/preferences`, `/mobile/funds` | 근거일 없는 잔액 숨김, 설정의 고급 관리는 Web |
| 가계부 지출·수입 | `GET /bookkeeping?kind&from&to&search&accountIds&limit&offset` | 혼합 모드는 두 표준 피드 병합, 금융 타입 ALL로 오용하지 않음 |
| 가계부 의미 편집 | `POST /mobile/book-meaning` | title/category/memo/inclusion override만 수정, 금융 원본 보존 |
| 금융 거래 목록/상세 | `GET /transactions`, `/transactions/{id}` | 기존 별도 금융 정정 계약, 영향·버전 검사 유지 |
| 달력/통계 | 기존 `/bookkeeping` 집계 및 `/mobile/savings-trend?from&to&unit` | 기존 기간·카테고리 의미와 2단계 분류 유지 |
| AI 대상 미리보기 | `POST /ai/classification/recommendations/preview` | ONE·SELECTED·REASSESS, 서버 적격성·스냅샷·비용 확인 |
| AI 실행/복원 | `POST …/start`, `GET …/runs/{requestId}` | 암호화 requestId/원본문 기록 후 전송, 복원은 결과 조회 |
| AI 초안/선택/설명 | `GET …/drafts`, `PUT …/drafts/{id}/selection`, `POST …/context` | 서버 초안이 권위; 로컬 미저장 변경은 소유자별 암호화 |
| AI 후보 결정 | `POST …/drafts/{id}/decision` | KEEP·ADOPT·KEEP_LATEST, 후보 채택은 확정 저장이 아님 |
| AI 확정/부분 실패 | `POST …/save`, `GET …/save-outcomes/{requestId}` | 항목별 SAVED·FAILED_KNOWN·STALE_CONFLICT·OUTCOME_UNKNOWN 표시 |
| AI 복구/예산 | 기존 `/saves/{id}/recovery`, `/items/{id}/recovery`, `/usage` | 실제 상태별 복구, 동적 공유 USD 한도, 임의 완료/예산 환급 금지 |
| 확인 필요 | `GET /ai/workbench`, `/ai/items/{id}?kind` | 서버 reason·state·버전·canUndo 사용; category-only는 검토 완료로 처리하지 않음 |
| 검토 보류/완료 | `POST /mobile/review-decisions` | 공유 `MoneyAiService.decide`의 검증과 결과 사용 |
| 미인식 원문 금융 확정 | `POST /mobile/raw-confirmations` | 공유 `MoneyProductService.reviewPost`, 금액·방향·계좌 확인 |
| 검토 취소 | `POST /mobile/review-undo` | 기존 사건·최신 버전·되돌리기 적격성 검사 |
| 빠른 입력 | `POST /mobile/entries` | EXPENSE·INCOME·TRANSFER·REFUND, 실제 금융 저장 확인 후 닫기 |
| 자금/계좌/대출 | 기존 `/mobile/funds`, `/mobile/accounts`, `/accounts`, `/loans` | 공유 잔액·기준일·자금그룹; 대규모 정정·복잡 매칭은 Web |
| 설정/로그인/Bridge | 기존 Supabase 및 Android collector | 사용자 세션과 Bridge credentials 별도; allowlist/암호화 큐 변경 없음 |

생략 기호 `…`는 `/ai/classification/recommendations`다. 세부 DTO와 금융 의미는
`money-bookkeeping-ai-v2.md`, `money-ai-web-v1.md`, `money-financial-core.md`,
`money-meaning-core.md` 및 실제 Controller/Service가 기준이다.

## 추가 모바일 명령

기존 `MoneyCommandService`에 얇은 transport wrapper를 추가했다. requestId는 UUID이고
JWT owner를 서버에서 결정한다. client owner/userId로 접근 권한을 바꿀 수 없다.

- `/entries`: `{requestId, transaction: Entry, bookkeepingIncluded}`.
  새 거래만 허용한다. expectedVersion은 null, 금융 excluded는 false.
  지출의 가계부 제외는 같은 원자적 명령에서 의미 override로 반영한다.
- `/book-meaning`: `{requestId, transactionId, edit: BookkeepingEdit}`.
- `/review-decisions`: `{requestId, decision: Decision}`.
- `/raw-confirmations`: `{requestId, review: ReviewPost}`.
- `/review-undo`: `{requestId, eventId}`.
- `GET /mobile/commands/{requestId}`: 공유 durable outcome 조회.

동일 owner·requestId·command·payload는 최초 결과를 재생한다. 다른 payload 재사용은
거부한다. canonical 서비스 실패는 nested transaction을 rollback하고 NOT_APPLIED를
남긴다. 결과가 APPLIED임을 확인하기 전에는 UI 성공 또는 다음 검토를 표시하지 않는다.
전송 응답 유실은 UNKNOWN이다. 원 requestId·본문을 보존하고 결과를 조회한다.
서버가 미발견/미적용 상태임을 확인한 뒤 명시적인 동일 요청 재전송만 허용한다.
401은 동일 세션에서 한 번 갱신하고, 403은 권한 오류로 표시한다.
로그아웃·owner/환경 변경 후 도착한 응답은 새 세션 캐시를 변경하지 않는다.

## 검증 경계

`MoneyMobileCommandPostgresTest`는 개별 합성 owner와 소유 스키마에서 금융 원본 보존,
정확한 재생, 실패 rollback, 사용자 격리, 검토 취소 및 범주 누락의 독립성을 확인한다.
`MoneyBridgeSecurityTest`는 ingest 토큰으로 모든 모바일 명령/조회가 403임을 확인한다.
Android `OperationTest`, `SessionTest`는 기록 손상·부분 결과·후발 응답·재시작 경계를 확인한다.
`MoneyV2Test`와 두 단계 `MoneyV2PersistenceTest`는 격리된 HTTPS 서버에서 실행한다.
phaseOne → ADB force-stop → phaseTwo는 실제 새 프로세스에서 원 요청 결과를 조회한다.

외부 AI 제공자 호출과 실제 사용자 금융 쓰기를 QA에 사용하지 않는다. 합성 내부 추천
검증을 실제 제공자 응답 성공으로 해석하지 않는다. Galaxy Z Flip6/One UI 수락은 연결된
실기기에서 별도 검증해야 한다. 최종 QA·배포 상태는 closeout의 실제 증거로 판단한다.
