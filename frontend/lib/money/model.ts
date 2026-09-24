import { apiClient } from "@/lib/api/client";
export type Role =
  | "INCOME_HUB"
  | "SPENDING"
  | "FIXED_SPENDING"
  | "SAVINGS_GATEWAY"
  | "SAVINGS"
  | "PURPOSE_SAVINGS"
  | "PURPOSE_INSTALLMENT"
  | "CASH";
export type Kind = "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND";
export type Account = {
  id: string;
  provider: string;
  displayName: string;
  role: Role;
  maskedReference: string | null;
  suffix: string | null;
  archived: boolean;
  version: number;
  emoji: string | null;
  imageData: string | null;
  fundingAccountId: string | null;
};
export type Balance = {
  amount: number;
  provenance: string;
  asOf: string | null;
};
export type AccountBalance = { account: Account; balance: Balance };
export type Category = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  version: number;
};
export type Rule = {
  id: string;
  merchant: string;
  categoryId: string;
  version: number;
};
export type Source = {
  rawEventId: string;
  parseAttemptId: string | null;
  relationship: string;
  evidence: Record<string, unknown>;
};
export type Transaction = {
  id: string;
  type: Kind;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  currency: string;
  occurredAt: string;
  counterpartyText: string | null;
  sources: Source[];
  categoryId: string | null;
  memo: string | null;
  excluded: boolean;
  version: number;
  manual: boolean;
  refundOf: string | null;
  mergedInto: string | null;
};
export type Raw = {
  id: string;
  sourcePackage: string;
  title: string | null;
  text: string | null;
  bigText: string | null;
  postedAt: string;
  receivedAt: string;
  state: string;
  processingVersion: number;
  processingReason: string | null;
};
export type Candidate = {
  amount: number;
  direction: "IN" | "OUT";
  occurredAt: string;
  counterpartyText: string;
  sourceAccountHint: string;
  destinationAccountHint: string;
};
export type Attempt = {
  id: string;
  status: string;
  parserKey: string;
  parserVersion: string;
  candidate: Candidate | null;
};
export type Flow = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
};
export type Dashboard = {
  month: string;
  income: number;
  consumption: number;
  savingsMovement: number;
  categories: Record<string, number>;
  reviewCount: number;
  flow: Flow[];
};
export type AccountDetail = {
  account: Account;
  balance: Balance;
  inflow: number;
  outflow: number;
  counterparties: Flow[];
  checkpoints: {
    id: string;
    amount: number;
    verifiedAt: string;
    note: string | null;
  }[];
};
export const moneyApi = {
  get: <T>(path: string) => apiClient.get<T>("/api/money" + path),
  post: <T>(path: string, value: unknown) =>
    apiClient.post<T>("/api/money" + path, value),
  put: <T>(path: string, value: unknown) =>
    apiClient.put<T>("/api/money" + path, value),
  delete: (path: string) => apiClient.delete("/api/money" + path),
};
export const roles: Record<Role, string> = {
  INCOME_HUB: "급여·수익 허브",
  SPENDING: "생활비",
  FIXED_SPENDING: "고정·정기지출",
  SAVINGS_GATEWAY: "저축 Gateway",
  SAVINGS: "직접 저축·적금",
  PURPOSE_SAVINGS: "목적별 저축",
  PURPOSE_INSTALLMENT: "목적별 적금",
  CASH: "현금 지갑",
};
export const providers: Record<string, string> = {
  SHINHAN: "신한은행",
  IBK: "기업은행",
  WOORI: "우리은행",
  KAKAO: "카카오뱅크",
  CASH: "현금",
  OTHER: "기타 은행",
};
export const kinds: Record<Kind, string> = {
  INCOME: "수입",
  EXPENSE: "소비",
  TRANSFER: "이체",
  REFUND: "환불",
};
export const won = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(amount) +
  "원";
export const accountName = (a: Account) =>
  `${providers[a.provider] ?? a.provider} - ${a.displayName}`;
export const seoul = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(" ", "T");
export const currentMonth = () => seoul(new Date().toISOString()).slice(0, 7);
export const iso = (local: string) =>
  new Date(local + ":00+09:00").toISOString();
export const provenance = (b: Balance) =>
  b.provenance.startsWith("CALCULATED")
    ? "계산값" +
      (b.provenance.includes("NOTIFICATION")
        ? " · 알림 기준점"
        : b.provenance.includes("MANUALLY")
          ? " · 수동 확인 기준점"
          : " · 시작 잔액 미확인")
    : b.provenance === "NOTIFICATION"
      ? "알림 기준"
      : "수동 확인";
export function groupAccounts(accounts: Account[]) {
  return {
    hubs: accounts.filter((a) => !a.archived && a.role === "INCOME_HUB"),
    spending: accounts.filter(
      (a) =>
        !a.archived && ["SPENDING", "FIXED_SPENDING", "CASH"].includes(a.role),
    ),
    gateways: accounts.filter(
      (a) => !a.archived && a.role === "SAVINGS_GATEWAY",
    ),
    direct: accounts.filter((a) => !a.archived && a.role === "SAVINGS"),
    purpose: accounts.filter(
      (a) => !a.archived && a.role === "PURPOSE_SAVINGS",
    ),
    installment: accounts.filter(
      (a) => !a.archived && a.role === "PURPOSE_INSTALLMENT",
    ),
  };
}
export function donutSegments(amounts: Record<string, number>) {
  const positive = Object.entries(amounts).filter(([, v]) => v > 0);
  const total = positive.reduce((s, [, v]) => s + v, 0);
  let offset = 0;
  return positive.map(([id, amount]) => {
    const percent = (amount / total) * 100;
    const result = { id, amount, percent, offset };
    offset += percent;
    return result;
  });
}
