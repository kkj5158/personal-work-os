"use client";
import { useState } from "react";
import { type AccountBalance, roles, seoul } from "@/lib/money/model";
import { webAccountGroup, moneyAmount, periodWaterfall } from "@/lib/money/accounts";
import { categoryTotals } from "@/lib/money/categories";
import { useMoneyData, LoadState, type OverviewData } from "./MoneyWebData";
import { useMoneyCache, useMoneyViewState } from "./MoneyDataProvider";
import { RepresentativeSettings } from "./MoneyRepresentativeSettings";
import { visibleRows, type RepresentativePreferences as Preferences } from "@/lib/money/layout";
import { emptyLedger } from "./MoneyFinancialViews";
import type { Props } from "./MoneyWebViews";

type CurrentStock = { asOf:string; currencies:{currency:string;currentTotal:number|null;currentBalance:number|null;currentSavings:number|null;totalLoans:number;includedAssets:number|null;unknownBalanceCount:number}[];hasUnsupportedCurrencies?:boolean; unsupportedCurrencyAccountIds?:string[] };
type Pace = {from:string;to:string;comparisonFrom:string;comparisonTo:string;asOf:string;current:number;previous:number;delta:number;buckets:{day:number;current:number;previous:number}[];unresolvedLoanPayments:number;analyticsUnavailable?:boolean};

