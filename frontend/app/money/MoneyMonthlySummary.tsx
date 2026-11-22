"use client";
import {categoryChartColor} from "@/lib/money/categoryChartColor";
import { useState } from "react";
import { categoryTotals } from "@/lib/money/categories";
import { donutSectors,v4Path,type V4Summary,loanRepaymentPath,repaymentWon,type LoanRepaymentSummary,type RepaymentPart,type MonthlyFilter } from "@/lib/money/monthly";
import type { ReactNode } from "react";
import type { MeaningKind } from "@/lib/money/meaning";
import { won,type Category } from "@/lib/money/model";
import { LoadState,useMoneyData } from "./MoneyWebData";

const COLORS=["#5b8def","#45ae99","#9771d7","#e1a34a","#e9788d","#57abc3","#718096"];
const LOAN_COLORS=["#7865cb","#5383bf","#ba728e","#35887c","#a16d36"];
const REPAYMENT_PARTS=[
 {id:"PRINCIPAL",key:"principal",label:"원금",color:LOAN_COLORS[0]},
 {id:"INTEREST",key:"interest",label:"이자",color:LOAN_COLORS[1]},
 {id:"FEE",key:"fee",label:"수수료",color:LOAN_COLORS[2]},
 {id:"UNALLOCATED",key:"unallocatedAmount",label:"배분 미확정",color:LOAN_COLORS[3]},
] as const;
type Segment={id:string;label:string;amount:number;color?:string;formatted?:string};
const segmentAmount=(row:Segment)=>row.formatted??won(row.amount);
function Donut({title,total,totalLabel,rows,selected,selection,onSelect,onBack,unavailable,loading,error,controls,empty,caption="월 전체"}:{title:string;total:number|null|undefined;totalLabel?:string;rows:Segment[];selected?:string;selection?:Segment;onSelect:(row:Segment)=>void;onBack?:()=>void;unavailable?:boolean;loading?:boolean;error?:string;controls?:ReactNode;empty?:string;caption?:string}){
 const sectors=donutSectors(rows),chosen=rows.find(row=>row.id===selected)??selection,circumference=2*Math.PI*82;
 return <section className="money-month-donut"><header><h3>{title}</h3>{onBack&&<button onClick={onBack}>상위 분류로</button>}{controls}</header>
  <div className="money-month-donut-body"><div className="money-month-ring"><svg viewBox="0 0 220 220" aria-label={`${title} ${caption}`}><circle cx="110" cy="110" r="82" fill="none" stroke="var(--money-border,#e2e8f0)" strokeWidth="27"/>{!unavailable&&sectors.map((row,index)=>row.share>0&&<circle key={row.id} cx="110" cy="110" r="82" fill="none" stroke={row.color||COLORS[index%COLORS.length]} strokeWidth={row.id===selected?33:27} strokeDasharray={`${row.share*circumference} ${circumference}`} strokeDashoffset={-row.start*circumference} transform="rotate(-90 110 110)" tabIndex={0} role="button" aria-label={`${row.label} ${segmentAmount(row)} 거래 필터`} aria-pressed={row.id===selected} onClick={()=>onSelect(row)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(row);}}}><title>{row.label} · {segmentAmount(row)}</title></circle>)}</svg><div className="money-month-center"><small>{caption}</small><strong>{unavailable?"확인 필요":totalLabel??(total==null?"—":won(total))}</strong></div></div>
  <div className="money-month-legend">{unavailable?<p className="money-muted">통화 또는 계좌 이력을 확인하세요.</p>:rows.length?rows.map((row,index)=><button key={row.id} aria-pressed={selected===row.id} onClick={()=>onSelect(row)}><i style={{background:row.color||COLORS[index%COLORS.length]}}/><span>{row.label}</span><strong>{segmentAmount(row)}</strong></button>):<p className="money-muted">{error?"구성 조회 실패":loading?"불러오는 중…":empty??"이 기간의 기록이 없습니다."}</p>}</div></div>
  <p className="money-month-selection" aria-live="polite">{chosen?`${chosen.label} · ${segmentAmount(chosen)} · ${total?((chosen.amount/total)*100).toFixed(1):"0"}%`:"분류 또는 계좌를 선택하면 아래 거래표에 적용됩니다."}</p>{rows.some(row=>row.amount<0)&&<small className="money-muted">환불 차감 후 음수 분류는 범례에 표시합니다.</small>}
 </section>;
}
export function MoneyMonthlySummary({from,to,categories,scope,loanAccounts,filter,onFilter}:{from:string;to:string;categories:Category[];scope:string[]|null;loanAccounts:string[]|null;filter:MonthlyFilter|null;onFilter:(filter:MonthlyFilter|null)=>boolean}){
 const metrics=useMoneyData<V4Summary>(loanAccounts===null?null:v4Path(from,to,scope));
 const data=metrics.data;
 const loan=useMoneyData<LoanRepaymentSummary>(loanRepaymentPath(from,to,loanAccounts));
 const [loanMode,setLoanMode]=useState<"loan"|"part">("loan");
 const [roots,setRoots]=useState<Partial<Record<MeaningKind,string>>>({});

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
 const kpis=[
  {label:"실제 소득",value:data?.actualIncome},
  {label:"전체 지출",value:data?.totalExpense,note:"일반 소비와 대출상환"},
  {label:"대출상환",formatted:loanTotal==null?"—":won(loanTotal),className:"money-month-loan",note:"추적 지출 계좌의 확정 상환액"},
  {label:"저축 납입액",value:data?.savingsIn,unavailable:!!data && data.savingsIn==null,className:"money-month-net",note:"저축통장으로 들어간 이체"},
 ];
 return <div className="money-month-summary"><LoadState error={metrics.error} loading={metrics.loading}/><div className="money-month-kpis">{kpis.map(kpi=><section key={kpi.label} className={kpi.className}><small>{kpi.label}</small><strong>{kpi.unavailable?"확인 필요":kpi.formatted??(kpi.value==null?"—":won(kpi.value))}</strong><span>{kpi.note??"월 전체"}</span></section>)}</div>
 <div className="money-month-donuts">{([["INCOME","I"],["EXPENSE","E"]] as const).map(([kind,bucket])=>{const groups=categoryTotals(categories.filter(c=>c.kind===kind),data?.composition.filter(row=>row.bucket===bucket)??[]),root=groups.find(g=>g.id===roots[kind]),rows=root?root.children:groups;return <Donut key={kind} title={`${kind==="INCOME"?"실제 소득":"일반 소비"} 구성${root?" · "+root.label:""}`} total={kind==="INCOME"?data?.actualIncome:data?.consumption} rows={rows.map((row,index)=>({...row,color:categoryChartColor(row.id,categories,COLORS[index%COLORS.length])}))} loading={metrics.loading} error={metrics.error} selection={filter?.kind===kind?groups.find(g=>g.id===filter.categoryId):undefined} selected={filter?.kind===kind?filter.categoryId:undefined} onBack={root?()=>{setRoots(old=>({...old,[kind]:undefined}));onFilter(null);}:undefined} onSelect={row=>{if(!root&&groups.find(g=>g.id===row.id)?.children.some(c=>!c.id.startsWith("direct:")))setRoots(old=>({...old,[kind]:row.id}));onFilter({kind,categoryId:row.id,label:row.label});}}/>;})}
 <Donut title="대출상환 구성" caption="선택 기간" total={loanTotal==null?undefined:Number(loanTotal)} totalLabel={loanTotal==null?undefined:won(loanTotal)} rows={loanRows} loading={loan.loading} error={loan.error} empty="이 기간에 확정된 대출상환이 없습니다."
  controls={<div className="money-month-loan-toggle" role="group" aria-label="대출상환 보기">
   <button type="button" aria-pressed={loanMode==="loan"} onClick={()=>changeLoanMode("loan")}>대출별</button>
   <button type="button" aria-pressed={loanMode==="part"} onClick={()=>changeLoanMode("part")}>원금·이자</button>
  </div>}
  selected={loanFilter?(loanFilter.part??loanFilter.loanId??"unlinked"):undefined}
  onSelect={row=>onFilter(loanMode==="loan"?{kind:"LOAN_PAYMENT",loanId:row.id==="unlinked"?null:row.id,label:row.label}:{kind:"LOAN_PAYMENT",part:row.id as RepaymentPart,label:row.label})}/>
 <Donut title="저축 유입·유출" total={data?.savingsMovement} unavailable={!!data && data.savingsMovement==null} loading={metrics.loading} error={metrics.error}
  rows={data ? [{id:"SI",label:"저축 납입",amount:data.savingsIn??0},{id:"SO",label:"저축 인출",amount:data.savingsOut??0}].filter(r=>r.amount>0) : []}
  selected={filter?.kind==="SAVINGS"?filter.bucket:undefined} onSelect={row=>onFilter({kind:"SAVINGS",bucket:row.id==="SI"?"SI":"SO",label:row.label})}/></div>
 <LoadState error={loan.error?"대출상환 조회 실패 · "+loan.error:""} loading={loan.loading} lastSuccessAt={loan.lastSuccessAt} hideLastChecked/>
 {!!loan.data?.unallocatedCount&&<p className="money-muted">배분 미확정 {loan.data.unallocatedCount}건 · {repaymentWon(loan.data.unallocatedAmount??loanData?.byPart.unallocated??"0")}</p>}
 <p className="money-muted">저축 순유입 {data?.savingsNet==null?"—":won(data.savingsNet)}{data && data.unknownSavingsCount>0 && ` · 계좌 이력 미확인 ${data.unknownSavingsCount}건`}{data && data.unqualifiedIncomeCount>0 && ` · 소득 근거 미확인 ${data.unqualifiedIncomeCount}건`}</p>
 {filter&&<div className="money-month-filter" role="status">거래표 필터 · {filter.label}<button onClick={()=>onFilter(null)}>필터 해제</button><small>KPI와 도넛 중앙값은 선택 기간 전체 금액입니다.</small></div>}
 </div>;
}
