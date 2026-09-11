"use client";
import { useEffect, useRef } from "react";
import { CalendarDays, PanelRightClose, Trash2 } from "lucide-react";
import { STATE_GROUPS } from "@/lib/api/types";
import type { CalendarCategory } from "./appearance";
import { timeMinutes, type CalendarEditorValue } from "./editorModel";

export function CalendarEditor({ value, date, categories, status, error, guard, busy, onChange, onSave, onFlush, onDelete, onClose, onDiscard, onContinue }: {
  value:CalendarEditorValue|null;date:string;categories:CalendarCategory[];status:string;error:string|null;guard:boolean;busy:boolean;
  onChange:(patch:Partial<CalendarEditorValue>)=>void;onSave:()=>void;onFlush:()=>void;onDelete:()=>void;onClose:()=>void;onDiscard:()=>void;onContinue:()=>void;
}) {
  const title = useRef<HTMLInputElement>(null);
  // Selection key stays stable through the first-title commit; do not refocus on every keystroke.
  useEffect(() => { title.current?.focus(); }, [value?.key]);
  return <aside className="calendar-editor" aria-label="일정 편집기">
    <header><span>{value ? ({plan:"계획",actual:"실행 기록",state:"State · LIFE OS"}[value.kind]) : "일정 상세"}</span><button aria-label="편집기 접기" onClick={onClose}><PanelRightClose size={17}/></button></header>
    {guard && <div className="cal-unsaved-guard" role="alert"><p>저장되지 않은 {value?.kind === "state" ? "상태" : "실행"} 기록이 있습니다.</p><button onClick={onDiscard}>변경사항 버리기</button><button onClick={onContinue}>계속 편집</button></div>}
    {!value ? <div className="cal-editor-empty"><CalendarDays size={27}/><h2>{date}</h2><p>빈 시간을 클릭하거나 드래그해 일정을 만드세요.</p><p>기존 블록을 클릭하면 여기에서 편집할 수 있습니다.</p></div> : <div className="cal-editor-fields" onBlur={value.kind === "plan" ? onFlush : undefined} onKeyDown={e => { if(e.key === "Enter" && e.target instanceof HTMLInputElement && value.kind === "plan") { e.preventDefault(); onFlush(); } }}>
      <label className="cal-title-label">제목<input ref={title} aria-label="제목" placeholder="제목을 입력하세요…" value={value.title} onChange={e => onChange({title:e.target.value})}/></label>
      <label>날짜<input type="date" value={value.date} onChange={e => onChange({date:e.target.value})}/></label>
      {value.kind === "actual" && <label className="cal-inline-label"><input type="checkbox" checked={value.unscheduled} onChange={e => onChange({unscheduled:e.target.checked})}/>시간 미지정</label>}
      {!value.unscheduled && <div className="cal-time-fields"><label>시작<input type="time" step="900" value={value.start} onChange={e => onChange({start:e.target.value})}/></label><label>종료<input type={value.end === "24:00" ? "text" : "time"} step="900" value={value.end} onChange={e => onChange({end:e.target.value})}/></label></div>}
      {value.unscheduled ? <label>소요 시간 (분)<input type="number" min="1" value={value.duration} onChange={e => onChange({duration:Number(e.target.value)})}/></label> : <p className="cal-duration">{Math.max(0,timeMinutes(value.end)-timeMinutes(value.start))}분</p>}
      {value.kind !== "state" ? <>
        <label>Domain<select value={value.domainType} disabled={value.kind === "actual" && !!value.id} onChange={e => onChange({domainType:e.target.value as "WORK"|"LIFE",categoryId:null,sourceType:e.target.value === "LIFE" ? "LIFE_TIME_ENTRY" : "WORK_TIME_ENTRY"})}><option value="WORK">WORK OS</option><option value="LIFE">LIFE OS</option></select></label>
        {value.kind === "actual" && value.domainType === "WORK" && <label>기록 종류<select value={value.sourceType ?? "WORK_TIME_ENTRY"} disabled={!!value.id} onChange={e => onChange({sourceType:e.target.value as CalendarEditorValue["sourceType"]})}><option value="WORK_TIME_ENTRY">정규 업무</option><option value="SUPPLEMENTAL_WORK_ENTRY">추가 업무</option></select></label>}<label>Category<select value={value.categoryId ?? ""} onChange={e => onChange({categoryId:e.target.value || null})}><option value="">카테고리 없음</option>{categories.filter(c => c.domain === value.domainType && (c.isActive || c.id === value.categoryId) && (value.kind !== "actual" || value.domainType === "LIFE" || !!c.parentId || c.id === value.categoryId)).map(c => <option key={c.id} value={c.id}>{c.parentId ? `${categories.find(p => p.id === c.parentId)?.name} / ` : ""}{c.name}</option>)}</select></label>
      </> : <label>상태<select value={value.stateGroup} onChange={e => onChange({stateGroup:e.target.value as CalendarEditorValue["stateGroup"]})}>{STATE_GROUPS.map(group => <option key={group}>{group}</option>)}</select></label>}
      <label>메모<textarea rows={6} value={value.memo} onChange={e => onChange({memo:e.target.value})} placeholder="메모를 남겨보세요"/></label>
      {error && <p className="cal-error" role="alert">{error}</p>}
      <footer>{value.id && <button className="cal-delete" disabled={busy} onClick={onDelete}><Trash2 size={14}/>삭제</button>}<span role="status">{status}</span>{value.kind !== "plan" && <><button disabled={busy} onClick={onClose}>취소</button><button className="cal-primary" disabled={busy} onClick={onSave}>저장</button></>}</footer>
    </div>}
  </aside>;
}
