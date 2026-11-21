import type { Loan } from "@/app/money/MoneyWebData";

export const loanStatuses: Record<Loan["status"], string> = {
  ACTIVE: "상환 중",
  COMPLETED: "완료",
  PAUSED: "일시 중지",
  INACTIVE: "비활성",
};

export const loanColumns = {
  rate: "금리",
  original: "최초 원금 / 한도",
  allocation: "상환 배분",
  latest: "최근 확정 상환",
};

export type LoanColumn = keyof typeof loanColumns;
export type LoanFilters = {
  status: Loan["status"] | "all";
  search: string;
  lender: string;
  allocation: "all" | "pending" | "clear";
  sort: "high" | "low" | "name";
};

export function loanOutstanding(loan: Loan) {
  return loan.facilityLimit != null ? loan.usedPrincipal ?? null : loan.remainingPrincipal;
}

export function loanMetrics(loans: Loan[] | null) {
  if (!loans) return { outstanding: null, remaining: null, active: null, unresolved: null };
  const balances = loans.map(loanOutstanding);
  return {
    outstanding: balances.some(value => value == null) ? null : balances.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    remaining: balances.filter(value => value != null && value > 0).length,
    active: loans.filter(loan => loan.status === "ACTIVE").length,
    unresolved: loans.some(loan => loan.unresolvedAllocationCount == null)
      ? null : loans.reduce((sum, loan) => sum + (loan.unresolvedAllocationCount ?? 0), 0),
  };
}

export function filterLoans(loans: Loan[], filters: LoanFilters) {
  const search = filters.search.trim().toLocaleLowerCase("ko-KR");
  return loans.filter(loan =>
    (filters.status === "all" || loan.status === filters.status)
    && (!filters.lender || filters.lender === loan.lender)
    && (filters.allocation === "all" || (filters.allocation === "pending"
      ? (loan.unresolvedAllocationCount ?? 0) > 0 : loan.unresolvedAllocationCount === 0))
    && [loan.name, loan.lender, loan.type].some(value => value.toLocaleLowerCase("ko-KR").includes(search))
  ).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
    if (filters.sort === "name") return byName;
    const left = loanOutstanding(a), right = loanOutstanding(b);
    if (left == null) return right == null ? byName : 1;
    if (right == null) return -1;
    return (filters.sort === "low" ? left - right : right - left) || byName;
  });
}

export function parseLoanRate(value: string): number | null | undefined {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:\d+(?:\.\d{1,4})?|\.\d{1,4})$/.test(text)) return undefined;
  const rate = Number(text);
  return rate <= 100 ? rate : undefined;
}
