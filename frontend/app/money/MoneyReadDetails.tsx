"use client";
import { useState } from "react";
import { moneyAmount, fundLabels, repaymentProgress } from "@/lib/money/accounts";
import { providers, roles, reconciliationStatus, seoul, type Account, type AccountBalance, type Reconciliation, type Transaction } from "@/lib/money/model";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import { MoneyPanel } from "./MoneyPanel";
import { LoanHistory } from "./MoneyLoanHistory";
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
  {transactions.data?.items.map(t=><button className="money-evidence-transaction" key={t.id} onClick={()=>p.select({kind:"transaction",value:t})}><span>{t.title??t.counterpartyText??"금융 내역"}</span><strong>{moneyAmount(t.amount,t.currency)}</strong><small>{seoul(t.occurredAt).replace("T"," ")}</small></button>)}
  <button onClick={()=>p.navigate?.("/money/bookkeeping")}>가계부 추적 설정</button><button onClick={()=>p.navigate?.("/money")}>개요 대표 계좌 배치</button>
  <p className="money-muted">용도·자금 구역·추적·대표 계좌·자산 포함은 각각 관리합니다.</p>
 </MoneyPanel>;
}

export function LoanReadDetail(p:Props & {loan:Loan}) {
 const l=p.loan,[history,setHistory]=useState(false),progress=repaymentProgress(l.originalPrincipal,l.remainingPrincipal);
 const repayments=useMoneyData<{id:string;amount:number;principal:number|null;interest:number|null;fee:number|null;occurredAt:string;remainingPrincipal:number;unresolved:boolean}[]>(`/loans/${l.id}/repayments`);
 const latest=repayments.data?.[0];
 const labels:Record<string,string>={ACTIVE:"상환 중",COMPLETED:"완료",PAUSED:"일시 중지",INACTIVE:"비활성"};
 return <MoneyPanel title="대출 상세" onClose={p.onClose} trackDirty={false}>
  <h3>{l.name}</h3><p>{l.lender} · {labels[l.status]??"상태 확인"}</p><p className="money-muted">남은 원금</p><strong className="money-read-amount">{moneyAmount(l.remainingPrincipal)}</strong>
  <dl className="money-evidence-details"><dt>등록 원금</dt><dd>{moneyAmount(l.originalPrincipal)}</dd><dt>금리</dt><dd>{l.interestRate==null?"미등록":l.interestRate+"%"}</dd><dt>등록 월 납부금액</dt><dd>{moneyAmount(l.monthlyPayment)}</dd><dt>다음 등록 납부일</dt><dd>{l.nextDueDate??"미등록"}</dd><dt>원금 상환 진척</dt><dd>{progress==null?"원금 확인 필요":progress.toFixed(0)+"%"}</dd></dl>
  <p>납부 계좌 {p.accounts.find(a=>a.id===l.paymentAccountId)?.displayName??"미등록"}</p><button onClick={()=>p.select({kind:"loan",value:l,edit:true})}>대출 정보 수정</button>
  <h3>최근 상환 요약</h3><LoadState error={repayments.error} loading={repayments.loading} lastSuccessAt={repayments.lastSuccessAt}/>
  {latest?<section className="money-card"><p>{seoul(latest.occurredAt).replace("T"," ")}</p><strong>계좌에서 나간 금액 {moneyAmount(latest.amount)}</strong><dl className="money-evidence-details"><dt>확인 원금</dt><dd>{moneyAmount(latest.principal)}</dd><dt>이자</dt><dd>{moneyAmount(latest.interest)}</dd><dt>수수료</dt><dd>{moneyAmount(latest.fee)}</dd><dt>가계부 소비</dt><dd>{latest.unresolved?"구성 확인 필요":moneyAmount((latest.interest??0)+(latest.fee??0))}</dd></dl><p>상환 후 남은 원금 {moneyAmount(latest.remainingPrincipal)}</p></section>:repayments.data&&<p>등록된 상환 내역이 없습니다.</p>}
  <button aria-expanded={history} onClick={()=>setHistory(!history)}>상환 내역 {history?"접기":"보기"}</button>
  {history&&<LoanHistory loan={l} accounts={p.accounts} select={p.select}/>}
  <p className="money-financial-notice">등록한 월 금액과 실제 납부금액은 다를 수 있습니다. 원금·이자·수수료가 확인된 상환만 각각 반영합니다.</p>
 </MoneyPanel>;
}
