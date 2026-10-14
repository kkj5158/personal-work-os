"use client";
import {categoryChartColor} from "@/lib/money/categoryChartColor";
import { useState } from "react";
import { categoryTotals } from "@/lib/money/categories";
import { donutSectors,savingsPath,type MonthlyFilter,type SavingsPage } from "@/lib/money/monthly";
import type { MeaningKind } from "@/lib/money/meaning";
import { won,type Category } from "@/lib/money/model";
import { LoadState,useMoneyData,type BookPage } from "./MoneyWebData";

const COLORS=["#5b8def","#45ae99","#9771d7","#e1a34a","#e9788d","#57abc3","#718096"];
type Segment={id:string;label:string;amount:number;color?:string};
function Donut({title,total,rows,selected,selection,onSelect,onBack,unavailable}:{title:string;total:number|null|undefined;rows:Segment[];selected?:string;selection?:Segment;onSelect:(row:Segment)=>void;onBack?:()=>void;unavailable?:boolean}){
 const sectors=donutSectors(rows),chosen=rows.find(row=>row.id===selected)??selection,circumference=2*Math.PI*82;
 return <section className="money-month-donut"><header><h3>{title}</h3>{onBack&&<button onClick={onBack}>상위 분류로</button>}</header>
  <div className="money-month-donut-body"><div className="money-month-ring"><svg viewBox="0 0 220 220" aria-label={`${title} 월 전체 구성`}><circle cx="110" cy="110" r="82" fill="none" stroke="var(--money-border,#e2e8f0)" strokeWidth="27"/>{!unavailable&&sectors.map((row,index)=>row.share>0&&<circle key={row.id} cx="110" cy="110" r="82" fill="none" stroke={row.color||COLORS[index%COLORS.length]} strokeWidth={row.id===selected?33:27} strokeDasharray={`${row.share*circumference} ${circumference}`} strokeDashoffset={-row.start*circumference} transform="rotate(-90 110 110)" tabIndex={0} role="button" aria-label={`${row.label} ${won(row.amount)} 거래 필터`} aria-pressed={row.id===selected} onClick={()=>onSelect(row)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(row);}}}><title>{row.label} · {won(row.amount)}</title></circle>)}</svg><div className="money-month-center"><small>월 전체</small><strong>{unavailable?"확인 필요":total==null?"—":won(total)}</strong></div></div>
  <div className="money-month-legend">{unavailable?<p className="money-muted">통화 또는 계좌 이력을 확인하세요.</p>:rows.length?rows.map((row,index)=><button key={row.id} aria-pressed={selected===row.id} onClick={()=>onSelect(row)}><i style={{background:row.color||COLORS[index%COLORS.length]}}/><span>{row.label}</span><strong>{won(row.amount)}</strong></button>):<p className="money-muted">이 기간의 기록이 없습니다.</p>}</div></div>
  <p className="money-month-selection" aria-live="polite">{chosen?`${chosen.label} · ${won(chosen.amount)} · ${total?((chosen.amount/total)*100).toFixed(1):"0"}%`:"분류 또는 계좌를 선택하면 아래 거래표에 적용됩니다."}</p>{rows.some(row=>row.amount<0)&&<small className="money-muted">환불 차감 후 음수 분류는 범례에 표시합니다.</small>}
 </section>;
}
export function MoneyMonthlySummary({from,to,categories,filter,onFilter}:{from:string;to:string;categories:Category[];filter:MonthlyFilter|null;onFilter:(filter:MonthlyFilter|null)=>void}){
 const query=new URLSearchParams({from,to,limit:"1",offset:"0"});
 const income=useMoneyData<BookPage>("/bookkeeping?"+query+"&kind=INCOME"),expense=useMoneyData<BookPage>("/bookkeeping?"+query+"&kind=EXPENSE"),savings=useMoneyData<SavingsPage>(savingsPath(from,to));
 const [roots,setRoots]=useState<Partial<Record<MeaningKind,string>>>({});
 const totals=savings.data?.totals;
 return <div className="money-month-summary"><LoadState error={income.error||expense.error||savings.error} loading={income.loading||expense.loading||savings.loading}/><div className="money-month-kpis">{[{label:"수입",value:income.data?.summary.total,unavailable:income.data?.analyticsUnavailable},{label:"지출",value:expense.data?.summary.total,unavailable:expense.data?.analyticsUnavailable},{label:"저축 총적립액",value:totals?.gross,unavailable:totals?.analyticsUnavailable},{label:"순저축액",value:totals?.net,unavailable:totals?.analyticsUnavailable}].map((kpi,index)=><section key={kpi.label} className={index===3?"money-month-net":""}><small>{kpi.label}</small><strong>{kpi.unavailable?"확인 필요":kpi.value==null?"—":won(kpi.value)}</strong><span>{index===3?"경계 입금 − 인출":index===2?"일반 → 저축·적금": "월 전체"}</span></section>)}</div>
 <div className="money-month-donuts">{([["INCOME",income],["EXPENSE",expense]] as const).map(([kind,data])=>{const groups=categoryTotals(categories.filter(c=>c.kind===kind),data.data?.composition??[]),root=groups.find(g=>g.id===roots[kind]),rows=root?root.children:groups;return <Donut key={kind} title={`${kind==="INCOME"?"수입":"지출"} 구성${root?" · "+root.label:""}`} total={data.data?.summary.total} rows={rows.map((row,index)=>({...row,color:categoryChartColor(row.id,categories,COLORS[index%COLORS.length])}))} unavailable={data.data?.analyticsUnavailable} selection={filter?.kind===kind?groups.find(g=>g.id===filter.categoryId):undefined} selected={filter?.kind===kind?filter.categoryId:undefined} onBack={root?()=>{setRoots(old=>({...old,[kind]:undefined}));onFilter(null);}:undefined} onSelect={row=>{if(!root&&groups.find(g=>g.id===row.id)?.children.some(c=>!c.id.startsWith("direct:")))setRoots(old=>({...old,[kind]:row.id}));onFilter({kind,categoryId:row.id,label:row.label});}}/>;})}
 <Donut title="저축 구성" total={totals?.gross} unavailable={totals?.analyticsUnavailable} rows={totals?.composition.map(row=>({id:row.accountId,label:row.label,amount:row.amount}))??[]} selected={filter?.kind==="SAVINGS"?filter.accountId:undefined} onSelect={row=>onFilter({kind:"SAVINGS",accountId:row.id,label:row.label})}/></div>
 {totals&&<p className="money-muted">확정된 내 계좌 이체 기준 · 저축계좌 간 이동 제외 · 인출 {totals.withdrawals==null?"확인 필요":won(totals.withdrawals)}{totals.unknownHistoryCount>0&&` · 계좌 그룹 이력 미확인 ${totals.unknownHistoryCount}건`}{totals.currencies.some(c=>c!=="KRW")&&` · 통화별 확인 필요 (${totals.currencies.join(" · ")})`}</p>}
 {filter&&<div className="money-month-filter" role="status">거래표 필터 · {filter.label}<button onClick={()=>onFilter(null)}>필터 해제</button><small>KPI와 도넛 중앙값은 월 전체 금액입니다.</small></div>}
 </div>;
}
