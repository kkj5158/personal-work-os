"use client";
import { useState } from "react";
import {
  type Account,
  type Transaction,
  type Reconciliation,
  moneyApi as api,
  won,
  seoul,
  iso,
  kinds,
} from "@/lib/money/model";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import { EditorForm, SystemInfo, type Props } from "./MoneyEditors";
import { Field, AccountOptions } from "./MoneyForms";
import { MoneyPanel } from "./MoneyPanel";

type FinancialDetail = {
  loanId: string | null;
  principal: number | null;
  interest: number | null;
  fee: number | null;
  calculatedBalance: number | null;
  verifiedBalance: number | null;
  checkpointId: string | null;
  version: number;
};
type BalanceProps = Props & {
  account: Account;
  type: "INITIAL_BALANCE" | "BALANCE_ADJUSTMENT";
};
/** An existing opening balance is edited in place (audited replace) rather than duplicated. */
export function BalanceEditor(p: BalanceProps) {
  const opening = useMoneyData<{ items: Transaction[] }>(
    p.type === "INITIAL_BALANCE"
      ? `/transactions?accountId=${p.account.id}&type=INITIAL_BALANCE&limit=1`
      : null,
  );
  if (p.type === "INITIAL_BALANCE" && !opening.data)
    return (
      <MoneyPanel title="초기 잔액" onClose={p.onClose}>
        <LoadState error={opening.error} loading={opening.loading} />
      </MoneyPanel>
    );
  const existing = opening.data?.items[0];
  return <BalanceForm key={existing?.id ?? "new"} {...p} existing={existing} />;
}
function BalanceForm(p: BalanceProps & { existing?: Transaction }) {
  const [amount, setAmount] = useState(p.existing ? String(p.existing.amount) : ""),
    [at, setAt] = useState(seoul(p.existing?.occurredAt ?? new Date().toISOString())),
    [note, setNote] = useState(p.existing?.memo ?? "");
  const adjustment = p.type === "BALANCE_ADJUSTMENT";
  const [unknownOutcome,setUnknownOutcome]=useState(false);
  const calculated = useMoneyData<{
    amount: number;
    provenance: string;
    asOf: string | null;
  }>(
    adjustment && at
      ? `/accounts/${p.account.id}/calculated-balance?asOf=${encodeURIComponent(iso(at))}`
      : null,
  );
  return (
    <EditorForm
      title={adjustment ? "수동 잔액 조정" : p.existing ? "초기 잔액 수정" : "초기 잔액 등록"}
      saveDisabled={unknownOutcome}
      onClose={p.onClose}
      onSave={async () => {
        if (
          adjustment &&
          (!calculated.data || calculated.loading || calculated.error)
        )
          throw new Error("계산 잔액을 확인한 뒤 저장하세요.");
        const latest = await api.get<Account>(`/accounts/${p.account.id}`);
        if(latest.version !== p.account.version || latest.archived) throw new Error("계좌 버전이 변경되었습니다. 초안을 유지했습니다. 최신 근거를 다시 확인하세요.");
        const atInstant=p.existing && at === seoul(p.existing.occurredAt) ? p.existing.occurredAt : iso(at);
        if(adjustment){const fresh=await api.get<{amount:number}>(`/accounts/${p.account.id}/calculated-balance?asOf=${encodeURIComponent(atInstant)}`);if(fresh.amount!==calculated.data?.amount)throw new Error("장부 잔액이 변경되었습니다. 최신 금액을 확인하고 다시 조사하세요.");}
        const payload = {
          type: p.type,
          amount: Number(amount),
          asOf: p.existing && at === seoul(p.existing.occurredAt) ? p.existing.occurredAt : iso(at),
          note: note || null,
          expectedVersion: p.account.version,
          expectedCalculatedBalance: adjustment
            ? calculated.data?.amount
            : null,
        };
        try {
          if (p.existing) await api.put(`/accounts/${p.account.id}/initial-balance`, payload);
          else await api.post(`/accounts/${p.account.id}/balance-records`, payload);
        } catch(e) {
          setUnknownOutcome(true);
          await api.get(`/accounts/${p.account.id}`).catch(()=>null);
          throw new Error((e instanceof Error?e.message:"저장 결과 미확인")+" · 서버 상태를 다시 조회했습니다. 감사 이력을 확인한 뒤 새 정정을 시작하세요. 동일 저장을 반복하지 않습니다.");
        }
        p.onSaved();
      }}
    >
      <div className="money-financial-hero">
        <span>{kinds[p.type]}</span>
        <strong>{p.account.displayName}</strong>
      </div>
      <p className="money-financial-notice">
        {adjustment
          ? "확인한 실제 잔액과 계산 잔액의 차이를 감사 가능한 보정 기록으로 저장합니다."
          : "계좌의 시작 시점과 잔액을 금융 원장에 기록합니다."}{" "}
        수입·소비·순저축 통계에 포함되지 않습니다.
      </p>
      <Field label="기준 시각 · 한국 시간">
        <input
          type="datetime-local"
          required
          max={seoul(new Date().toISOString())}
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
      </Field>
      {adjustment && (
        <>
          <LoadState error={calculated.error} loading={calculated.loading} />
          <Field label="계산 잔액">
            <output>
              {calculated.data ? won(calculated.data.amount) : "확인 중…"}
            </output>
          </Field>
        </>
      )}
      <Field label={adjustment ? "확인한 실제 잔액" : "초기 잔액"}>
        <input
          type="number"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {adjustment && calculated.data && amount !== "" && (
        <p className="money-financial-notice">
          보정액 {won(Number(amount) - calculated.data.amount)}
        </p>
      )}
      <Field label={adjustment ? "보정 사유" : "메모 (선택)"}>
        <textarea
          maxLength={500}
          required={adjustment}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </EditorForm>
  );
}

