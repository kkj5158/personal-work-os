"use client";
import { useContext, useEffect, useId, useState } from "react";
import { moneyAmount, fundLabels } from "@/lib/money/accounts";
import { providers, roles, reconciliationStatus, seoul, type Account, type AccountBalance, type Reconciliation, type Transaction } from "@/lib/money/model";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import { loanOutstanding, loanStatuses, parseLoanRate } from "@/lib/money/loans";
import { LoanSaveFeedback, useLoanFieldSave } from "./MoneyLoanActions";
import { MoneyPanel, PanelContext } from "./MoneyPanel";
import { LoanHistoryRows, type Repayment } from "./MoneyLoanHistory";
import { SystemInfo } from "./MoneyEditors";
import type { Props } from "./MoneyEditors";

export function AccountReadDetail(p:Props & {account:Account}) {
 const a=p.account,balances=useMoneyData<AccountBalance[]>("/account-balances"),reconciliation=useMoneyData<Reconciliation[]>("/reconciliation");
 const transactions=useMoneyData<{items:Transaction[]}>(`/transactions?accountId=${a.id}&limit=5`);
 const stock=useMoneyData<{unsupportedCurrencyAccountIds:string[]}>("/overview/current-stock");
 const balance=balances.data?.find(b=>b.account.id===a.id)?.balance,row=reconciliation.data?.find(r=>r.accountId===a.id);
 return <MoneyPanel title="계좌 상세" onClose={p.onClose} trackDirty={false}>
  <h3>{a.displayName}</h3><p>{providers[a.provider]??a.provider} · {a.maskedReference??(a.suffix?"••"+a.suffix:"계좌 힌트 미등록")} · {a.archived?"보관됨":"사용 중"}</p>
  <LoadState error={balances.error} loading={balances.loading} lastSuccessAt={balances.lastSuccessAt}/>
  <p className="money-muted">현재 장부 잔액</p><strong className="money-read-amount">{stock.data?.unsupportedCurrencyAccountIds.includes(a.id)?"통화별 금융 내역 보기":moneyAmount(balance?.asOf?balance.amount:null)}</strong><p className="money-muted">잔액 기준 {balance?.asOf?seoul(balance.asOf).replace("T"," "):"기준 시각 없음"}</p>
  <dl className="money-evidence-details"><dt>용도</dt><dd>{roles[a.role]??"용도 미분류"}</dd><dt>자금 구역</dt><dd>{a.fundGroup?fundLabels[a.fundGroup]:"미설정"}</dd><dt>자산 포함</dt><dd>{a.includeInAssets===false?"제외":"포함"}</dd></dl>
  <button onClick={()=>p.select({kind:"account",value:a,edit:true})}>계좌 정보 수정 · 자금 구역 설정</button>
  <h3>잔액 점검 요약</h3><LoadState error={reconciliation.error} loading={reconciliation.loading} lastSuccessAt={reconciliation.lastSuccessAt}/>
  {row&&<section className="money-card"><strong>{reconciliationStatus[row.status]}</strong><p>관측 {moneyAmount(row.observedBalance)} · 같은 시각 장부 {moneyAmount(row.ledgerBalance)}</p><p>차이 {moneyAmount(row.difference)} · {row.observedAt?seoul(row.observedAt).replace("T"," "):"관측 시각 없음"}</p></section>}
  <button onClick={()=>p.navigate?.("/money/reconciliation?account="+a.id)}>이 계좌 잔액 점검</button>
  <h3>최근 금융 내역</h3><LoadState error={transactions.error} loading={transactions.loading} lastSuccessAt={transactions.lastSuccessAt}/>
  {transactions.data?.items.map(t=><button className="money-evidence-transaction" key={t.id} onClick={()=>p.select({kind:"transaction",value:t})}><span>{t.title??t.counterpartyText??"금융 내역"}</span><strong>{moneyAmount(t.amount,t.currency)}</strong><small>{seoul(t.occurredAt,t.occurrencePrecision).replace("T"," ")}</small></button>)}
  <button onClick={()=>p.navigate?.("/money/bookkeeping")}>가계부 추적 설정</button><button onClick={()=>p.navigate?.("/money")}>개요 대표 계좌 배치</button>
  <p className="money-muted">용도·자금 구역·추적·대표 계좌·자산 포함은 각각 관리합니다.</p>
 </MoneyPanel>;
}

const loanTabs = [["basic", "기본 정보"], ["repay", "상환 내역"], ["evidence", "근거 · 연결"]] as const;

