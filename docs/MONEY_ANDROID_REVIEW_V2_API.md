# MONEY Android 금융 검토 V2 API 인계

2026-10-17 KST. 구현 브랜치 `codex/money-review-complete-20261017`.

기존 자동 입장·owner review·일괄 검토 계약은 유지한다. 아래 수동 확인은 사용자가 직접 선택하는 별도 계약이며, 정상 owner 요청 실패나 인증·통신 오류에 대한 자동 fallback이 아니다.

| API | 역할 |
| --- | --- |
| `GET /api/money/review/manual/v2/{rawId}` | 소유한 미해결 원문, 최신 분석 시도, processing version, fingerprint. 파싱 성공을 전제로 하지 않는다. |
| `POST /api/money/review/manual/v2/{rawId}` | UUID를 보존하는 명시적 사용자 확인. 원문 연결, 금융 사실, 환불·대출 관계, 검토 이벤트를 함께 저장한다. |
| `POST /api/money/review/manual/v2/transactions/{transactionId}` | 기존 거래의 이체 연결·별개 거래 판단, 미연결 환불, 대출 원금·이자·수수료 보완. |
| `GET /api/money/mobile/commands/{requestId}` | 기존 공통 결과 조회. `APPLIED`, `NOT_APPLIED`, `UNKNOWN`을 구분한다. |
| `GET /api/money/bookkeeping?...&allPeriod=true` | 실제 effective projection의 전체 날짜 범위. 기존 조회와 같은 추적 계좌·필터·페이지 의미를 사용한다. |
| `GET /api/money/bookkeeping?...&currency=USD` | 통화를 명시한 합계·카테고리 구성·날짜별 추이. 미지정한 혼합 통화의 기존 집계 불가 처리는 유지한다. |
| `GET /api/money/bookkeeping/savings?...&currency=USD` | 같은 통화의 canonical 이체로 저축 입금·인출·순액을 집계한다. |
| `GET /api/money/mobile/currencies` | 소유 금융 거래에 존재하는 통화와 KRW. |
| `GET /api/money/mobile/accounts/{accountId}/currency-movements` | 계좌별 기록된 순변동을 통화별로 반환한다. 기초 잔액의 확인을 의미하지 않는다. |

수동 확인 body는 `requestId`, `sources[{id,version,fingerprint,direction?}]`, `action`, `type`, `accountId/accountVersion`, `otherAccountId/otherAccountVersion`, 양수 `amount`, ISO `currency`, `occurredAt`, `timeSource`, `counterparty`, `note`, 선택한 실제 기존 거래·환불 원거래·대출의 ID와 버전, `principal/interest/fee`, `impactAccepted`를 받는다. 액션은 `REGISTER_SEPARATE` 또는 `LINK_DUPLICATE`다. 이체는 출금 계좌가 `accountId`, 입금 계좌가 `otherAccountId`이며, 원문 두 개를 함께 연결할 때 각 출처의 방향을 OUT/IN으로 구분한다.

금액은 `BigDecimal`로 검사·저장한다. 원 통화의 소수 자릿수를 검증하고 환율을 추정하지 않는다. KRW 기반의 기존 계좌 잔액·대출 계약에 외화를 더하지 않는다. 대출 확인은 기존 canonical KRW 계약을 사용한다. 외화 대출 관계는 이 계약에서 지원하지 않는다.

파싱이 실패한 원문은 실패 parse attempt를 성공 근거로 가장하지 않는다. 원문·분석 시도는 원본 테이블에 보존하고, source evidence에는 원문/분석 ID·버전·fingerprint와 사용자 assertion을 별도로 남긴다. 수동 확인의 잔액 반영 시각은 입력한 거래 발생 시각이다.

공통 command 서비스의 소유자 lock·원자적 결과 저장·동일 UUID/본문 replay를 재사용한다. source uniqueness, 활성 소유 계좌, 알려진 금융기관·통화, 원문·선택 관계 버전, 환불 잔액, 대출 원금 제약을 서버에서 검사한다. 원문 확인의 모든 경로에서 자동 classification job을 `REVIEW_ADMISSION_ONLY`로 보호하며 새 수동 거래는 분류 규칙을 실행하지 않는다. 기존 거래 중복 연결은 DIRECT 분류를 변경하지 않는다.

새 Flyway 파일 `V88__money_owner_loan_receipt.sql`은 `LOAN_RECEIPT`와 그 금융 shape 제약을 추가하고, transaction amount를 `NUMERIC(24,6)`으로 확장한다. 기존 migration을 수정하거나 과거 사실을 새 유형으로 변환하지 않는다. 대출 입금은 계좌 자산·대출 잔여 원금을 함께 증가시키고 일반 수입/소비에서 제외한다. 기존 등록 취소/복원은 대출 입금에 반대 방향의 원금 증감을 적용한다. DB 열 축소 또는 V88 파일 삭제를 운영 rollback으로 사용하면 안 된다.

배포는 별도 검증 사항이다. 기존 Web이 새 유형을 잘못 편집하거나 상환으로 표시하지 않도록 필요한 타입·상세·대출 이력만 확장했다. 네이티브 검증, 기존 키에 의한 업데이트 APK, hosted DEV 검증은 QA 결과를 참조한다. 이 문서 자체는 배포 또는 인수 통과의 증거가 아니다.