/** Accept the bank-reported balance as the new basis. Recorded as an audited adjustment, never as income/expense. */
export function ReconcileEditor(p: Props & { account: Account }) {
  const { data, error, loading } = useMoneyData<Reconciliation[]>("/reconciliation");
  const [note, setNote] = useState("");
  const row = data?.find((r) => r.accountId === p.account.id);
  const mismatch = row?.status === "MISMATCH";
  return (
    <EditorForm
      title="잔액 차이 확인"
      onClose={p.onClose}
      onSave={async () => {
        if (!row || !mismatch) throw new Error("현재 설명되지 않은 잔액 차이가 없습니다.");
        await api.post(`/accounts/${p.account.id}/reconcile`, {
          observedAt: row.observedAt,
          observedBalance: row.observedBalance,
          expectedLedgerBalance: row.ledgerBalance,
          note,
          expectedVersion: p.account.version,
        });
        p.onSaved();
      }}
    >
      <div className="money-financial-hero">
        <span>잔액 대조</span>
        <strong>{p.account.displayName}</strong>
      </div>
      <LoadState error={error} loading={loading} />
      {row && (
        <div className="money-pair-card">
          <dl>
            <dt>은행이 알려준 잔액</dt>
            <dd>{row.observedBalance === null ? "—" : won(row.observedBalance)}{row.observedAt ? " · " + seoul(row.observedAt).replace("T", " ") : ""}</dd>
            <dt>원장 계산 잔액</dt>
            <dd>{row.ledgerBalance === null ? "—" : won(row.ledgerBalance)}</dd>
            <dt>차이</dt>
            <dd>{row.difference === null ? "—" : (row.difference > 0 ? "+" : "") + won(row.difference)}</dd>
            <dt>계산 기준</dt>
            <dd>
              {row.basisAt ? seoul(row.basisAt).replace("T", " ") : "—"} · {row.basis === "MANUAL" ? "직접 확인한 잔액" : "첫 은행 알림 잔액"}{" "}
              {row.basisAmount === null ? "" : won(row.basisAmount)}
            </dd>
          </dl>
        </div>
      )}
      {row && !mismatch && <p className="money-financial-notice">현재 설명되지 않은 차이가 없습니다. 맞출 내용이 없습니다.</p>}
      {mismatch && (
        <>
          <p className="money-financial-notice">
            먼저 검토 대기와 금융 원장에서 누락되거나 중복된 거래를 찾아보세요. 원인을 찾지 못한 차이만 아래에서 은행 잔액으로 맞춥니다.
            이 기록은 <b>잔액 보정</b>으로 저장되며 수입·소비·순저축 통계에는 포함되지 않습니다.
          </p>
          <Field label="맞추는 사유">
            <textarea maxLength={500} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 원인 미확인 차이, 은행 앱 잔액으로 확인" />
          </Field>
        </>
      )}
    </EditorForm>
  );
}

export function FinancialTransactionEditor(
  p: Props & { value: Partial<Transaction> },
) {
  const t = p.value;
  const detail = useMoneyData<FinancialDetail>(
    t.id ? `/transactions/${t.id}/financial-detail` : null,
  );
  const loans = useMoneyData<Loan[]>(
    t.type === "LOAN_PAYMENT" ? "/loans" : null,
  );
  if ((t.id && !detail.data) || (t.type === "LOAN_PAYMENT" && !loans.data))
    return (
      <MoneyPanel title={kinds[t.type!]} onClose={p.onClose}>
        <LoadState
          error={detail.error || loans.error}
          loading={detail.loading || loans.loading}
        />
      </MoneyPanel>
    );
  if (t.type === "LOAN_PAYMENT")
    return <PaymentForm {...p} loans={loans.data || []} detail={detail.data} />;
  const account = p.accounts.find((a) => a.id === t.toAccountId);
  return (
    <MoneyPanel title={kinds[t.type!]} onClose={p.onClose}>
      <div className="money-financial-hero">
        <span>{kinds[t.type!]}</span>
        <strong>{won(t.amount || 0)}</strong>
        <span>{seoul(t.occurredAt!).replace("T", " ")}</span>
      </div>
      <Field label="계좌">
        <strong>{account?.displayName}</strong>
      </Field>
      {t.type === "BALANCE_ADJUSTMENT" && (
        <Field label="계산 잔액">
          <output>{won(detail.data?.calculatedBalance || 0)}</output>
        </Field>
      )}
      <Field label="확인한 실제 잔액">
        <output>{won(detail.data?.verifiedBalance || 0)}</output>
      </Field>
      <Field label="사유 / 메모">
        <p>{t.memo || "—"}</p>
      </Field>
      <p className="money-financial-notice">
        시점 잔액에 반영되는 감사 기록입니다. 기간 수입·소비·순저축에서
        제외합니다. 금액 정정은 새 잔액 보정으로 남깁니다.
      </p>
      {account && !account.archived && (
        <button
          onClick={() => p.navigate?.("/money/reconciliation?account="+account.id)
          }
        >
          잔액 대사로 이동
        </button>
      )}
      {t.id && <SystemInfo id={t.id} />}
      <footer>
        <button onClick={p.onClose}>닫기</button>
      </footer>
    </MoneyPanel>
  );
}