export function LoanReadDetail(p: Props & { loan: Loan }) {
  const loans = useMoneyData<Loan[]>("/loans");
  const loan = loans.data?.find(row => row.id === p.loan.id) ?? p.loan;
  const { setDirty } = useContext(PanelContext);
  const id = useId();
  const [tab, setTab] = useState<(typeof loanTabs)[number][0]>("basic");
  const [draft, setDraft] = useState<{ text: string; version: number } | null>(null);
  const action = useLoanFieldSave();
  const text = draft?.text ?? String(loan.interestRate ?? "");
  const parsed = parseLoanRate(text);
  const changed = draft !== null && (parsed === undefined || parsed !== loan.interestRate);
  const stale = changed && draft.version !== loan.version;
  const repayments = useMoneyData<Repayment[]>(tab !== "basic" ? `/loans/${loan.id}/repayments` : null);
  const account = p.accounts.find(row => row.id === loan.paymentAccountId);

  useEffect(() => {
    setDirty(changed || Boolean(action.pending));
    return () => setDirty(false);
  }, [changed, action.pending, setDirty]);

  async function saveRate() {
    if (!draft || !changed || stale || parsed === undefined || action.pending) return;
    if (await action.save(loan.id, draft.version, { interestRate: parsed })) {
      setDraft(null);
    }
  }

  return <MoneyPanel title="대출 상세" onClose={() => { if (!action.pending) p.onClose(); }} trackDirty={false}>
    <div className="money-loan-detail">
      <h3>{loan.name}</h3>
      <p className="money-muted">{loan.lender} · {loan.type}</p>
      <p className="money-muted">{loan.facilityLimit != null ? "은행 잔액 기준 사용액" : "확정 남은 원금"}</p>
      <strong className="money-read-amount">{moneyAmount(loanOutstanding(loan))}</strong>
      <div className="money-loan-tabs" role="tablist" aria-label="대출 상세 보기">
        {loanTabs.map(([value, label], index) => <button key={value} type="button" role="tab"
          id={`${id}-tab-${value}`} aria-selected={tab === value} aria-controls={`${id}-panel-${value}`}
          tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
          onKeyDown={event => {
            const next = { ArrowLeft: (index + loanTabs.length - 1) % loanTabs.length,
              ArrowRight: (index + 1) % loanTabs.length, Home: 0, End: loanTabs.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            const nextTab = loanTabs[next][0];
            setTab(nextTab);
            document.getElementById(`${id}-tab-${nextTab}`)?.focus();
          }}>{label}</button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel-basic`} aria-labelledby={`${id}-tab-basic`} hidden={tab !== "basic"} tabIndex={0}>
        <dl className="money-evidence-details">
          <dt>대출 상태</dt><dd>{loanStatuses[loan.status]}</dd>
          <dt>연 금리</dt><dd>{loan.interestRate == null ? "미등록" : `${loan.interestRate}%`}</dd>
          <dt>{loan.facilityLimit != null ? "대출 한도" : "최초 원금"}</dt>
          <dd>{moneyAmount(loan.facilityLimit ?? loan.originalPrincipal)}</dd>
          <dt>상환 배분 미확정</dt><dd>{loan.unresolvedAllocationCount == null ? "확인 불가" : `${loan.unresolvedAllocationCount}건`}</dd>
          <dt>납부 계좌</dt><dd>{account?.displayName ?? (loan.paymentAccountId ? "확인 불가" : "미등록")}</dd>
        </dl>
        <form onSubmit={event => { event.preventDefault(); void saveRate(); }}>
          <label className="money-field"><span>연 금리 (%)</span>
            <input type="text" inputMode="decimal" placeholder="미등록" value={text} aria-invalid={parsed === undefined}
              aria-describedby={`${id}-rate-help`} disabled={Boolean(action.pending)}
              onChange={event => setDraft({ text: event.target.value, version: draft?.version ?? loan.version })} />
          </label>
          <p id={`${id}-rate-help`} className="money-muted">0~100%, 소수점 넷째 자리까지 입력할 수 있습니다. 빈 값은 미등록으로 저장됩니다.</p>
          {stale && <p role="alert">대출 정보가 변경되었습니다. 현재 금리를 확인한 뒤 변경 내용을 다시 적용하세요.</p>}
          {stale && <button type="button" onClick={() => setDraft({ text, version: loan.version })}>입력 유지 · 최신 버전 적용</button>}
          <LoanSaveFeedback action={action} />
          <button type="submit" className="money-primary" disabled={!changed || stale || parsed === undefined ||
            Boolean(action.pending || action.needsRefresh || loans.error || !loans.data?.some(row => row.id === loan.id))}>금리 수정 적용</button>
          {draft && <button type="button" disabled={Boolean(action.pending)} onClick={() => setDraft(null)}>금리 입력 취소</button>}
        </form>
        <button type="button" disabled={Boolean(action.pending)} onClick={() => p.select({ kind: "loan", value: loan, edit: true })}>대출 정보 수정</button>
      </div>
      <div role="tabpanel" id={`${id}-panel-repay`} aria-labelledby={`${id}-tab-repay`} hidden={tab !== "repay"} tabIndex={0}>
        {tab === "repay" && <LoanHistoryRows result={repayments} loan={loan} accounts={p.accounts} select={p.select} />}
      </div>
      <div role="tabpanel" id={`${id}-panel-evidence`} aria-labelledby={`${id}-tab-evidence`} hidden={tab !== "evidence"} tabIndex={0}>
        {tab === "evidence" && <div className="money-loan-evidence">
          {account && p.navigate && <button type="button" onClick={() => p.navigate?.(`/money/accounts?account=${account.id}`)}>납부 계좌 보기</button>}
          {loan.facilityLimit != null && <p className="money-muted">은행 잔액 기준 시각 {loan.utilizationAsOf ? seoul(loan.utilizationAsOf).replace("T", " ") : "확인 불가"}</p>}
          <LoadState {...repayments} hideLastChecked />
          {repayments.data?.map(row => <SystemInfo key={row.id} id={row.id}
            label={`${seoul(row.occurredAt).replace("T", " ")} · ${moneyAmount(row.amount, row.currency)} 거래 근거`} />)}
          {repayments.data?.length === 0 && <p className="money-muted">연결된 입금·상환 거래 근거가 없습니다.</p>}
        </div>}
      </div>
    </div>
  </MoneyPanel>;
}
