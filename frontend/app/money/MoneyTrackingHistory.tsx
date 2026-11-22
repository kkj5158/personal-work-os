"use client";
import {useState} from "react";
import {moneyApi as api,type Account} from "@/lib/money/model";
import {moneyAmount} from "@/lib/money/accounts";

type Snapshot={month:string;currency:string;flows:{actualIncome:number;consumption:number;totalExpense:number;loanRepayment:number};balances:{savings:{total:number|null};installment:{total:number|null}}};
type Change={accountId:string;kind:string;selected:boolean;from:string;through:string;expectedVersion:number;asOf:string};
type Impact={before:Snapshot[];after:Snapshot[];fingerprint:string};
export function MoneyTrackingHistory({accounts,version,onSaved}:{accounts:Account[];version:number;onSaved:()=>void}){
 const [account,setAccount]=useState(""),[kind,setKind]=useState("EXPENSE"),[selected,setSelected]=useState(true);
 const [from,setFrom]=useState(""),[through,setThrough]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [preview,setPreview]=useState<{change:Change;impact:Impact}|null>(null);
 async function submit(confirm:boolean){
  setBusy(true);setError("");
  try{
   if(confirm&&preview){
    await api.post("/tracking/history/apply",{change:preview.change,fingerprint:preview.impact.fingerprint});onSaved();
   }else{
    const change={accountId:account,kind,selected,from,through,expectedVersion:version,asOf:new Date().toISOString()};
    const impact=await api.post<Impact>("/tracking/history/preview",change);setPreview({change,impact});
   }
  }catch(e){setPreview(null);setError(e instanceof Error?e.message:"추적 이력 처리 실패");}finally{setBusy(false);}
 }
 return <details><summary>과거 적용 기간 변경</summary><fieldset disabled={busy} onChange={()=>setPreview(null)}>
  <label>계좌<select value={account} onChange={e=>setAccount(e.target.value)}><option value="">선택</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName}</option>)}</select></label>
  <label>추적 종류<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.entries({INCOME:"수입",EXPENSE:"지출",SAVINGS:"저축",INSTALLMENT:"적금"}).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
  <label>시작일 (한국시간)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
  <label>종료일 (포함)<input type="date" value={through} min={from} onChange={e=>setThrough(e.target.value)}/></label>
  <label><input type="checkbox" checked={selected} onChange={e=>setSelected(e.target.checked)}/>기간 중 추적</label>
  <button type="button" disabled={!account||!from||!through} onClick={()=>void submit(false)}>월별 영향 미리보기</button>
 </fieldset>{error&&<p role="alert">{error}</p>}{preview&&<section aria-label="소급 적용 영향">
  <p>{accounts.find(a=>a.id===account)?.displayName} · {from} ~ {through} · {selected?"추적 포함":"추적 제외"}</p>
  {preview.impact.before.map((before,i)=>{const after=preview.impact.after[i];const values=(v:Snapshot)=>[v.flows.actualIncome,v.flows.totalExpense,v.flows.loanRepayment,v.balances.savings.total,v.balances.installment.total];
   return <details key={before.month+before.currency} open><summary>{before.month} · {before.currency}</summary><dl>{["실제 소득","전체 지출","대출 상환","저축 잔액","적금 잔액"].map((label,j)=><div key={label}><dt>{label}</dt><dd>{moneyAmount(values(before)[j],before.currency)} → {moneyAmount(values(after)[j],after.currency)}</dd></div>)}</dl></details>;
  })}<button type="button" disabled={busy} onClick={()=>void submit(true)}>이 기간의 변경 확정</button>
 </section>}</details>;
}
