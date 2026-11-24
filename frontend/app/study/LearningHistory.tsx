"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {addDays} from "@/lib/study/model";
import {duration,emptySummary,learningPort,type Allocation,type LearningPort,type LearningRecord,type RecordHeader,type Stats,type Summary} from "@/lib/study/learning";

type Data={month:string;stats:Stats;open:LearningRecord|null};
const kst=(instant:string)=>new Date(instant).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
export function useLearningHistory(owner:string|undefined,month:string){
  const port=useMemo(()=>owner?learningPort(owner):null,[owner]);
  const [generation,setGeneration]=useState(0), [data,setData]=useState<Data|null>(null),[error,setError]=useState("");
  useEffect(()=>{
    if(!port)return;
    let active=true;
    setData(null);setError("");
    Promise.all([port.stats(month),port.current()]).then(([stats,current])=>{
      if(active)setData({month,stats,open:current.session});
    }).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[port,month,generation]);
  useEffect(()=>{if(!port)return;const focus=()=>setGeneration(x=>x+1);window.addEventListener("focus",focus);return ()=>window.removeEventListener("focus",focus);},[port]);
  return {port,data:data?.month===month?data:null,error,generation,refresh:()=>setGeneration(x=>x+1)};
}
type History=ReturnType<typeof useLearningHistory>;
export function LearningChart({history,selected,select}:{history:History;selected:string;select:(s:string)=>void}){
  const {data,error,port,refresh}=history;
  if(!port)return null;
  if(!data)return <div role="status" className="study-panel">{error?<>{error} <button onClick={refresh}>학습 통계 다시 읽기</button></>:"대화 학습 통계를 불러오는 중…"}</div>;
  const {stats,open}=data,max=Math.max(1,...stats.daily.map(x=>x.effectiveSeconds));
  return <section className="study-panel"><h2>대화 학습</h2>
    <div className="study-stats">{[[duration(stats.totalSeconds),"기록 시간"],[stats.studyDays+"일","학습한 날"],[stats.distinctSessionCount+"회","완료한 대화"],[duration(stats.averageSeconds),"학습일 평균"]].map(([n,label])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>
    <div className="learning-bars" role="group" aria-label="일별 대화 학습 시간">{stats.daily.map(d=><button key={d.date} title={d.date+" · "+duration(d.effectiveSeconds)} aria-label={d.date+" 대화 학습 "+duration(d.effectiveSeconds)} aria-pressed={selected===d.date} onClick={()=>select(d.date)}><i style={{height:(2+56*d.effectiveSeconds/max)+"px"}}/><small>{Number(d.date.slice(-2))}</small></button>)}</div>
    {open&&<Pairing key={open.sessionId} record={open} port={port}/>}</section>;
}
function Pairing({record,port}:{record:LearningRecord;port:LearningPort}){
  const [device,setDevice]=useState(""),[code,setCode]=useState(""),[err,setErr]=useState("");
  return <div><h3>열린 대화 · {record.status==="PAUSED"?"수동 일시정지":"진행 중"}</h3><p>측정 연결 {record.bindingState} · 현재 감지 {duration(record.provisional?.measuredSeconds??0)} · 미관측 {duration(record.provisional?.unobservedSeconds??0)}</p>
    <p>ChatGPT에서 일시정지, 재개, 완료 또는 취소를 요청할 수 있습니다.</p>
    <details><summary>이 대화에 Chrome 연결</summary><p>학습할 대화의 POS 확장에서 기기 코드를 받은 뒤 여기에 붙여넣으세요.</p>
    <label>기기 코드<input value={device} maxLength={64} onChange={e=>{setDevice(e.target.value.trim());setCode("");}}/></label>
    <button disabled={!/^[a-f0-9]{64}$/.test(device)} onClick={async()=>{try{setErr("");setCode((await port.pair(record.sessionId,device)).challenge);}catch(e){setErr(String(e));}}}>5분 확인 코드 발급</button>
    {code&&<label>같은 대화의 확장에 입력<input readOnly value={code}/></label>}{err&&<p role="alert">{err}</p>}</details></div>;
}
type FormAction="manual"|"update"|"delete"|"restore";
const groups=[["topics","주제"],["keyTakeaways","핵심 내용"],["userInsights","사용자가 말한 통찰"],["openQuestions","남은 질문"]] as const;
const inputKst=(s:string)=>new Date(Date.parse(s)+9*3600_000).toISOString().slice(0,19);
function Editor({action,port,record,date,done,close}:{action:FormAction;port:LearningPort;record?:LearningRecord;date:string;done:()=>void;close:()=>void}){
  const [sum,setSum]=useState<Summary>(()=>({...emptySummary(),...record?.summary}));
  const [reason,setReason]=useState(""),[adjust,setAdjust]=useState(action==="manual");
  const [start,setStart]=useState(record?inputKst(record.effectiveStart):date+"T09:00:00"),[end,setEnd]=useState(record?.effectiveEnd?inputKst(record.effectiveEnd):date+"T09:30:00");
  const [days,setDays]=useState((record?.allocations??[{date,effectiveSeconds:1800}]).map(x=>x.date+" "+x.effectiveSeconds).join("\n"));
  const [err,setErr]=useState(""),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const pending=useRef<{path:string;method:string;body:Record<string,unknown>;key:string}|null>(null);
  const editing=action==="manual"||action==="update";
  async function submit(){
    if(busy)return;setBusy(true);setErr("");
    try{
      if(!pending.current){
        const body:Record<string,unknown>={reason};
        if(record)body.expectedRevision=record.revision;
        if(editing)body.summary=sum;
        if(editing&&adjust){
          const allocations:Allocation[]=days.trim().split(/\n/).map(line=>{
            const m=/^(\d{4}-\d{2}-\d{2})\s+(\d+)$/.exec(line.trim());
            if(!m)throw Error("날짜와 초를 한 줄씩 입력하세요.");return {date:m[1],effectiveSeconds:Number(m[2])};
          });
          Object.assign(body,{effectiveStart:new Date(start+"+09:00").toISOString(),effectiveEnd:new Date(end+"+09:00").toISOString(),allocations});
        }
        const path="learning-sessions/"+(action==="manual"?"manual":record!.sessionId+(action==="restore"?"/restore":""));
        pending.current={path,method:action==="delete"?"DELETE":action==="update"?"PATCH":"POST",body,key:crypto.randomUUID()};
      }
      const p=pending.current;await port.write(p.path,p.method,p.body,p.key,uncertain);pending.current=null;done();
    }catch(e){
      if(pending.current && (!(e instanceof Error && "status" in e)||Number((e as {status?:number}).status)>=500)){setUncertain(true);}
      else{pending.current=null;setUncertain(false);}setErr(String(e));
    }finally{setBusy(false);}
  }
  return <form className="study-panel learning-editor" onSubmit={e=>{e.preventDefault();void submit();}}>
    <fieldset disabled={busy||uncertain}>{editing&&<><label>제목<input required maxLength={200} value={sum.title} onChange={e=>setSum({...sum,title:e.target.value})}/></label>
    <label>학습 요약<textarea maxLength={8000} value={sum.summary} onChange={e=>setSum({...sum,summary:e.target.value})}/></label>
    {groups.map(([key,label])=><label key={key}>{label} · 한 줄에 하나<textarea value={sum[key].join("\n")} onChange={e=>setSum({...sum,[key]:e.target.value?e.target.value.split("\n"):[]})}/></label>)}
    <label>다음 학습 지점<input value={sum.nextStudyPoint??""} onChange={e=>setSum({...sum,nextStudyPoint:e.target.value||undefined})}/></label>
    <label>요약 범위<select value={sum.summaryCoverage} onChange={e=>setSum({...sum,summaryCoverage:e.target.value as Summary["summaryCoverage"]})}><option value="PARTIAL_CONTEXT">일부 맥락</option><option value="AVAILABLE_CONTEXT">확인 가능한 맥락</option></select></label>
    {action==="update"&&<label><input type="checkbox" checked={adjust} onChange={e=>setAdjust(e.target.checked)}/> 시간 정정</label>}
    {adjust&&<><label>시작 · 한국 시간<input required type="datetime-local" step="1" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>종료 · 한국 시간<input required type="datetime-local" step="1" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label>날짜별 시간 · YYYY-MM-DD 초<textarea required value={days} onChange={e=>setDays(e.target.value)}/></label></>}</>}
    <label>변경 사유<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label></fieldset>
    {err&&<p role="alert">{err}</p>}<button disabled={busy}>{uncertain?"기존 요청 결과 확인":action==="delete"?"이 기록 삭제 확인":action==="restore"?"이 기록 복원":"저장"}</button>
    <button type="button" disabled={busy} onClick={close}>닫기</button></form>;
}
function Entry({item,port,date,refresh}:{item:RecordHeader;port:LearningPort;date:string;refresh:()=>void}){
  const [record,setRecord]=useState<LearningRecord|null>(null),[err,setErr]=useState(""),[action,setAction]=useState<FormAction|null>(null);
  async function load(){try{setErr("");setRecord(await port.detail(item.sessionId));}catch(e){setErr(String(e));}}
  return <details className="study-history-part" onToggle={e=>{if(e.currentTarget.open&&!record)void load();}}>
    <summary>{item.title} · 이날 {duration(item.sliceSeconds)}{item.deleted?" · 삭제됨":""}</summary>
    {err&&<p role="alert">{err} <button onClick={()=>void load()}>다시 읽기</button></p>}
    {record?<><p>{kst(record.effectiveStart)} – {record.effectiveEnd&&kst(record.effectiveEnd)} · 전체 유효 {duration(record.effectiveSeconds)}</p>
      <p>{record.source==="MANUAL"?"수동 입력":record.provenance==="USER_EDITED"?"사용자 수정":"대화 요약"} · {record.summary.summaryCoverage==="PARTIAL_CONTEXT"?"일부 맥락":"확인 가능한 맥락"}</p>
      {record.source!=="MANUAL"&&record.original&&<p>원본 감지 {duration(record.original.measuredSeconds??0)} · 유휴 {duration(record.original.idleSeconds??0)} · 자리 비움 {duration(record.original.awaySeconds??0)} · 수동 정지 {duration(record.original.manualPausedSeconds??0)} · 미관측 {duration(record.original.unobservedSeconds??0)}</p>}
      <p>{record.summary.summary}</p>{groups.map(([key,label])=>record.summary[key]?.length>0&&<div key={key}><b>{label}</b><ul>{record.summary[key].map((v,i)=><li key={i}>{v}</li>)}</ul></div>)}
      {record.summary.nextStudyPoint&&<p>다음 학습 · {record.summary.nextStudyPoint}</p>}
      {action?<Editor {...{action,port,record,date}} close={()=>setAction(null)} done={()=>{setAction(null);refresh();}}/>:
      item.deleted?<button onClick={()=>setAction("restore")}>복원</button>:<><button onClick={()=>setAction("update")}>수정</button><button onClick={()=>setAction("delete")}>삭제</button></>}</>:!err&&<p>내용을 불러오는 중…</p>}</details>;
}
export function LearningDay({history,date}:{history:History;date:string}){
  const {port,refresh,generation}=history;
  const [deleted,setDeleted]=useState(false),[manual,setManual]=useState(false),[cursor,setCursor]=useState(""),[next,setNext]=useState("");
  const [rows,setRows]=useState<RecordHeader[]|null>(null),[err,setErr]=useState("");
  useEffect(()=>{if(!port)return;let active=true;setErr("");setRows(null);setNext("");
    port.page(date,addDays(date,1),deleted,cursor).then(page=>{if(active){setRows(page.items);setNext(page.nextCursor??"");}}).catch(e=>{if(active)setErr(String(e));});
    return ()=>{active=false;};},[port,date,deleted,cursor,generation]);
  if(!port)return null;
  return <section><h3>대화 학습 기록</h3><label><input type="checkbox" checked={deleted} onChange={e=>{setCursor("");setDeleted(e.target.checked);}}/> 삭제된 기록 포함</label>
    {err?<p role="alert">{err} <button onClick={refresh}>다시 읽기</button></p>:rows===null?<p>불러오는 중…</p>:!rows.length?<p>이날의 대화 학습 기록이 없습니다.</p>:rows.map(item=><Entry key={item.sessionId+"-"+item.revision} {...{item,port,date,refresh}}/>)}
    {cursor&&<button onClick={()=>setCursor("")}>처음으로</button>}{next&&<button onClick={()=>setCursor(next)}>다음 기록</button>}
    {manual?<Editor action="manual" {...{port,date}} close={()=>setManual(false)} done={()=>{setManual(false);setCursor("");refresh();}}/>:<button onClick={()=>setManual(true)}>지난 대화 기록 추가</button>}</section>;
}
