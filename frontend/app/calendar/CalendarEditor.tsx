"use client";
import { useEffect, useRef } from "react";
import { CalendarDays, PanelRightClose, Trash2 } from "lucide-react";
import { STATE_GROUPS } from "@/lib/api/types";
import type { CalendarCategory } from "./appearance";
import { editorCategories, timeMinutes, type CalendarEditorValue } from "./editorModel";

import { STATE_LABELS } from "./statePolicy";

export function CalendarEditor({ value, date, categories, status, error, guard, busy, onChange, onSave, onFlush, onDelete, onClose, onDiscard, onContinue }: {
  value:CalendarEditorValue|null;date:string;categories:CalendarCategory[];status:string;error:string|null;guard:boolean;busy:boolean;
  onChange:(patch:Partial<CalendarEditorValue>)=>void;onSave:()=>void;onFlush:()=>void;onDelete:()=>void;onClose:()=>void;onDiscard:()=>void;onContinue:()=>void;
}) {
  const title = useRef<HTMLInputElement>(null);
  const category = value ? editorCategories(categories, value.domainType, value.categoryId) : null;
  const duration = value ? timeMinutes(value.end)-timeMinutes(value.start) : NaN;
  // Selection key stays stable through the first-title commit; do not refocus on every keystroke.
  useEffect(() => { title.current?.focus(); }, [value?.key]);
  return <aside className="calendar-editor" aria-label="일정 편집기">
    <header><span>{value ? ({plan:"계획",actual:"실행 기록",state:"State · LIFE CODE"}[value.kind]) : "일정 상세"}</span><button aria-label="편집기 접기" onClick={onClose}><PanelRightClose size={17}/></button></header>
    {guard && <div className="cal-unsaved-guard" role="alert"><p>저장되지 않은 {value?.kind === "state" ? "상태" : value?.kind === "plan" ? "계획" : "실행"} 기록이 있습니다.</p><button onClick={onDiscard}>변경사항 버리기</button><button onClick={onContinue}>계속 편집</button></div>}
    {!value ? <div className="cal-editor-empty"><CalendarDays size={27}/><h2>{date}</h2><p>빈 시간을 클릭하거나 드래그해 일정을 만드세요.</p><p>기존 블록을 클릭하면 여기에서 편집할 수 있습니다.</p></div> : <div className="cal-editor-fields" onBlur={value.kind !== "state" ? onFlush : undefined} onKeyDown={e => { if(e.key === "Enter" && e.target instanceof HTMLInputElement && value.kind !== "state") { e.preventDefault(); onFlush(); } }}>
      {value.kind !== "state" && <label className="cal-title-label">제목<input ref={title} aria-label="제목" placeholder="제목을 입력하세요…" value={value.title} onChange={e => onChange({title:e.target.value})}/></label>}
      <label>날짜<input type="date" value={value.date} onChange={e => onChange({date:e.target.value})}/></label>
      {value.kind === "actual" && <label className="cal-inline-label"><input type="checkbox" checked={value.unscheduled} onChange={e => onChange({unscheduled:e.target.checked})}/>시간 미지정</label>}
      {!value.unscheduled && <div className="cal-time-fields"><label>시작<input type="time" step="300" value={value.start} onChange={e => onChange({start:e.target.value})}/></label><label>종료<input type={value.end === "24:00" ? "text" : "time"} step="300" value={value.end} onChange={e => onChange({end:e.target.value})}/></label></div>}
      {value.unscheduled ? <label>소요 시간 (분)<input type="number" min="1" value={value.duration} onChange={e => onChange({duration:Number(e.target.value)})}/></label> : <p className="cal-duration">{Number.isFinite(duration) ? `${Math.max(0,duration)}분` : "시간을 입력하세요"}</p>}
      {value.kind !== "state" ? <>
        <label>Domain<select value={value.domainType} disabled={value.kind === "actual" && (!!value.id || busy)} onChange={e => onChange({domainType:e.target.value as "WORK"|"LIFE",categoryId:null,sourceType:e.target.value === "LIFE" ? "LIFE_TIME_ENTRY" : "WORK_TIME_ENTRY"})}><option value="WORK">WORK OS</option><option value="LIFE">LIFE CODE</option></select></label>
        {value.kind === "actual" && value.domainType === "WORK" && <label>기록 종류<select value={value.sourceType ?? "WORK_TIME_ENTRY"} disabled={!!value.id || busy} onChange={e => onChange({sourceType:e.target.value as CalendarEditorValue["sourceType"]})}><option value="WORK_TIME_ENTRY">정규 업무</option><option value="SUPPLEMENTAL_WORK_ENTRY">추가 업무</option></select></label>}{category && <div className="cal-time-fields cal-category-fields">
          <label>대분류<select aria-label="대분류" value={category.rootId} onChange={e => onChange({categoryId:e.target.value || null})}>
            <option value="">카테고리 없음</option>
            {category.root && !category.root.isActive && <option disabled value={category.root.id}>{category.root.name} (비활성)</option>}
            {category.roots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>중분류<select aria-label="중분류" value={category.childId} disabled={!category.root?.isActive || category.children.length === 0} onChange={e => onChange({categoryId:e.target.value || category.rootId || null})}>
            <option value="">대분류로 기록</option>
            {category.selected?.parentId && !category.children.some(c => c.id === category.childId) && <option disabled value={category.childId}>{category.selected.name} (비활성)</option>}
            {category.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        </div>}
      </> : <><label>상태<select value={value.stateGroup} onChange={e => onChange({stateGroup:e.target.value as CalendarEditorValue["stateGroup"]})}>{STATE_GROUPS.map(group => <option key={group} value={group}>{STATE_LABELS[group]}</option>)}</select></label><label>한줄 설명<input aria-label="한줄 설명" maxLength={100} placeholder="선택 사항" value={value.title} onChange={e=>onChange({title:e.target.value})}/></label></>}
      <label>메모<textarea rows={6} value={value.memo} onChange={e => onChange({memo:e.target.value})} placeholder="메모를 남겨보세요"/></label>
      {error && <p className="cal-error" role="alert">{error}</p>}
      <footer>{value.id && <button className="cal-delete" disabled={busy} onClick={onDelete}><Trash2 size={14}/>삭제</button>}<span role="status">{status}</span>{value.kind === "state" && <><button disabled={busy} onClick={onClose}>취소</button><button className="cal-primary" disabled={busy} onClick={onSave}>저장</button></>}{value.kind !== "state" && status === "저장 실패" && <button disabled={busy} onClick={onSave}>다시 저장</button>}</footer>
    </div>}
  </aside>;
}
