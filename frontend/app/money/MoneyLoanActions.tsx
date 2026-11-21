"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { moneyApi } from "@/lib/money/model";
import { useMoneyCache } from "./MoneyDataProvider";
import type { Loan } from "./MoneyWebData";

type LoanField = { status: Loan["status"] } | { interestRate: number | null };

export function useLoanFieldSave() {
  const cache = useMoneyCache();
  const saving = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);

  async function refresh() {
    cache.invalidate(key => key === "/loans");
    try {
      await cache.load("/loans");
      setNeedsRefresh(false);
    } catch {
      setNeedsRefresh(true);
    }
  }

  async function save(id: string, expectedVersion: number, field: LoanField) {
    if (saving.current || needsRefresh) return null;
    const status = "status" in field;
    const path = status ? "status" : "interest-rate";
    const label = status ? "대출 상태" : "연 금리";
    const scope = cache.scopeSnapshot();
    saving.current = true;
    setPending(id);
    setError("");
    setNotice("");
    try {
      const saved = await moneyApi.put<Loan>(`/loans/${id}/${path}`, { ...field, expectedVersion });
      if (cache.scopeSnapshot() !== scope) return null;
      cache.update<Loan[]>("/loans", rows => rows.map(row => row.id === id && row.version <= saved.version ? saved : row));
      cache.mutate("loan");
      setNotice(label + " 저장됨");
      return saved;
    } catch (failure) {
      if (cache.scopeSnapshot() !== scope) return null;
      setError(failure instanceof ApiError && failure.status === 409
        ? "다른 변경이 먼저 저장되었습니다. 최신 값을 확인한 뒤 다시 시도하세요."
        : failure instanceof Error ? failure.message : "저장 결과를 확인할 수 없습니다.");
      await refresh();
      return null;
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  return { save, pending, error, notice, needsRefresh, refresh };
}

export function LoanSaveFeedback({ action }: { action: ReturnType<typeof useLoanFieldSave> }) {
  return <>
    {action.error && <p role="alert" className="money-error">{action.error}</p>}
    {action.needsRefresh && <button type="button" onClick={() => void action.refresh()}>최신 대출 다시 조회</button>}
    {(action.pending || action.notice) && <p role="status" className="money-muted">{action.pending ? "저장 중…" : action.notice}</p>}
  </>;
}
