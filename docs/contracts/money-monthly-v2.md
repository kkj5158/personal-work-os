# MONEY monthly savings read contract

`GET /api/money/bookkeeping/savings?from=YYYY-MM-DD&to=YYYY-MM-DD`
returns `totals`, `items`, and `total`. Dates are inclusive Seoul calendar dates.
Optional `destinationAccountId`, `search`, `limit` (1–200), and `offset` affect
only the deposit rows and their count. The UI requests 50 rows per page.

Savings is a read projection of non-excluded, non-merged canonical `TRANSFER`
records between two owner accounts. Source observations are not joined, so
multiple notifications for one transfer cannot multiply contributions. At each
transaction's occurrence time, both endpoint groups come from the latest
`money_account_fund_group_history.effective_at` at or before that instant.

`gross` is LIVING/OTHER → SAVINGS deposits. `withdrawals` is SAVINGS →
LIVING/OTHER withdrawals. `net = gross - withdrawals` may be negative.
SAVINGS → SAVINGS and general → general transfers contribute zero. External
income/expense, balances, refund matching, savings purposes, and withdrawal
return links are outside this projection.

`composition` groups gross deposits by destination account. Unknown historical
groups or any non-KRW boundary transfer make aggregate amounts unavailable
(`null`) and composition empty; deposit rows retain their currency. No current
account group fallback or currency conversion is performed. The historical
baseline migration freezes the existing classification at V2 rollout; subsequent
group changes affect transactions occurring at or after their effective instant.

Monthly income/expense totals and category composition reuse the existing
bookkeeping/tracking contract without table filters. Chart selections affect
only the lower table, and chart centers always show their month totals.

## 월간 가계부 대출상환 통계 (2026-11-22)

월간 조회는 `bookkeepingScope=true`를 보낸다. 소비·수입과 연결 환불은 저장된 유형별 추적 계좌를 사용한다. 지출 환불은 원거래 출금 계좌에 귀속된다. 이 화면에서는 계좌의 전역 `include_in_statistics` 값으로 소유자의 선택을 제한하지 않는다. 일반 소비 및 수입의 목록·구성·추이와 소비 관계에는 대출상환이 들어가지 않는다.

`GET /api/money/bookkeeping/unified/loan-repayments`는 같은 기간의 확정·활성·병합되지 않은 KRW 상환 전액을 집계한다. 월간 모드에서는 저장된 지출 추적 계좌와 출금 계좌를 비교한다. 임시 계좌 선택은 교집합이다. 계좌 목록을 전송하지 않으면 서버가 저장된 선택을 사용하며, 빈 선택은 0건이다. 기존 전역 호출은 월간 모드를 명시하지 않으면 기존 계좌 범위를 사용한다.

| 응답 또는 상세 조회 | 의미 |
| --- | --- |
| `loanRepayment` | 원금·이자·수수료와 배분 미확정액을 합한 전체 상환액 |
| `loanRepaymentBreakdown.byPart` | 완전히 배분된 거래의 원금·이자·수수료 각 합계 |
| `unallocatedAmount`, `unallocatedCount` | 배분 미확정 거래의 전체 금액과 건수 |
| `loanRepaymentBreakdown.byLoan` | 대출별 전체 상환액. 연결되지 않은 거래는 대출 ID가 null인 그룹 |
| `unified?repaymentGroup=<id 또는 unlinked>` | 같은 기간과 추적 계좌의 해당 그룹 전체 |
| `unified?repaymentPart=PRINCIPAL/INTEREST/FEE/UNALLOCATED` | 배분 완료 거래에서 해당 금액이 양수인 행, 또는 배분 미확정 행 |

금액은 정확한 십진 문자열이다. 대출별 합계와 배분별 합계(미확정 포함)는 각각 전체 상환액과 일치한다. 상환을 조회하는 동안 원금 잔액, 현금 이동, 원본 연결 또는 생활 분류를 변경하지 않는다.

계좌 거래장에서 소유자가 상환으로 지정하고 대출 연결·배분을 남겨 둔 출금은 `declaredFinancialType=LOAN_PAYMENT`, `relationStatus=LOAN_SPLIT_PENDING`인 기존 확인 경로를 따른다. 이 출금은 배분 미확정 그룹에 한 번만 포함된다. 단순 미분류 출금은 포함하지 않는다. `byPart.unallocated`를 사용하던 호출자도 같은 미확정 합계를 받는다.
