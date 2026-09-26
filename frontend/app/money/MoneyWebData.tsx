"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { moneyApi, type AccountBalance, type Kind } from "@/lib/money/model";
export const DataContext = createContext({
  revision: 0,
  get: <T,>(path: string): Promise<T> => moneyApi.get<T>(path),
});
export function useMoneyData<T>(path: string | null) {
  const { get, revision } = useContext(DataContext),
    [result, setResult] = useState<{
      path: string;
      revision: number;
      data: T | null;
      error: string;
    } | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    get<T>(path)
      .then((data) => {
        if (active) setResult({ path, revision, data, error: "" });
      })
      .catch((e) => {
        if (active)
          setResult({
            path,
            revision,
            data: null,
            error: e instanceof Error ? e.message : "불러오지 못했습니다.",
          });
      });
    return () => {
      active = false;
    };
  }, [path, get, revision]);
  return {
    data: result?.path === path ? result.data : null,
    error: result?.path === path ? result.error : "",
    loading: !!path && (result?.path !== path || result?.revision !== revision),
  };
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
  status: "ACTIVE" | "COMPLETED";
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
  };
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