function PaymentForm(
  p: Props & {
    value: Partial<Transaction>;
    loans: Loan[];
    detail: FinancialDetail | null;
  },
) {
  const t = p.value;
  const [loanId, setLoanId] = useState(p.detail?.loanId || t.loanId || "");
  const loan = p.loans.find((l) => l.id === loanId);
  const [account, setAccount] = useState(
    t.fromAccountId || loan?.paymentAccountId || "",
  );
  const [total, setTotal] = useState(String(t.amount ?? "")),
    [at, setAt] = useState(seoul(t.occurredAt || new Date().toISOString())),
    [note, setNote] = useState(t.memo || "");
  const [known, setKnown] = useState(p.detail?.principal != null);
  const [principal, setPrincipal] = useState(String(p.detail?.principal ?? "")),
    [interest, setInterest] = useState(String(p.detail?.interest ?? "")),
    [fee, setFee] = useState(String(p.detail?.fee ?? ""));
  return (
    <EditorForm
      title="대출 상환"
      onClose={p.onClose}
      onSave={async () => {
        if (!loan) throw new Error("대출을 선택하세요.");
        const payload = {
          loanId,
          paymentAccountId: account,
          amount: Number(total),
          principal: known ? Number(principal) : null,
          interest: known ? Number(interest) : null,
          fee: known ? Number(fee) : null,
          occurredAt: iso(at),
          note: note || null,
          expectedVersion: t.version,
          expectedLoanVersion: loan.version,
        };
        if (t.id) await api.put(`/transactions/${t.id}/loan-payment`, payload);
        else await api.post("/loan-payments", payload);
        p.onSaved();
      }}
    >
      <div className="money-financial-hero">
        <span>LOAN PAYMENT</span>
        <strong>{total ? won(Number(total)) : "상환 금액"}</strong>
        <span>원금 상환은 저축과 소비에서 제외합니다.</span>
      </div>
      <Field label="연결 대출">
        <select
          required
          disabled={!!p.detail?.loanId}
          value={loanId}
          onChange={(e) => {
            setLoanId(e.target.value);
            if (!account)
              setAccount(
                p.loans.find((l) => l.id === e.target.value)
                  ?.paymentAccountId || "",
              );
          }}
        >
          <option value="">대출 선택</option>
          {p.loans.map((l) => (
            <option value={l.id} key={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="납부 계좌">
        <select
          required
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <AccountOptions accounts={p.accounts} keep={[t.fromAccountId]} />
        </select>
      </Field>
      <Field label="총 납부액">
        <input
          type="number"
          min="0.01"
          step="0.01"
          required
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </Field>
      <Field label="납부 시각 · 한국 시간">
        <input
          type="datetime-local"
          required
          value={at}
          max={seoul(new Date().toISOString())}
          onChange={(e) => setAt(e.target.value)}
        />
      </Field>
      <label className="money-check">
        <input
          type="checkbox"
          checked={known}
          onChange={(e) => setKnown(e.target.checked)}
        />{" "}
        원금 · 이자 · 수수료 구성을 확인했습니다
      </label>
      {known ? (
        <>
          <div className="money-financial-fields">
            {(
              [
                ["원금", principal, setPrincipal],
                ["이자", interest, setInterest],
                ["수수료", fee, setFee],
              ] as const
            ).map(([label, value, set]) => (
              <Field label={label} key={label}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={value}
                  onChange={(e) => set(e.target.value)}
                />
              </Field>
            ))}
          </div>
          <p className="money-muted">
            총 납부액 = 원금 + 이자 + 수수료. 0원 항목도 직접 확인해 입력하세요.
          </p>
        </>
      ) : (
        <p className="money-financial-notice">
          구성 미확인 · 총 납부액만 기록하며 남은 원금, 소비, 순저축을 임의로
          변경하지 않습니다.
        </p>
      )}
      <Field label="상환 메모">
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {t.id && <SystemInfo id={t.id} />}
    </EditorForm>
  );
}
