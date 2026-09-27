"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { type AccountBalance, type Kind } from "@/lib/money/model";
import { EMPTY, resourceKey } from "@/lib/money/cache";
import { useMoneyCache } from "./MoneyDataProvider";
export function useMoneyData<T>(path: string | null) {
  const cache = useMoneyCache(), key = path ? resourceKey(path) : null;
  const subscribe = useCallback((fn: () => void) => key ? cache.subscribe(key, fn) : () => {}, [cache, key]);
  const snapshot = useCallback(() => key ? cache.snapshot(key) : EMPTY, [cache, key]);
  const result = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  useEffect(() => { if (key) void cache.load(key).catch(() => {}); }, [cache, key]);
  useEffect(() => {
    if (!key) return;
    if (!result.loading && !result.error && !result.expiresAt) void cache.load(key).catch(() => {});
    const expire = () => cache.expire(key);
    const timer = result.expiresAt ? window.setTimeout(expire, Math.max(0, result.expiresAt - Date.now())) : null;
    window.addEventListener("focus", expire);
    document.addEventListener("visibilitychange", expire);
    return () => { if (timer !== null) window.clearTimeout(timer); window.removeEventListener("focus", expire); document.removeEventListener("visibilitychange", expire); };
  }, [cache, key, result]);
  return { data: result.data as T | null, error: result.error, loading: !!key && (result.loading || (!result.expiresAt && !result.error)) };
}
export function LoadState({
  error,
  loading,
}: {
  error: string;
  loading: boolean;
}) {
  return error ? (
    <p role="alert" className="money-error">
      {error}
    </p>
  ) : loading ? (
    <p role="status" className="money-muted">
      불러오는 중…
    </p>
  ) : null;
}
export type BookFields = {
  title: string;
  memo: string | null;
  categoryId: string | null;
  amount: number;
  accountId: string;
  counterpartyText: string | null;
  occurredAt: string;
  excluded: boolean;
};
export type BookRow = BookFields & {
  id: string;
  type: Kind;
  version: number;
  transactionVersion: number;
  overrides: Partial<BookFields>;
  source: BookFields;
  refundOf: string | null;
};
export type BookPage = {
  items: BookRow[];
  total: number;
  summary: { total: number; count: number };
  composition: {
    categoryId: string | null;
    counterpartyText: string | null;
    amount: number;
    count: number;
  }[];
  trend: { day: string; amount: number }[];
};
export type Loan = {
  id: string;
  name: string;
  lender: string;
  type: string;
  originalPrincipal: number | null;
  remainingPrincipal: number;
  interestRate: number | null;
  monthlyPayment: number | null;
  paymentDay: number | null;
  nextDueDate: string | null;
  paymentAccountId: string | null;
  startDate: string | null;
  maturityDate: string | null;
  status: "ACTIVE" | "COMPLETED" | "PAUSED" | "INACTIVE";
  memo: string | null;
  version: number;
  updatedAt: string;
};
export type OverviewData = {
  from: string;
  to: string;
  kpis: {
    income: number;
    consumption: number;
    savings: number;
    assets: number;
    loans: number;
    netWorth: number;
    loanPrincipal: number;
    unresolvedLoanPayments: number;
  };
  relationships: FlowSummary[];
  balances: AccountBalance[];
  balanceAsOf: string;
  balanceBasis: string;
  loanBasis: string;
  loanAsOf: string | null;
  unverifiedBalances: number;
  flow: {
    type: Kind;
    fromAccountId: string | null;
    toAccountId: string | null;
    counterpartyText: string | null;
    meaning: string;
    net: number;
    gross: number;
    count: number;
  }[];
  composition: {
    type: Kind;
    categoryId: string | null;
    counterpartyText: string | null;
    toAccountId: string | null;
    income: number;
    consumption: number;
    savings: number;
  }[];
  trend: {
    day: string;
    income: number;
    consumption: number;
    savings: number;
  }[];
};

export type FlowSummary = { relation: string; net: number; gross: number; count: number; average: number };