export function RevisionOverview(p:Props) {
  const query=new URLSearchParams({from:p.period.from,to:p.period.to}).toString();
  const stock=useMoneyData<CurrentStock>("/overview/current-stock");
  const preferences=useMoneyData<Preferences>("/overview/preferences");
  const balances=useMoneyData<AccountBalance[]>("/account-balances");
  const period=useMoneyData<OverviewData & {hasMixedCurrencies?:boolean;analyticsUnavailable?:boolean}>("/overview?"+query);
  const pace=useMoneyData<Pace>("/overview/spending-pace?"+query);
  const cache=useMoneyCache();
  const [,setLedger]=useMoneyViewState("ledger",emptyLedger);
  const [expanded,setExpanded]=useState(false),[settings,setSettings]=useState(false);
  const ids=preferences.data?.accountIds??[];
  const retry=(path:string)=>{cache.invalidate(key=>key===path);void cache.load(path).catch(()=>{});};
  const data=period.data;
  const inspect=(categoryId:string)=>{setLedger({...emptyLedger(),categories:[categoryId],period:query});p.navigate?.("/money/transactions");};
  const groups=(kind:"income"|"consumption")=> data?categoryTotals(p.categories,data.composition.filter(r=>r.type!=="LOAN_PAYMENT").map(r=>({categoryId:r.categoryId,amount:r[kind]}))).map(g=>({label:g.label,amount:g.amount,onSelect:()=>inspect(g.id)})):[];
  const income=groups("income"),spending=groups("consumption");
  const costs=data?.composition.filter(r=>r.type==="LOAN_PAYMENT").reduce((s,r)=>s+r.consumption,0)??0;
  if(costs)spending.push({label:"대출 이자 · 수수료",amount:costs,onSelect:()=>p.navigate?.("/money/loans")});
  const savings=new Map<string,number>();
  data?.composition.forEach(r=>{if(r.savings){const label=p.accounts.find(a=>a.id===r.toAccountId)?.displayName??"저축 회수";savings.set(label,(savings.get(label)??0)+r.savings);}});
  if(!p.ready)return null;
  return <>
    <LoadState error={stock.error} loading={stock.loading} lastSuccessAt={stock.lastSuccessAt}/>
    {stock.error&&<button onClick={()=>retry("/overview/current-stock")}>현재 요약 다시 불러오기</button>}
    {(stock.data?.currencies??[]).map(row=><div key={row.currency}>
      <div className="money-stock-kpis">
        {[{label:"현재 총액",value:row.currentTotal,tone:"total",hint:"포함 자산 − ACTIVE 대출 원금 · 보관 계좌 포함"},{label:"현재 잔액",value:row.currentBalance,tone:"",hint:"사용 중 · 자산 포함 · 생활 자금 구역"},{label:"현재 저축 / 적금",value:row.currentSavings,tone:"saving",hint:"사용 중 · 자산 포함 · 저축 자금 구역"},{label:"총 대출",value:row.totalLoans,tone:"loan",hint:"현재 ACTIVE 잔여 원금"}].map(metric=><section className={"money-metric "+metric.tone} key={metric.label}><p>{metric.label}</p><strong>{metric.value===null?"기준점·통화 확인 필요":moneyAmount(metric.value,row.currency)}</strong><small>{metric.hint}</small></section>)}
      </div>
      <p className="money-asof">현재 기준 {seoul(stock.data!.asOf).replace("T"," ")} · 포함 자산 {moneyAmount(row.includedAssets,row.currency)} · 기타·보관 계좌의 범위가 생활·저축 합계와 다릅니다.{row.unknownBalanceCount>0&&` · 기준점 미확인 ${row.unknownBalanceCount}개`}</p>
    </div>)}
    {stock.data?.hasUnsupportedCurrencies&&<p role="status" className="money-financial-notice">통화 근거가 다른 계좌는 합계에서 제외됩니다. 환율을 추정하지 않습니다.</p>}
    <section className="money-card money-representatives">
      <div className="money-section-heading"><h2>대표 계좌</h2><button disabled={!preferences.data} onClick={()=>setSettings(true)}>대표 계좌 설정 {ids.length} / 10</button></div>
      <LoadState error={preferences.error||balances.error} loading={preferences.loading||balances.loading}/>
      {(preferences.error||balances.error)&&<button onClick={()=>{retry("/overview/preferences");retry("/account-balances");}}>대표 계좌 다시 불러오기</button>}
      {!ids.length&&preferences.data&&<p className="money-empty">자주 보는 계좌를 최대 10개 지정하세요. 가계부 추적 계좌는 별도 설정입니다.</p>}
      {preferences.data&&visibleRows(preferences.data,expanded).map(row=><section className="money-representative-row" key={row.id}>
        {row.name&&<h3>{row.name}</h3>}
        <div className="money-representative-grid">{row.accountIds.map(id=>{
          const a=p.accounts.find(account=>account.id===id),balance=balances.data?.find(b=>b.account.id===id)?.balance;
          return <button key={id} disabled={!a} onClick={()=>p.navigate?.("/money/accounts?account="+id)}><span>{a?.displayName??"사용 불가 계좌"}</span><strong>{stock.data?.unsupportedCurrencyAccountIds?.includes(id)?"통화 확인 필요":moneyAmount(balance?.asOf?balance.amount:null)}</strong><small>{a?webAccountGroup(a.role).label+" · "+(roles[a.role]??"용도 미분류"):"대표 계좌 설정에서 제거해 주세요."}{a?.archived?" · 보관":""}{a?.includeInAssets===false?" · 자산 제외":""}</small><small>{balance?.asOf?seoul(balance.asOf).replace("T"," "):"기준 시각 없음"}</small></button>;
        })}</div>
      </section>)}
      {ids.length>5&&<button className="money-more" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"접기":`더 보기 ${ids.length-5}개`}</button>}
    </section>
    <h2 className="money-period-heading">기간 분석 <small>{p.period.from} — {p.period.to} · 현재 요약과 별도</small></h2>
    <LoadState error={period.error} loading={period.loading}/>{period.error&&<button onClick={()=>retry("/overview?"+query)}>기간 분석 다시 불러오기</button>}
    {data&&(data.hasMixedCurrencies||data.analyticsUnavailable)?<p className="money-financial-notice">서로 다른 통화의 거래가 있어 기간 합계를 원화로 표시할 수 없습니다. 금융 원장에서 통화별 금액을 확인하세요.</p>:data&&<>
      <section className="money-card"><div className="money-section-heading"><h2>수입의 배분</h2><button onClick={()=>p.navigate?.("/money/flow")}>흐름 탐색 →</button></div>
        <Waterfall income={data.kpis.income} spending={data.kpis.consumption} savings={data.kpis.savings} principal={data.kpis.loanPrincipal}/>
        <p className="money-muted">이자·수수료는 소비에 포함됩니다. 기간 배분 잔여는 현재 사용 가능 잔액과 다릅니다.</p>
        {data.kpis.unresolvedLoanPayments>0&&<p className="money-financial-notice">잠정 배분 · 구성 미확인 상환 {moneyAmount(data.kpis.unresolvedLoanPayments)}. 원금·이자를 추정하지 않습니다.</p>}
      </section>
      <div className="money-revision-composition"><SignedComposition title="수입 구성" items={income}/><SignedComposition title="소비 구성" items={spending}/><SignedComposition title="순저축 구성" items={[...savings].map(([label,amount])=>({label,amount}))}/></div>
    </>}
    <section className="money-card money-spending-pace"><h2>소비 속도</h2><p className="money-muted">이전 기간의 같은 경과일까지 누적 순소비를 비교합니다.</p><LoadState error={pace.error} loading={pace.loading}/>{pace.error&&<button onClick={()=>retry("/overview/spending-pace?"+query)}>소비 속도 다시 불러오기</button>}
      {pace.data?.analyticsUnavailable&&<p className="money-financial-notice">통화 확인이 필요해 소비 속도를 합산할 수 없습니다.</p>}{pace.data&&!pace.data.analyticsUnavailable&&<SpendingPace data={pace.data}/>}
    </section>
    {settings&&preferences.data&&<RepresentativeSettings {...p} initial={preferences.data} onClose={()=>setSettings(false)}/>}
  </>;
}

