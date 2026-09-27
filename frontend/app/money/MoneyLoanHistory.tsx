"use client";
import { type Account, seoul, won } from "@/lib/money/model";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import { type Props } from "./MoneyEditors";
type Repayment = {
  memo: string | null;
  title: string | null;
  id: string;
  occurredAt: string;
  paymentAccountId: string;
  amount: number;
  principal: number | null;
  interest: number | null;
  fee: number | null;
  remainingPrincipal: number;
  unresolved: boolean;
  version: number;
};
export function LoanHistory({
  loan,
  accounts,
  select,
}: {
  loan: Loan;
  accounts: Account[];
  select: Props["select"];
}) {
  const { data, error, loading } = useMoneyData<Repayment[]>(
    `/loans/${loan.id}/repayments`,
  );
  return (
    <section className="money-card">
      <h2>{loan.name} · 상환 이력</h2>
      <p className="money-muted">
        기록된 상환 사실 기준 · 구성 미확인 납부는 잔여 원금을 변경하지
        않습니다.
      </p>
      <LoadState error={error} loading={loading} />
      <div className="money-table-scroll">
        <table aria-label="상환 이력">
          <thead>
            <tr>
              {[
                "날짜",
                "납부 계좌",
                "총 납부액",
                "원금",
                "이자",
                "수수료",
                "남은 원금",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr
                key={r.id}
                onClick={() =>
                  select({
                    kind: "transaction",
                    value: {
                      id: r.id,
                      type: "LOAN_PAYMENT",
                      loanId: loan.id,
                      fromAccountId: r.paymentAccountId,
                      amount: r.amount,
                      occurredAt: r.occurredAt,
                      version: r.version,
                      memo: r.memo,
                      title: r.title,
                    },
                  })
                }
              >
                <td>
                  <button type="button" className="money-row-button">
                    {seoul(r.occurredAt).replace("T", " ")}
                  </button>
                  {r.unresolved && <small>구성 미확인</small>}
                </td>
                <td>
                  {
                    accounts.find((a) => a.id === r.paymentAccountId)
                      ?.displayName
                  }
                </td>
                <td>{won(r.amount)}</td>
                {[r.principal, r.interest, r.fee].map((v, i) => (
                  <td key={i}>{v === null ? "미확인" : won(v)}</td>
                ))}
                <td>{won(r.remainingPrincipal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && !data.length && (
        <p className="money-empty">상환 기록이 없습니다.</p>
      )}
    </section>
  );
}
