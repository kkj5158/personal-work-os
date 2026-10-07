"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { type Account, type AccountBalance, type Reconciliation, type Transaction, moneyApi as api, providers, roles, reconciliationStatus, seoul } from "@/lib/money/model";
import { fundLabels, groupedWebAccounts, moneyAmount, repaymentProgress } from "@/lib/money/accounts";
import { useMoneyData, LoadState, type Loan } from "./MoneyWebData";
import { useMoneyCache } from "./MoneyDataProvider";
import { MoneyPanel } from "./MoneyPanel";
import { MoneyDialog } from "./MoneyDialog";
import { LoanHistory } from "./MoneyLoanHistory";
import { ReconciliationSnapshot } from "./MoneyReconciliationSnapshot";
import { OpeningBalance, type Props as EditorProps } from "./MoneyEditors";
import { FilterButtons } from "./MoneyFinancialViews";
import { type Props, type ReconciliationInvestigation, AccountIcon } from "./MoneyWebViews";

export function RevisionAccounts(p:Props) {
  const balances=useMoneyData<AccountBalance[]>("/account-balances"),reconciliation=useMoneyData<Reconciliation[]>("/reconciliation");
  const stock=useMoneyData<{unsupportedCurrencyAccountIds:string[]}>("/overview/current-stock");
  const cache=useMoneyCache();
  function stockRetry(){cache.invalidate(key=>key==="/overview/current-stock");void cache.load("/overview/current-stock").catch(()=>{});}
  const [scope,setScope]=useState("active"),[search,setSearch]=useState("");
  const query=useSearchParams(),accountId=query.get("account");
  const selectRef=useRef(p.select);useEffect(()=>{selectRef.current=p.select;});
  useEffect(()=>{const a=p.accounts.find(a=>a.id===accountId);if(a)selectRef.current({kind:"account",value:a});},[accountId,p.accounts]); // Selection is ID-based, including representative deep links.
  const accounts=p.accounts.filter(a=>(scope==="all"||(scope==="archived"?a.archived:!a.archived))&&`${a.displayName} ${providers[a.provider]??a.provider}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function subtotal(items:Account[]){if(!balances.data||!stock.data)return undefined;const included=items.filter(a=>a.includeInAssets!==false);const values=included.map(a=>balances.data?.find(b=>b.account.id===a.id)?.balance);if(values.some(value=>!value?.asOf)||included.some(a=>stock.data?.unsupportedCurrencyAccountIds.includes(a.id)))return null;return values.reduce((sum,value)=>sum+value!.amount,0);}
  if(!p.ready)return null;
  return <><div className="money-toolbar"><button aria-pressed={scope==="active"} onClick={()=>setScope("active")}>사용 중</button><button aria-pressed={scope==="archived"} onClick={()=>setScope("archived")}>보관 계좌</button><button aria-pressed={scope==="all"} onClick={()=>setScope("all")}>전체</button><input aria-label="계좌 검색" placeholder="계좌 · 은행 검색" value={search} onChange={e=>setSearch(e.target.value)}/><button className="money-primary" onClick={()=>p.select({kind:"account",value:null})}>+ 계좌 추가</button></div>
    <LoadState error={balances.error} loading={balances.loading} lastSuccessAt={balances.lastSuccessAt}/><LoadState error={reconciliation.error} loading={reconciliation.loading} lastSuccessAt={reconciliation.lastSuccessAt}/><LoadState error={stock.error} loading={stock.loading} lastSuccessAt={stock.lastSuccessAt}/>{stock.error&&<button onClick={()=>stockRetry()}>자산 합계 다시 불러오기</button>}
    <div className="money-card money-compact-accounts">{groupedWebAccounts(accounts).filter(g=>g.accounts.length).map(g=><section key={g.id}><header><strong>{g.label} · {g.accounts.length}개</strong><small>자산 포함 부분합 {subtotal(g.accounts)===null?'기준점 확인 필요':moneyAmount(subtotal(g.accounts))}{scope!=="active"?" · 보관 계좌 포함":""}</small></header>{g.accounts.map(a=>{
      const balance=balances.data?.find(b=>b.account.id===a.id)?.balance,row=reconciliation.data?.find(r=>r.accountId===a.id);
      return <div className={"money-compact-account "+(p.selected===a.id?"selected":"")} key={a.id}><button className="money-account-name" onClick={()=>p.select({kind:"account",value:a})}><AccountIcon account={a}/><span><strong>{a.displayName}</strong><small>{providers[a.provider]??a.provider} · {a.maskedReference??(a.suffix?"••"+a.suffix:"계좌 힌트 미등록")}</small></span></button><div className="money-number"><strong>{stock.data?.unsupportedCurrencyAccountIds.includes(a.id)?"통화별 금융 내역 보기":moneyAmount(balance?.asOf?balance.amount:undefined)}</strong><small>현재 장부 잔액</small></div><div><span>{roles[a.role]??"용도 미분류"}</span><small>자금 구역 · {a.fundGroup?fundLabels[a.fundGroup]:"미설정"}{a.savingsSubtype==="INSTALLMENT"?" · 적금":a.savingsSubtype==="SAVINGS_ACCOUNT"?" · 저축":""}</small></div><div><span className="money-state-badge">{a.includeInAssets===false?"자산 제외":"자산 포함"}</span><small>{a.archived?"보관됨":"사용 중"}</small></div><button className="money-evidence-link" onClick={()=>p.navigate?.("/money/reconciliation?account="+a.id)}><span className="money-recon-status" data-status={row?.status}>{row?reconciliationStatus[row.status]:"근거 조회 중"}</span><small>{row?.observedAt?seoul(row.observedAt).replace("T"," "):balance?.asOf?seoul(balance.asOf).replace("T"," "):"확인 시각 없음"}</small></button></div>;
    })}</section>)}{!accounts.length&&<p className="money-empty">{p.accounts.length?"선택한 조건의 계좌가 없습니다.":"등록된 계좌가 없습니다. 계좌를 추가하세요."}</p>}</div>
    <p className="money-muted">용도·자금 구역·가계부 추적·대표 계좌·자산 포함은 별도로 관리합니다. 잔액 조사·초기 잔액·조정은 잔액 대사에서 진행합니다.</p>
  </>;
}

export function RevisionReconciliation(p:Props) { return <ReconciliationSnapshot {...p}/>; }

export function ReconciliationPanel(p:EditorProps & {account:Account}) {
  const result=useMoneyData<Reconciliation[]>("/reconciliation");
  const row=result.data?.find(r=>r.accountId===p.account.id);
  const investigation=p.selection.kind==="reconciliation"?p.selection.investigation:undefined;
  const [adjust,setAdjust]=useState<{row:Reconciliation;account:Account;investigation?:ReconciliationInvestigation}|null>(null),[error,setError]=useState("");
  const [investigated,setInvestigated]=useState(false),[loading,setLoading]=useState(false);
  const cache=useMoneyCache();
  const transactions=useMoneyData<{items:Transaction[]}>(row?.observedAt?`/transactions?accountId=${p.account.id}&from=${seoul(row.observedAt).slice(0,10)}&to=${seoul(row.observedAt).slice(0,10)}&limit=20`:null);
  async function prepare(){setLoading(true);setError("");try{const [rows,accounts]=await Promise.all([api.get<Reconciliation[]>("/reconciliation"),api.get<Account[]>("/accounts")]);const latest=rows.find(r=>r.accountId===p.account.id),account=accounts.find(a=>a.id===p.account.id);if(!latest||latest.status!=="MISMATCH"||!account||account.archived)throw new Error("최신 상태에는 적용할 차이가 없습니다. 최신 근거를 확인하세요.");setAdjust({row:latest,account,investigation});}catch(e){setError(e instanceof Error?e.message:"근거 조회 실패");cache.invalidate();}finally{setLoading(false);}}
  return <MoneyPanel title="차이 조사" onClose={p.onClose} trackDirty={false}><h3>{p.account.displayName}</h3><LoadState error={result.error} loading={result.loading}/>{row&&<><strong className="money-recon-difference">{moneyAmount(row.difference)}</strong><p className="money-muted">관측 잔액 − 같은 시각 장부 잔액</p><dl className="money-evidence-details"><dt>관측 근거</dt><dd>{row.observedSource==="NOTIFICATION"?"은행 알림":row.observedSource==="MANUAL"?"수동 기준점":"관측 없음"} · {row.observedAt?seoul(row.observedAt).replace("T"," "):"—"}</dd><dt>관측 잔액</dt><dd>{moneyAmount(row.observedBalance)}</dd><dt>계산 기준</dt><dd>{row.basis==="MANUAL"?"수동 기준점":row.basis==="FIRST_NOTIFICATION"?"첫 알림 기준":"근거 부족"} · {row.basisAt?seoul(row.basisAt).replace("T"," "):"—"}</dd><dt>같은 시각 장부</dt><dd>{moneyAmount(row.ledgerBalance)}</dd><dt>현재 장부 잔액</dt><dd>{moneyAmount(row.current.amount)} · {row.current.asOf?seoul(row.current.asOf).replace("T"," "):"기준 시각 없음"}</dd></dl><p className="money-recon-status" data-status={row.status}>{reconciliationStatus[row.status]}</p>
    <h3>조사 순서</h3>{["누락 거래 / 금융 확인 필요","잘못 연결된 계좌","중복 알림 / 이체 양쪽","시각 차이 / 취소·환불"].map(label=><label className="money-check" key={label}><input type="checkbox"/>{label}</label>)}
    <button onClick={()=>p.navigate?.("/money/review")}>누락 금융 확인으로 이동</button><h3>해당 시각의 거래</h3><LoadState error={transactions.error} loading={transactions.loading}/>{transactions.data?.items.map(t=><button className="money-evidence-transaction" key={t.id} onClick={()=>p.select({kind:"transaction",value:t})}><span>{t.title??t.counterpartyText??t.type}</span><strong>{moneyAmount(t.amount,t.currency)}</strong><small>{seoul(t.occurredAt).replace("T"," ")}</small></button>)}{transactions.data&&!transactions.data.items.length&&<p>그 날짜의 거래 없음</p>}
    <p className="money-financial-notice">누락 거래가 확인되면 해당 거래를 먼저 수정하세요. 잔액 조정은 원인 조사를 대신하지 않습니다.</p><label className="money-check"><input type="checkbox" checked={investigated} onChange={e=>setInvestigated(e.target.checked)}/>조사 후에도 차이가 남아 수동 기준점 적용을 검토합니다.</label>
    {row.status==="MISMATCH"&&!p.account.archived&&<button className="money-primary" disabled={!investigated||loading} onClick={()=>void prepare()}>{loading?"최신 근거 확인 중…":"잔액 조정 검토"}</button>}
    {!p.account.archived&&<details><summary>초기 잔액 · 수동 기준점 정정</summary><OpeningBalance account={p.account} select={p.select} run={async fn=>{await fn();p.onSaved();}}/><button onClick={()=>p.select({kind:"account",value:p.account,action:"BALANCE_ADJUSTMENT"})}>별도 수동 잔액 조정</button><p className="money-muted">절대 기준점과 감사 기록을 저장하며 통계에서 제외됩니다.</p></details>}
    </>}{error&&<p role="alert">{error}</p>}{adjust&&<ReconciliationAdjustment initial={adjust} onClose={()=>setAdjust(null)} onSaved={p.onSaved}/>}</MoneyPanel>;
}
function ReconciliationAdjustment({initial,onClose,onSaved}:{initial:{row:Reconciliation;account:Account;investigation?:ReconciliationInvestigation};onClose:()=>void;onSaved:()=>void}) {
  const [note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[locked,setLocked]=useState(false);
  const cache=useMoneyCache(),r=initial.row;
  async function apply(){if(busy||locked)return;setBusy(true);try{
    const [rows,accounts]=await Promise.all([api.get<Reconciliation[]>("/reconciliation"),api.get<Account[]>("/accounts")]);const latest=rows.find(v=>v.accountId===r.accountId),account=accounts.find(a=>a.id===r.accountId);
    if(!latest||!account||account.archived||latest.status!=="MISMATCH"||account.version!==initial.account.version||latest.observedAt!==r.observedAt||latest.observedBalance!==r.observedBalance||latest.ledgerBalance!==r.ledgerBalance){setLocked(true);throw new Error("최신 관측·장부·버전이 변경되었습니다. 사유 초안은 유지했습니다. 닫고 최신 근거로 다시 조사하세요.");}
    await api.post(`/accounts/${r.accountId}/reconcile`,{observedAt:r.observedAt,observedBalance:r.observedBalance,expectedLedgerBalance:r.ledgerBalance,note,expectedVersion:account.version,investigation:initial.investigation});cache.invalidate();onSaved();
  }catch(e){setLocked(true);const latest=await api.get<Reconciliation[]>("/reconciliation").catch(()=>null);cache.invalidate();setError((e instanceof Error?e.message:"저장 응답을 확인하지 못했습니다.")+" · "+(latest?.find(v=>v.accountId===r.accountId)?.status==="ANCHORED"?"현재 서버는 수동 기준점 상태입니다. 이력에서 결과를 확인하세요.":"서버 상태를 다시 조회했습니다. 동일 조정을 자동 반복하지 않습니다."));}finally{setBusy(false);}}
  return <MoneyDialog title="잔액 조정 확인" onClose={()=>{if(!busy)onClose();}}><p>{initial.account.displayName} · {r.observedAt?seoul(r.observedAt).replace("T"," "):"—"} · 알림 관측</p><div className="money-adjustment-values"><div><small>같은 시각 장부</small><strong>{moneyAmount(r.ledgerBalance)}</strong></div><div><small>새 수동 기준점</small><strong>{moneyAmount(r.observedBalance)}</strong></div></div><p>조정 금액 <strong>{moneyAmount(r.difference)}</strong> · 잔액 조정</p><label className="money-field"><span>사유 · 필수</span><textarea maxLength={500} required value={note} onChange={e=>setNote(e.target.value)}/></label><p className="money-financial-notice">수입·소비·저축 통계에서 제외됩니다. 완료 후 상태는 수동 기준점이며 은행 일치로 확정하지 않습니다.</p>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy} onClick={onClose}>취소</button><button className="money-primary" disabled={busy||locked||!note.trim()} onClick={()=>void apply()}>{busy?"적용 중…":"수동 기준점 적용"}</button></footer></MoneyDialog>;
}

export const loanStatuses={ACTIVE:"상환 중",COMPLETED:"완료",PAUSED:"일시 중지",INACTIVE:"비활성"};
export function RevisionLoans(p:Props) {
  const {data,error,loading,lastSuccessAt}=useMoneyData<Loan[]>("/loans");
  const [status,setStatus]=useState<string[]|null>(["ACTIVE"]),[search,setSearch]=useState(""),[history,setHistory]=useState<string|null>(null);
  const active=data?.filter(l=>l.status==="ACTIVE"),missing=active?.filter(l=>l.monthlyPayment==null).length;
  const upcoming=active?.filter(l=>!!l.nextDueDate).sort((a,b)=>a.nextDueDate!.localeCompare(b.nextDueDate!))[0];
  const filtered=(data??[]).filter(l=>(status===null||status.includes(l.status))&&`${l.name} ${l.lender}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const today=seoul(new Date().toISOString()).slice(0,10);
  return <><div className="money-stock-kpis"><section className="money-metric loan"><p>상환 중 잔여 원금</p><strong>{moneyAmount(active?.reduce((sum,l)=>sum+l.remainingPrincipal,0))}</strong><small>다른 상태의 부채는 별도 조회</small></section><section className="money-metric"><p>등록 월 상환금</p><strong>{moneyAmount(active?.length&&active.some(l=>l.monthlyPayment!=null)?active.reduce((sum,l)=>sum+(l.monthlyPayment??0),0):undefined)}</strong><small>미등록 {missing??"—"}건 · 전체 청구액 아님</small></section><section className="money-metric"><p>가장 가까운 등록일</p><strong>{upcoming?.nextDueDate??"미등록"}</strong><small>등록 금액 {moneyAmount(upcoming?.monthlyPayment)}</small></section><section className="money-metric"><p>설정 확인 필요</p><strong>{active?.filter(l=>l.interestRate==null||l.monthlyPayment==null||!l.nextDueDate).length??"—"}건</strong><small>금리 · 월 금액 · 다음 등록일</small></section></div>
    <div className="money-toolbar"><input aria-label="대출 검색" placeholder="대출 · 금융사 검색" value={search} onChange={e=>setSearch(e.target.value)}/><button className="money-primary" onClick={()=>p.select({kind:"loan",value:null})}>+ 대출 추가</button></div><FilterButtons label="대출 상태" options={Object.entries(loanStatuses).map(([id,label])=>({id,label}))} value={status} onChange={setStatus}/><LoadState error={error} loading={loading} lastSuccessAt={lastSuccessAt}/>
    <section className="money-card money-compact-loans">{filtered.map(l=>{const progress=repaymentProgress(l.originalPrincipal,l.remainingPrincipal);return <div key={l.id} className={"money-compact-loan "+(p.selected===l.id?"selected":"")}><button onClick={()=>p.select({kind:"loan",value:l})}><strong>{l.name}</strong><small>{l.lender} · {loanStatuses[l.status]}</small></button><div className="money-number"><strong>{moneyAmount(l.remainingPrincipal)}</strong><small>등록 원금 {moneyAmount(l.originalPrincipal)}</small></div><div>{l.interestRate==null?"미등록":l.interestRate+"%"}<small>금리</small></div><div>{moneyAmount(l.monthlyPayment)}<small>등록 월 상환금</small><small>다음 등록일 {l.nextDueDate??"미등록"}</small>{l.nextDueDate&&l.nextDueDate<today&&<small className="money-warning">등록일 경과 · 연체 여부 미확인</small>}</div><div>{progress==null?<span>진척 계산 불가 · 원금 확인</span>:<><span>상환 {progress.toFixed(0)}%</span><progress aria-label={`${l.name} 상환 진척`} max={100} value={progress}/></>}<small>{l.interestRate==null||l.monthlyPayment==null||!l.nextDueDate?"설정 확인 필요":"조건 등록됨"}</small><button onClick={()=>setHistory(history===l.id?null:l.id)}>상환 내역</button></div></div>;})}{data&&!filtered.length&&<p className="money-empty">{data.length?"조건에 맞는 대출이 없습니다.":"등록된 대출이 없습니다."}</p>}</section>
    {data?.find(l=>l.id===history)&&<LoanHistory loan={data.find(l=>l.id===history)!} accounts={p.accounts} select={p.select}/>}<p className="money-muted">확인된 원금·이자·수수료만 반영합니다. 등록일과 월 상환금으로 향후 일정이나 청구액을 추정하지 않습니다.</p>
  </>;
}