export function SignedComposition({title,items}:{title:string;items:{label:string;amount:number;onSelect?:()=>void}[]}) {
  const rows=items.filter(i=>i.amount!==0),max=Math.max(1,...rows.map(i=>Math.abs(i.amount)));
  return <section className="money-card"><div className="money-section-heading"><h2>{title}</h2><strong>{moneyAmount(rows.reduce((s,i)=>s+i.amount,0))}</strong></div><div className="money-signed-composition">{rows.map((i,index)=><div key={i.label+index}><button disabled={!i.onSelect} onClick={i.onSelect}>{i.label}</button><span className="money-signed-track"><i className={i.amount<0?"negative":"positive"} style={{width:`${Math.abs(i.amount)/max*50}%`}}/></span><strong>{moneyAmount(i.amount)}</strong></div>)}</div>{!rows.length&&<p className="money-empty">해당 기간 기록 없음</p>}<small>0축 기준 · 음수도 부호와 방향으로 표시</small></section>;
}
function Waterfall({income,spending,savings,principal}:{income:number;spending:number;savings:number;principal:number}) {
  const rows=periodWaterfall(income,spending,savings,principal),labels=["수입","소비","순저축","확인 원금 상환","기간 배분 잔여"],colors=["#759b89","#7b8f9d","#7899bd","#c3a567","#88a5b7"];
  const min=Math.min(0,...rows.flatMap(r=>[r.start,r.end])),max=Math.max(1,...rows.flatMap(r=>[r.start,r.end]));
  const y=(value:number)=>190-(value-min)/(max-min)*150;
  return <div className="money-waterfall"><svg viewBox="0 0 1000 240" role="img" aria-label={labels.map((l,i)=>l+" "+moneyAmount(rows[i].change)).join(", ")}><line x1="20" x2="980" y1={y(0)} y2={y(0)} stroke="#dde4ed"/>{rows.map((r,i)=><g key={labels[i]}><rect x={35+i*195} y={Math.min(y(r.start),y(r.end))} width="140" height={Math.max(2,Math.abs(y(r.start)-y(r.end)))} rx="4" fill={colors[i]}/><text x={105+i*195} y={Math.min(y(r.start),y(r.end))-10} textAnchor="middle">{moneyAmount(r.change)}</text><text x={105+i*195} y="223" textAnchor="middle">{labels[i]}</text>{i<3&&<line x1={175+i*195} x2={230+i*195} y1={y(r.end)} y2={y(r.end)} stroke="#bfcbd6" strokeDasharray="4 4"/>}</g>)}</svg></div>;
}
function SpendingPace({data}:{data:Pace}) {
  const values=data.buckets.flatMap(r=>[r.current,r.previous]),min=Math.min(0,...values),max=Math.max(1,...values),y=(n:number)=>150-(n-min)/(max-min)*120,x=(i:number)=>30+i/Math.max(1,data.buckets.length-1)*930;
  return <><div className="money-section-heading"><strong>현재 {moneyAmount(data.current)}</strong><span>동일 경과일 차이 {data.delta>0?"+":""}{moneyAmount(data.delta)}</span></div><svg viewBox="0 0 1000 180" role="img" aria-label={`이번 기간 누적 소비 ${moneyAmount(data.current)}, 이전 기간 ${moneyAmount(data.previous)}`}><line x1="30" x2="960" y1={y(0)} y2={y(0)} stroke="#e7ebf0"/>{(["current","previous"] as const).map(key=><polyline key={key} fill="none" stroke={key==="current"?"#678eb6":"#a4adb8"} strokeWidth="2" strokeDasharray={key==="previous"?"5 5":undefined} points={data.buckets.map((r,i)=>`${x(i)},${y(r[key])}`).join(" ")}/>)}{data.buckets.length===1&&<circle cx={x(0)} cy={y(data.buckets[0].current)} r="4" fill="#678eb6"/>}</svg><small>실선 이번 기간 · 점선 {data.comparisonFrom} — {data.comparisonTo} · 환불 차감 · 예산·청구 예측 아님</small>{data.unresolvedLoanPayments>0&&<p className="money-muted">구성 미확인 상환이 있어 잠정 비교입니다.</p>}</>;
}
