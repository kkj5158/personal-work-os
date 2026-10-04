import type { Account } from "./model";

/** Web role groups preserve server order. Fund order and tracking are separate. */
export const accountGroupRegistry = [
  { id: "income", label: "수입 계좌", roles: ["INCOME_HUB"] },
  { id: "spending", label: "소비 계좌", roles: ["SPENDING", "FIXED_SPENDING"] },
  { id: "savings", label: "저축 · 적금", roles: ["SAVINGS_GATEWAY", "SAVINGS", "PURPOSE_SAVINGS", "PURPOSE_INSTALLMENT"] },
  { id: "other", label: "기타", roles: ["CASH"] },
  { id: "unknown", label: "미분류", roles: [] },
] as const;
export function webAccountGroup(role: string | null | undefined) {
  return accountGroupRegistry.find(g => (g.roles as readonly string[]).includes(role ?? "")) ?? accountGroupRegistry[4];
}
export function groupedWebAccounts(accounts: Account[]) {
  return accountGroupRegistry.map(g => ({ ...g, accounts: accounts.filter(a => webAccountGroup(a.role).id === g.id) }));
}
export const fundLabels = { LIVING: "생활", SAVINGS: "저축", OTHER: "기타" };
export function moneyAmount(amount: number | null | undefined, currency = "KRW") {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const value = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(amount);
  return currency === "KRW" ? `${value}원` : `${value} ${currency}`;
}
export function repaymentProgress(original: number | null, remaining: number): number | null {
  return original != null && original > 0 && remaining >= 0 && remaining <= original
    ? (original - remaining) / original * 100 : null;
}
export function orderedRepresentatives(ids: string[], accounts: Account[], expanded: boolean) {
  return ids.slice(0, expanded ? 10 : 5).map(id => accounts.find(a => a.id === id)).filter((a): a is Account => !!a);
}
export function periodWaterfall(income: number, spending: number, savings: number, principal: number) {
  const changes = [income, -spending, -savings, -principal];
  let end = 0;
  const steps = changes.map(change => { const start = end; end += change; return {start,end,change}; });
  return [...steps, { start: 0, end, change: end }];
}
