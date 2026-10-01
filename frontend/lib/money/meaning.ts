export type MeaningKind = "EXPENSE" | "INCOME";
export type Tracking = { version: number; expense: string[]; income: string[] };
export type RuleCondition = {
  field: "type" | "accountId" | "merchant" | "title";
  operator: "EXACT" | "CONTAINS" | "STARTS_WITH";
  value: string;
};
export type MeaningRule = {
  id?: string;
  name: string | null;
  merchant?: string | null;
  categoryId: string | null;
  titleDefault: string | null;
  memoDefault: string | null;
  conditions: RuleCondition[];
  priority: number;
  status: "ACTIVE" | "PAUSED" | "INACTIVE";
  origin: "MANUAL" | "AI_APPROVED";
  version: number;
  legacy?: boolean;
};
export type ReviewLane = "DECISION" | "FORMAT";
export type ReviewCandidate = {
  provider?: string;
  amount: number;
  direction: "IN" | "OUT";
  occurredAt: string;
  postedAt?: string;
  counterpartyText?: string;
  sourceAccountHint?: string;
  destinationAccountHint?: string;
  postBalance?: number;
};
export type ReviewItem = {
  id: string;
  kind: "RAW" | "TRANSACTION";
  reason: string;
  lane?: ReviewLane;
  state: string;
  occurredAt: string;
  title: string | null;
  merchant: string | null;
  amount: number | null;
  accountId: string | null;
  categoryId: string | null;
  memo: string | null;
  type: string | null;
  version: number;
  overrideVersion: number;
  projectionVersion: number;
  candidate: ReviewCandidate | null;
  /** Unique opposite-direction, same-amount partner (suggestion only; never auto-posted). */
  transferPartnerId?: string | null;
  transferCandidates?: number;
  noiseSuspected?: boolean;
};
/** Human-facing review reasons. Internal codes stay visible only under system information. */
export const reviewReasons: Record<string, string> = {
  CATEGORY_UNCONFIRMED: "분류 확인",
  REFUND_LINK_REQUIRED: "환불 원거래 연결",
  LOAN_SPLIT_REQUIRED: "대출 상환 구성",
  UNRESOLVED_SOURCE: "알림 확인",
  POSSIBLE_INTERNAL_TRANSFER: "내 계좌 간 이체로 보임",
  UNMATCHED_OR_EXTERNAL_UNPROVEN: "상대 계좌 미확인 · 외부 거래인지 확인",
  ACCOUNT_RESOLUTION_REQUIRED: "등록된 계좌와 연결되지 않음",
  AMBIGUOUS_TRANSFER_PAIR: "이체 짝 후보가 여러 건",
  POSSIBLE_ALREADY_POSTED_ROUTE: "이미 기록된 이체와 중복 의심",
  AUXILIARY_PRIMARY_MISSING_OR_AMBIGUOUS: "적금 입금 확인 알림의 원거래 불명확",
  MISSING_OWN_SIDE: "내 계좌 쪽을 찾지 못함",
  SAME_ACCOUNT_ROUTE: "출발·도착 계좌가 같음",
  MULTIPLE_ATTEMPTS_SUPPLIED: "해석 결과 충돌",
  RESTORED_BY_OWNER: "무시했다가 다시 검토로 복원",
  UNRECOGNIZED_SHAPE: "알 수 없는 알림 형식",
  UNSUPPORTED: "지원하지 않는 알림 출처",
  PARSER_ERROR: "알림 해석 오류",
  INCOMPLETE_CANDIDATE: "거래 시각 정보 부족",
  MISSING_PARSE_ATTEMPT: "해석 기록 없음",
};
export const ignoredReasons: Record<string, string> = {
  IGNORED_NON_FINANCIAL: "자동 무시 · 거래 문구 없음",
  USER_IGNORED_NON_FINANCIAL: "사용자 판단 · 거래 아님",
  USER_EXCLUDED: "사용자 판단 · 자동 처리 제외",
};
export type ReviewStage = { label: string; status: "ok" | "fail" | "warn" | "na"; detail: string };
/** Pipeline stages in plain language: detection → amount → direction → account → transfer → decision. */
export function reviewStages(item: ReviewItem): ReviewStage[] {
  const reason = reviewReasons[item.reason] || item.reason;
  if (item.kind === "TRANSACTION")
    return [
      { label: "금융 사실", status: "ok", detail: "원장에 기록됨" },
      item.reason === "POSSIBLE_INTERNAL_TRANSFER"
        ? { label: "이체 매칭", status: "warn", detail: "같은 금액의 반대 방향 거래가 가까운 시각에 1건" }
        : { label: "이체 매칭", status: "na", detail: "해당 없음" },
      { label: "검토 사유", status: "warn", detail: reason },
    ];
  const c = item.candidate;
  const format = item.lane === "FORMAT";
  const accountFailed = ["ACCOUNT_RESOLUTION_REQUIRED", "MISSING_OWN_SIDE", "SAME_ACCOUNT_ROUTE"].includes(item.reason);
  const transfer: ReviewStage = item.transferPartnerId
    ? { label: "이체 매칭", status: "warn", detail: "짝이 되는 반대 방향 알림 1건 (확정 전)" }
    : item.reason === "AMBIGUOUS_TRANSFER_PAIR" || (item.transferCandidates ?? 0) > 1
      ? { label: "이체 매칭", status: "fail", detail: "짝 후보가 여러 건 · 자동 확정하지 않음" }
      : format || !c
        ? { label: "이체 매칭", status: "na", detail: "해석 전" }
        : { label: "이체 매칭", status: "fail", detail: "짝이 되는 알림 없음" };
  return [
    format
      ? { label: "거래 알림 판별", status: "fail", detail: item.noiseSuspected ? "거래가 아닌 알림으로 보임" : "금융 알림으로 보이나 형식 미지원" }
      : { label: "거래 알림 판별", status: "ok", detail: "거래 알림" },
    c?.amount ? { label: "금액 추출", status: "ok", detail: c.amount.toLocaleString("ko-KR") + "원" } : { label: "금액 추출", status: format ? "fail" : "na", detail: "추출되지 않음" },
    c?.direction ? { label: "입출금 방향", status: "ok", detail: c.direction === "IN" ? "입금" : "출금" } : { label: "입출금 방향", status: format ? "fail" : "na", detail: "확인되지 않음" },
    format || !c ? { label: "계좌 매칭", status: "na", detail: "해석 전" } : accountFailed ? { label: "계좌 매칭", status: "fail", detail: "등록 계좌를 특정하지 못함" } : { label: "계좌 매칭", status: "ok", detail: "등록 계좌 확인" },
    transfer,
    { label: "최종 검토 사유", status: "warn", detail: reason },
  ];
}
const PRODUCT = /([가-힣A-Za-z]+)\s*\(([0-9]{1,4})\)/;
/** Mirrors the server resolver: exact provider + suffix/masked reference, unique active account only. */
export function resolveAccountHint<A extends { id: string; provider: string; suffix?: string | null; maskedReference?: string | null; displayName: string; archived: boolean }>(
  accounts: A[],
  provider: string | undefined,
  hint: string | undefined | null,
): string | null {
  if (!hint || !provider) return null;
  const product = hint.match(PRODUCT);
  const exact = product && product[0] === hint.trim();
  const matches = accounts.filter((a) => !a.archived && a.provider === provider && (exact ? a.suffix === product![2] : a.maskedReference === hint));
  if (matches.length > 1 && exact) {
    const named = matches.filter((a) => a.displayName === product![1] || a.displayName === hint);
    if (named.length === 1) return named[0].id;
  }
  return matches.length === 1 ? matches[0].id : null;
}
export const ruleStatuses = {
  ACTIVE: "활성",
  PAUSED: "일시 중지",
  INACTIVE: "비활성",
};
export const conditionFields = {
  type: "거래 유형",
  accountId: "계좌",
  merchant: "거래처",
  title: "제목",
};
export const conditionOperators = {
  EXACT: "일치",
  CONTAINS: "포함",
  STARTS_WITH: "시작",
};
export function toggleSelection(
  current: string[] | null,
  all: string[],
  id: string,
): string[] {
  const values = new Set(current ?? all);
  if (values.has(id)) values.delete(id);
  else values.add(id);
  return [...values];
}
export function rangeSelection(
  current: string[],
  ordered: string[],
  anchor: string | null,
  target: string,
): string[] {
  const start = anchor ? ordered.indexOf(anchor) : -1,
    end = ordered.indexOf(target);
  if (start < 0 || end < 0) return [...new Set([...current, target])];
  return [
    ...new Set([
      ...current,
      ...ordered.slice(Math.min(start, end), Math.max(start, end) + 1),
    ]),
  ];
}
export function draftRule(row: ReviewItem): MeaningRule {
  return {
    name: row.title || "검토에서 만든 규칙",
    categoryId: row.categoryId,
    titleDefault: row.title,
    memoDefault: row.memo,
    conditions: [
      {
        field: "type",
        operator: "EXACT",
        value: row.type === "INCOME" ? "INCOME" : "EXPENSE",
      },
      ...(row.merchant
        ? [
            {
              field: "merchant" as const,
              operator: "EXACT" as const,
              value: row.merchant,
            },
          ]
        : []),
    ],
    priority: 0,
    status: "ACTIVE",
    origin: "MANUAL",
    version: 0,
  };
}
