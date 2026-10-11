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
/** V2 grouping follows the independent persisted fund area, retaining server order. */
export function groupedFundAccounts(accounts: Account[]) {
  return (["LIVING", "SAVINGS", "OTHER"] as const).map(id => ({id,label:{LIVING:"생활비",SAVINGS:"저축·적금",OTHER:"기타"}[id],accounts:accounts.filter(a=>(a.fundGroup??"OTHER")===id)}));
}
/** Full legacy update payload: an alias/icon toggle must never erase unrelated metadata. */
export function accountUpdatePayload(account: Account, changes: Partial<Account>) {
  const a={...account,...changes};
  return {expectedVersion:account.version,account:{provider:a.provider,displayName:a.displayName,role:a.role,maskedReference:a.maskedReference,suffix:a.suffix,emoji:a.emoji,imageData:a.imageData,fundingAccountId:a.fundingAccountId,memo:a.memo,includeInAssets:a.includeInAssets,includeInStatistics:a.includeInStatistics}};
}
export type AccountPreferences={accountIds:string[];version:number;layout?:{layoutVersion:number;rows:{id:string;name:string|null;accountIds:string[]}[]}|null};
/** Preserve the persisted overview row layout and unrelated representatives. */
export function toggleRepresentative(current:AccountPreferences,id:string,enabled:boolean) {
  const ids=enabled?[...current.accountIds.filter(v=>v!==id),id]:current.accountIds.filter(v=>v!==id);
  if(ids.length>10)throw new Error("대표 계좌는 최대 10개입니다.");
  let layout=current.layout;
  if(layout){const rows=layout.rows.map(r=>({...r,accountIds:r.accountIds.filter(v=>v!==id)}));if(enabled){const last=rows.at(-1);if(last&&last.accountIds.length<3)last.accountIds.push(id);else{if(rows.length>=5)throw new Error("개요 배치가 가득 찼습니다. 개요에서 배치를 조정하세요.");rows.push({id:"account-"+id,name:null,accountIds:[id]});}}layout={...layout,rows};}
  return {accountIds:layout?layout.rows.flatMap(r=>r.accountIds):ids,expectedVersion:current.version,layout};
}
/** Missing ordinary presentation metadata uses won; explicit original currency stays explicit. */
export function displayCurrency(currency?:string|null) { return currency?.trim() || "KRW"; }
export function moneyAmount(amount: number | null | undefined, currency?:string|null) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const value = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(amount);
  const resolved=displayCurrency(currency);
  return resolved === "KRW" ? `${value}원` : `${value} ${resolved}`;
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
