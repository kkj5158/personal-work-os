"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CategoryColorPicker } from "../CategoryColorPicker";
import { type TimetableBlock, type BlockInput } from "@/lib/api/timetables";
import { blockColor, DAYS, duration, timeLabel, timeMinute } from "./model";
export type BlockDraft={timetableId:string;block:BlockInput;original?:TimetableBlock;members?:TimetableBlock[];key:string};
export function BlockDialog({draft,defaultColor,recent,onRecent,onSave,onDelete,onDuplicate,onClose}:{draft:BlockDraft;defaultColor:string|null;recent:string[];onRecent:(color:string)=>void;onSave:(block:BlockInput,days:number[],key:string)=>Promise<void>;onDelete:()=>Promise<void>;onDuplicate:()=>void;onClose:()=>void}) {
  const [value,setValue]=useState(draft.block),[days,setDays]=useState(draft.members?.map(b=>b.weekday)??[draft.block.weekday]);
  const [start,setStart]=useState(timeLabel(value.startMinute)),[end,setEnd]=useState(timeLabel((value.startMinute+value.durationMinutes)%1440));
  const [next,setNext]=useState(value.startMinute+value.durationMinutes>=1440),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const root=useRef<HTMLDialogElement>(null);
  const saving=useRef(false),attempt=useRef({body:"",key:draft.key});
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;root.current?.showModal();return()=>{previous?.focus();};},[]);
  const save=async()=>{if(saving.current)return;const a=timeMinute(start),b=timeMinute(end),length=duration(a,b,next);if(!Number.isFinite(a)||!length||!value.title.trim()||!days.length){setError("제목·요일·시각을 확인하세요. 길이는 1분~24시간입니다.");return;}
    const block={...value,startMinute:a,durationMinutes:length,weekday:days[0]},body=JSON.stringify({block,days});
    if(attempt.current.body&&attempt.current.body!==body)attempt.current.key=crypto.randomUUID();attempt.current.body=body;
    saving.current=true;setBusy(true);setError("");try{await onSave(block,days,attempt.current.key);if(value.color)onRecent(value.color);}catch(e){setError(e instanceof Error?e.message:"저장 실패");}finally{saving.current=false;setBusy(false);}};
  return createPortal(<dialog ref={root} className="tt-dialog" aria-labelledby="tt-block-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><form onSubmit={e=>{e.preventDefault();void save();}}>
    <header><h2 id="tt-block-title">{draft.original?"블록 편집":"블록 추가"}</h2><button type="button" aria-label="블록 편집 닫기" disabled={busy} onClick={onClose}>×</button></header>
    {draft.members&&<p className="tt-muted">함께 만든 블록 {draft.members.length}개 수정</p>}
    <label>제목<input autoFocus required maxLength={200} value={value.title} onChange={e=>setValue({...value,title:e.target.value})}/></label>
    <fieldset disabled={busy}><legend>요일</legend><div className="tt-days">{DAYS.map((name,i)=><label key={name}><input type={draft.original&&!draft.members?"radio":"checkbox"} name="weekday" checked={days.includes(i+1)} onChange={()=>setDays(draft.original&&!draft.members?[i+1]:days.includes(i+1)?days.filter(d=>d!==i+1):[...days,i+1].sort())}/>{name}</label>)}</div></fieldset>
    <div className="tt-time-inputs"><label>시작<input type="time" required step={60} value={start} onChange={e=>setStart(e.target.value)}/></label><label>종료<input type="time" required step={60} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <label className="tt-inline"><input type="checkbox" checked={next} onChange={e=>setNext(e.target.checked)}/>다음 날 종료</label>
    <label className="tt-inline">색상<CategoryColorPicker name="시간표 블록" selected={blockColor(value.color,defaultColor)} inherited={!value.color} recent={recent} defaultLabel="시간표 기본색 사용" onColor={color=>setValue({...value,color})}/><span>{value.color??"기본색"}</span></label>
    <label>메모<textarea rows={3} maxLength={20000} value={value.memo} onChange={e=>setValue({...value,memo:e.target.value})}/></label>
    {error&&<p role="alert" className="tt-error">{error}</p>}
    <footer>{draft.original&&<><button type="button" disabled={busy} onClick={()=>{if(saving.current)return;saving.current=true;setBusy(true);void onDelete().catch(e=>setError(e.message)).finally(()=>{saving.current=false;setBusy(false);});}}>{draft.members?"이 블록 삭제":"삭제"}</button><button type="button" disabled={busy} onClick={onDuplicate}>복제</button></>}<span/><button type="button" disabled={busy} onClick={onClose}>취소</button><button className="tt-primary" disabled={busy} type="submit">{busy?"저장 중…":"저장"}</button></footer>
  </form></dialog>,document.body);
}
