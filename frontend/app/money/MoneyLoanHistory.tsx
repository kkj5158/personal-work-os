"use client";

import { useEffect, useRef, useState } from "react";
import { moneyAmount } from "@/lib/money/accounts";
import { moneyApi, type Account, type Transaction, seoul } from "@/lib/money/model";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import type { Props } from "./MoneyEditors";

export type Repayment = {
  type: Transaction["type"];
  id: string;
  occurredAt: string;
  paymentAccountId: string | null;
  amount: number;
  currency: string;
  principal: number | null;
  interest: number | null;
  fee: number | null;
  remainingPrincipal: number | null;
  usedPrincipalAfter?: number | null;
  unresolved: boolean;
};

type HistoryProps = {
  loan: Loan;
  accounts: Account[];
  select: Props["select"];
};

export function LoanHistoryRows({ result, loan, accounts, select }: HistoryProps & {
  result: ReturnType<typeof useMoneyData<Repayment[]>>;
}) {
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function open(id: string) {
    setOpening(true);
    setError("");
    try {
      const transaction = await moneyApi.get<Transaction>(`/transactions/${id}`);
      if (active.current) select({ kind: "transaction", value: transaction });
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "연결 거래를 조회할 수 없습니다.");
    } finally {
      if (active.current) setOpening(false);
    }
  }

  return <section className="money-card money-loan-history">
    <h3>입금·상환 이력</h3>
    <p className="money-muted">배분 미확정 납부는 잔여 원금을 변경하지 않습니다.</p>
    <LoadState {...result} hideLastChecked />
    {error && <p role="alert">{error}</p>}
    {result.data?.length ? <div className="money-table-scroll" role="region" aria-label="상환 이력 스크롤" tabIndex={0}>
      <table aria-label="상환 이력">
        <thead><tr>{["날짜", "거래 계좌", "거래액", "원금", "이자", "수수료", loan.facilityLimit != null ? "거래 후 사용액" : "남은 원금"]
          .map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{result.data.map(row => <tr key={row.id}>
          <td>
            <button type="button" className="money-row-button" disabled={opening} onClick={() => void open(row.id)}>
              {seoul(row.occurredAt).replace("T", " ")}
            </button>
            {row.type === "LOAN_RECEIPT" && <small>대출 입금</small>}
            {row.type === "LOAN_PAYMENT" && <small>{row.unresolved ? "배분 미확정" : "배분 확정"}</small>}
          </td>
          <td>{accounts.find(account => account.id === row.paymentAccountId)?.displayName ?? "—"}</td>
          <td>{moneyAmount(row.amount, row.currency)}</td>
          {[row.principal, row.interest, row.fee].map((value, index) =>
            <td key={index}>{value == null ? "미확인" : moneyAmount(value, row.currency)}</td>)}
          <td>{moneyAmount(loan.facilityLimit != null ? row.usedPrincipalAfter : row.remainingPrincipal)}</td>
        </tr>)}</tbody>
      </table>
    </div> : result.data && <p className="money-empty">입금·상환 기록이 없습니다.</p>}
  </section>;
}
