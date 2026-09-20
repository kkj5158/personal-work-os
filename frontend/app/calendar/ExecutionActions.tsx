"use client";
import {useState} from "react";
import {apiClient} from "@/lib/api/client";
import type {ActualSourceType} from "@/lib/api/types";
import type {ActualRecord} from "./calendarWrites";
import type {CalendarEditorValue} from "./editorModel";
export interface Execution {planId:string;sourceType:ActualSourceType;sourceId:string;running:boolean;startAt:string|null;actual:ActualRecord}
export function ExecutionActions({selected,executions,refresh,notify,beforeAction}:{selected:CalendarEditorValue|null;executions:Execution[];refresh:()=>Promise<void>;notify:(v:{message:string})=>void;beforeAction:()=>Promise<boolean>}) {
 const [busy,setBusy]=useState(false),[confirm,setConfirm]=useState<string|null>(null),[history,setHistory]=useState<string|null>(null),[start,setStart]=useState(""),[end,setEnd]=useState("");
 const running=executions.find(e=>e.running),linked=executions.find(e=>e.planId===selected?.id),plan=selected?.kind==="plan" && selected.id ? selected:null;
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date());
 async function run(action:()=>Promise<unknown>){setBusy(true);try{if(!await beforeAction()){notify({message:"편집 중인 입력을 확인한 뒤 다시 실행하세요."});return;}await action();await refresh();setConfirm(null);setHistory(null);}catch(e){notify({message:e instanceof Error?e.message:"실행을 저장하지 못했습니다."});}finally{setBusy(false);}}
 function begin(){if(!plan)return;if(running){setConfirm(plan.id);return;}void run(()=>apiClient.post(`/api/calendar/executions/${plan.id}/start`,{}));}
 return <div className="cal-execution-actions" aria-label="계획 실행">
  {running && <div role="status"><strong>● 실행 중 · {running.actual.title}</strong> <span>{running.startAt?.replace("T"," ")}</span> <button disabled={busy} onClick={()=>void run(()=>apiClient.post(`/api/calendar/executions/${running.planId}/finish`,{}))}>종료</button> <button disabled={busy} onClick={()=>{setStart(running.startAt ?? "");setEnd(`${running.startAt?.slice(0,10)}T23:59`);setHistory(running.planId);}}>종료 시각 보정</button> <button disabled={busy} onClick={()=>void run(()=>apiClient.delete(`/api/calendar/executions/${running.planId}`))}>오시작 취소</button></div>}
  {plan && <div><strong>{plan.title}</strong> {linked ? <span>{linked.running ? "실행 중" : "Actual 연결됨 · 계획은 보존됩니다"}</span> : <><button disabled={busy || plan.date>today} onClick={begin}>실행</button> <button disabled={busy || plan.date>today} onClick={()=>{setStart(`${plan.date}T${plan.start}`);setEnd(`${plan.date}T${plan.end}`);setHistory(plan.id);}}>사후 Actual 기록</button></>}</div>}
  {confirm && <div role="alertdialog" aria-label="기존 실행 종료 확인"><p>진행 중인 ‘{running?.actual.title}’을 종료하고 새 계획을 실행할까요?</p><button disabled={busy} onClick={()=>void run(()=>apiClient.post(`/api/calendar/executions/${confirm}/start`,{finishRunningPlanId:running?.planId}))}>종료하고 실행</button><button onClick={()=>setConfirm(null)}>유지</button></div>}
  {history && <form onSubmit={e=>{e.preventDefault();void run(()=>apiClient.post(`/api/calendar/executions/${history}/history`,{startAt:start,endAt:end}));}}><label>실제 시작<input required type={running?.planId===history ? "text" : "datetime-local"} step="any" readOnly={running?.planId===history} value={start} onChange={e=>setStart(e.target.value)}/></label><label>실제 종료<input required type="datetime-local" step="any" value={end} onChange={e=>setEnd(e.target.value)}/></label><button disabled={busy}>기록</button><button type="button" onClick={()=>setHistory(null)}>취소</button></form>}
 </div>;
}
