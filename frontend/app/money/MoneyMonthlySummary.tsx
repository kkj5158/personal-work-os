"use client";
import {categoryChartColor} from "@/lib/money/categoryChartColor";
import { useState } from "react";
import { categoryTotals } from "@/lib/money/categories";
import { donutSectors,v4Path,type V4Summary,loanRepaymentPath,repaymentWon,type LoanRepaymentSummary,type RepaymentPart,type MonthlyFilter } from "@/lib/money/monthly";
import {balanceEvidenceLabels,compositionPath,compositionPreferencePath,type CompositionPreference,type IncomeComposition,type StatisticalBalances,type StatisticalGroup} from "@/lib/money/monthly";
import type { ReactNode } from "react";
import type { MeaningKind } from "@/lib/money/meaning";
import { moneyApi,won,type Category } from "@/lib/money/model";
import {useMoneyCache} from "./MoneyDataProvider";
import { LoadState,useMoneyData } from "./MoneyWebData";

const COLORS=["#5b8def","#45ae99","#9771d7","#e1a34a","#e9788d","#57abc3","#718096"];
const SUPPORT_COLORS=["#9771d7","#b95c8c","#a16d36"];
const LOAN_COLORS=["#7865cb","#5383bf","#ba728e","#35887c","#a16d36"];
const REPAYMENT_PARTS=[
 {id:"PRINCIPAL",key:"principal",label:"원금",color:LOAN_COLORS[0]},
 {id:"INTEREST",key:"interest",label:"이자",color:LOAN_COLORS[1]},
 {id:"FEE",key:"fee",label:"수수료",color:LOAN_COLORS[2]},
 {id:"UNALLOCATED",key:"unallocatedAmount",label:"배분 미확정",color:LOAN_COLORS[3]},
] as const;
type Segment={id:string;label:string;amount:number;color?:string;formatted?:string;detail?:string;excludeFromRing?:boolean};
const segmentAmount=(row:Segment)=>row.formatted??won(row.amount);
function Donut({title,total,totalLabel,rows,selected,selection,onSelect,onBack,unavailable,loading,error,controls,empty,caption="선택 기간",coverage}:{title:string;total:number|null|undefined;totalLabel?:string;rows:Segment[];selected?:string;selection?:Segment;onSelect:(row:Segment)=>void;onBack?:()=>void;unavailable?:boolean;loading?:boolean;error?:string;controls?:ReactNode;empty?:string;caption?:string;coverage?:ReactNode}){
 const hasCredits=rows.some(row=>row.amount<0);
 const sectors=hasCredits?[]:donutSectors(rows.filter(row=>!row.excludeFromRing)),chosen=rows.find(row=>row.id===selected)??selection,circumference=2*Math.PI*82;
 return <section className="money-month-donut"><header><h3>{title}</h3>{onBack&&<button onClick={onBack}>상위 분류로</button>}{controls}</header>
  <div className="money-month-donut-body"><div className="money-month-ring"><svg viewBox="0 0 220 220" aria-label={`${title} ${caption}`}><circle cx="110" cy="110" r="82" fill="none" stroke="var(--money-border,#e2e8f0)" strokeWidth="27"/>{sectors.map((row,index)=>row.share>0&&<circle key={row.id} cx="110" cy="110" r="82" fill="none" stroke={row.color||COLORS[index%COLORS.length]} strokeWidth={row.id===selected?33:27} strokeDasharray={`${row.share*circumference} ${circumference}`} strokeDashoffset={-row.start*circumference} transform="rotate(-90 110 110)" tabIndex={0} role="button" aria-label={`${row.label} ${segmentAmount(row)} 거래 보기`} aria-pressed={row.id===selected} onClick={()=>onSelect(row)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(row);}}}><title>{row.label} · {segmentAmount(row)}</title></circle>)}</svg><div className="money-month-center"><small>{caption}</small><strong>{unavailable?"확인 필요":totalLabel??(total==null?"—":won(total))}</strong></div></div>
  <div className="money-month-legend">{rows.length?rows.map((row,index)=><button key={row.id} aria-pressed={selected===row.id} onClick={()=>onSelect(row)}><i style={{background:row.color||COLORS[index%COLORS.length]}}/><span>{row.label}{row.detail&&<small className="money-month-evidence">{row.detail}</small>}</span><strong>{segmentAmount(row)}</strong></button>):<p className="money-muted">{error?"구성 조회 실패":loading?"불러오는 중…":empty??"이 기간의 기록이 없습니다."}</p>}</div></div>
  {coverage??<p className="money-month-selection" aria-live="polite">{chosen?`${chosen.label} · ${segmentAmount(chosen)} · ${hasCredits?(chosen.amount<0?"차감":"금액") :((sectors.find(s=>s.id===chosen.id)?.share??0)*100).toFixed(1)+"%"}`:"분류를 선택하면 아래 거래표에 적용됩니다."}</p>}
  {rows.some(row=>row.amount<0)&&<small className="money-muted">음수 항목이 있어 구성비 대신 부호가 있는 금액을 표시합니다.</small>}
 </section>;
}
export function MoneyMonthlySummary({from,to,categories,scope,loanAccounts,filter,onFilter,navigate}:{from:string;to:string;categories:Category[];scope:string[]|null;loanAccounts:string[]|null;filter:MonthlyFilter|null;onFilter:(filter:MonthlyFilter|null)=>boolean;navigate?:(path:string)=>void}){
 const metrics=useMoneyData<V4Summary>(loanAccounts===null?null:v4Path(from,to,scope));
 const data=metrics.data;
 const cache=useMoneyCache();
 const preference=useMoneyData<CompositionPreference>(compositionPreferencePath);
 const income=useMoneyData<IncomeComposition>(compositionPath("income-composition",from,to,scope));
 const balance=useMoneyData<StatisticalBalances>(compositionPath("statistical-balances",from,to,scope));
 const [savingPreference,setSavingPreference]=useState(false);
 const [preferenceError,setPreferenceError]=useState("");
 const loan=useMoneyData<LoanRepaymentSummary>(loanRepaymentPath(from,to,loanAccounts));
 const [loanMode,setLoanMode]=useState<"loan"|"part">("loan");
 const [roots,setRoots]=useState<Partial<Record<MeaningKind,string>>>({});
 async function toggleSupport(enabled:boolean){
  if(!preference.data||savingPreference)return;
  if(!enabled&&filter?.kind==="FAMILY_SUPPORT"&&!onFilter(null))return;
  setSavingPreference(true);setPreferenceError("");
  try{await moneyApi.put(compositionPreferencePath,{includeFamilySupport:enabled,expectedVersion:preference.data.version});}
  catch(error){setPreferenceError(error instanceof Error?error.message:"표시 설정을 저장하지 못했습니다.");}
  finally{cache.invalidate(key=>key===compositionPreferencePath||key.startsWith("/v4/income-composition?"));setSavingPreference(false);}
 }
 function stock(title:string,group:StatisticalGroup|undefined){
  const rows=group?.members.map(row=>({id:row.accountId,label:row.displayName,amount:row.balance??0,color:row.color,excludeFromRing:!row.known,
   formatted:row.balance==null?"확인 필요":(row.status==="LEDGER_ESTIMATE"?"추정 ":"")+won(row.balance),
   detail:[balanceEvidenceLabels[row.reason??row.status],row.observedAt&&"최근 관측 "+new Date(row.observedAt).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})].filter(Boolean).join(" · ")}))??[];
  return <Donut key={title} title={title} caption="기준일 잔액" total={group?.total} unavailable={!!group&&group.total==null}
   rows={rows} loading={balance.loading} error={balance.error} empty="해당 용도의 계좌가 없습니다."
   coverage={group?<p className="money-month-selection">확인 {group.knownCount}/{group.memberCount}계좌{group.confirmedPartialSum!=null&&` · 확인된 부분 합계 ${won(group.confirmedPartialSum)}`}</p>:undefined}
   selected={filter?.kind==="STOCK"?filter.accountId:undefined}
   onSelect={row=>{const member=group?.members.find(m=>m.accountId===row.id);if(member&&balance.data)onFilter({kind:"STOCK",accountId:row.id,label:row.label,asOf:balance.data.asOfCutoff,member});}}/>;
 }

 const loanData=loan.data?.loanRepaymentBreakdown;
 const loanTotal=data?.loanRepayment;
 const loanRows:Segment[]=loanMode==="loan"
  ?loanData?.byLoan.map((row,index)=>({id:row.loanId??"unlinked",label:row.label,amount:Number(row.amount),formatted:repaymentWon(row.amount),color:LOAN_COLORS[index%LOAN_COLORS.length]}))??[]
  :loanData?REPAYMENT_PARTS.flatMap(({id,key,label,color})=>{
    const value=key==="unallocatedAmount"?(loan.data?.unallocatedAmount??loanData.byPart.unallocated??"0"):loanData.byPart[key];
    const amount=Number(value);
    return amount>0?[{id,label,amount,formatted:repaymentWon(value),color}]:[];
  }):[];
 const loanFilter=filter?.kind==="LOAN_PAYMENT"?filter:null;
 function changeLoanMode(next:"loan"|"part"){
  if(next===loanMode||(loanFilter&&!onFilter(null)))return;
  setLoanMode(next);
 }
 function balanceNote(group:StatisticalGroup|undefined){
  if(!group)return "선택 기간 기준일";
  const evidence=[...new Set(group.members.map(member=>balanceEvidenceLabels[member.reason??member.status]).filter(Boolean))];
  const partial=group.total==null&&group.confirmedPartialSum!=null?"확인된 부분 합계 "+won(group.confirmedPartialSum):"";
  return [balance.data&&new Date(balance.data.asOfCutoff).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"}),`확인 ${group.knownCount}/${group.memberCount}계좌`,partial,...evidence].filter(Boolean).join(" · ");
 }
 const kpis=[
  {label:"실제 소득",value:data?.actualIncome},
  {label:"전체 지출",value:data?.totalExpense,note:"일반 소비와 대출상환"},
  {label:"대출상환",formatted:loanTotal==null?"—":won(loanTotal),className:"money-month-loan",note:"추적 지출 계좌의 확정 상환액"},
  {label:"저축 잔액",value:balance.data?.savings.total,unavailable:!!balance.data&&balance.data.savings.total==null,className:"money-month-net",note:balanceNote(balance.data?.savings)},
  {label:"적금 잔액",value:balance.data?.installment.total,unavailable:!!balance.data&&balance.data.installment.total==null,note:balanceNote(balance.data?.installment)},
 ];
 return <div className="money-month-summary"><LoadState error={metrics.error} loading={metrics.loading}/><div className="money-month-kpis">{kpis.map(kpi=><section key={kpi.label} className={kpi.className}><small>{kpi.label}</small><strong>{kpi.unavailable?"확인 필요":kpi.formatted??(kpi.value==null?"—":won(kpi.value))}</strong><span>{kpi.note??"월 전체"}</span></section>)}</div>
 <div className="money-month-donuts">{([["INCOME","I"],["EXPENSE","E"]] as const).map(([kind,bucket])=>{
  const groups=categoryTotals(categories.filter(c=>c.kind===kind),data?.composition.filter(row=>row.bucket===bucket)??[]);
  const root=groups.find(g=>g.id===roots[kind]);
  const rows:Segment[]=(root?root.children:groups).map((row,index)=>({...row,color:categoryChartColor(row.id,categories,COLORS[index%COLORS.length])}));
  const support=kind==="INCOME"&&income.data?.includeFamilySupport;
  if(support&&!root)income.data?.composition.filter(row=>row.bucket==="FAMILY_SUPPORT"&&row.categoryId).forEach((row,index)=>{
   const category=categories.find(value=>value.id===row.categoryId);
   rows.push({id:"family:"+row.categoryId,label:category?.name??"부모님 지원",amount:row.amount,color:SUPPORT_COLORS[index%SUPPORT_COLORS.length]});
  });
  return <Donut key={kind} title={`${kind==="INCOME"?"소득":"일반 소비"} 구성${root?" · "+root.label:""}${support?" · 지원금 포함 표시":""}`}
   total={kind==="INCOME"?income.data?.chartIncome??data?.actualIncome:data?.consumption} rows={rows}
   controls={kind==="INCOME"?<label><input type="checkbox" checked={!!preference.data?.includeFamilySupport} disabled={!preference.data||preference.loading||income.loading||savingPreference}
    onChange={event=>void toggleSupport(event.currentTarget.checked)}/> 부모님 지원 포함</label>:undefined}
   loading={metrics.loading} error={metrics.error} selection={filter?.kind===kind?groups.find(g=>g.id===filter.categoryId):undefined}
   selected={filter?.kind===kind?filter.categoryId:filter?.kind==="FAMILY_SUPPORT"&&kind==="INCOME"?"family:"+filter.categoryId:undefined}
   onBack={root?()=>{if(onFilter(null))setRoots(old=>({...old,[kind]:undefined}));}:undefined} onSelect={row=>{
    if(row.id.startsWith("family:")){onFilter({kind:"FAMILY_SUPPORT",categoryId:row.id.slice(7),label:row.label});return;}
    if(onFilter({kind,categoryId:row.id,label:row.label})&&!root&&groups.find(g=>g.id===row.id)?.children.some(c=>!c.id.startsWith("direct:")))setRoots(old=>({...old,[kind]:row.id}));
   }}/>;
 })}
 <Donut title="대출상환 구성" caption="선택 기간" total={loanTotal==null?undefined:Number(loanTotal)} totalLabel={loanTotal==null?undefined:won(loanTotal)} rows={loanRows} loading={loan.loading} error={loan.error} empty="이 기간에 확정된 대출상환이 없습니다."
  controls={<div className="money-month-loan-toggle" role="group" aria-label="대출상환 보기">
   <button type="button" aria-pressed={loanMode==="loan"} onClick={()=>changeLoanMode("loan")}>대출별</button>
   <button type="button" aria-pressed={loanMode==="part"} onClick={()=>changeLoanMode("part")}>원금·이자</button>
  </div>}
  selected={loanFilter?(loanFilter.part??loanFilter.loanId??"unlinked"):undefined}
  onSelect={row=>onFilter(loanMode==="loan"?{kind:"LOAN_PAYMENT",loanId:row.id==="unlinked"?null:row.id,label:row.label}:{kind:"LOAN_PAYMENT",part:row.id as RepaymentPart,label:row.label})}/>
 {stock("저축 구성",balance.data?.savings)}{stock("적금 구성",balance.data?.installment)}</div>
 <LoadState error={preferenceError||preference.error||income.error||balance.error} loading={false} hideLastChecked/>
 {balance.data&&<p className="money-muted">기준 시각 {new Date(balance.data.asOfCutoff).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} KST
  {balance.data.unresolved.length>0&&" · 계좌 검토 "+balance.data.unresolved.map(row=>row.displayName+" ("+balanceEvidenceLabels[row.reason]+")").join(", ")}</p>}
 <LoadState error={loan.error?"대출상환 조회 실패 · "+loan.error:""} loading={loan.loading} lastSuccessAt={loan.lastSuccessAt} hideLastChecked/>
 {!!loan.data?.unallocatedCount&&<p className="money-muted">배분 미확정 {loan.data.unallocatedCount}건 · {repaymentWon(loan.data.unallocatedAmount??loanData?.byPart.unallocated??"0")}</p>}
 {!!data?.unknownTrackingCount&&<p className="money-muted">추적 이력 미확인 {data.unknownTrackingCount}건 · 확인 가능한 거래만 집계했습니다.</p>}
 <p className="money-muted">저축 순유입 {data?.savingsNet==null?"—":won(data.savingsNet)}{data && data.unknownSavingsCount>0 && ` · 계좌 이력 미확인 ${data.unknownSavingsCount}건`}{data && data.unqualifiedIncomeCount>0 && ` · 소득 근거 미확인 ${data.unqualifiedIncomeCount}건`}</p>
 {filter&&<div className="money-month-filter" role="status">거래표 필터 · {filter.label}<button onClick={()=>onFilter(null)}>필터 해제</button><small>소득·소비·상환 합계는 선택 기간 전체 기준입니다.</small></div>}
 </div>;
}
