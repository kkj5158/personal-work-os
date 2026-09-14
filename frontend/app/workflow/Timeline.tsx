'use client';
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {ChevronLeft,ChevronRight,Undo2} from 'lucide-react';
import {useWorkflow} from './WorkflowContext';
import TaskDetails from './TaskDetails';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import type {Project,Phase,WorkTask} from '@/lib/api/workflow';
import {dayNumber,monthDates,changeRange,timelineRows,type TimelineRow,type TimelineMode,type Range} from '@/lib/workflow/timeline';

type Drag={row:TimelineRow;mode:TimelineMode;original:Range;preview:Range;x:number;dayWidth:number};
type Undo={row:TimelineRow;range:Range};
export default function Timeline(){
 const workflow=useWorkflow(),today=toDateKey(seoulToday());
 const [month,setMonth]=useState(today.slice(0,7)),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[selection,setSelection]=useState<string|null>(null),[filter,setFilter]=useState('');
 const [drag,setDrag]=useState<Drag|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState<Undo[]>([]);
 const active=useRef<Drag|null>(null),pending=useRef(false),undoRef=useRef<()=>void>(()=>{});
 const allRows=timelineRows(workflow.projects,workflow.phases,workflow.tasks,new Set());
 const rows=timelineRows(workflow.projects,workflow.phases,workflow.tasks,collapsed).filter(row=>!filter||row.title.toLowerCase().includes(filter.toLowerCase()));
 const selected=allRows.find(row=>row.id===selection),dates=monthDates(month),first=dates[0],last=dates.at(-1)!;
 const undated=workflow.tasks.filter(t=>!t.startDate||!t.dueDate);
 async function persist(row:TimelineRow,range:Range,remember=true){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{
   if(row.kind==='project')await workflow.updateProject(row.id,{startDate:range.start,endDate:range.end});
   else if(row.kind==='phase')await workflow.updatePhase(row.id,{startDate:range.start,endDate:range.end});
   else await workflow.updateTask(row.id,{startDate:range.start,dueDate:range.end});
   if(remember&&row.start&&row.end)setHistory(items=>[...items,{row,range:{start:row.start!,end:row.end!}}]);
  }catch(e){setError(e instanceof Error?e.message:'날짜를 저장하지 못했습니다.');throw e;}finally{pending.current=false;setBusy(false);}
 }
 async function undo(){if(busy||!history.length)return;const item=history.at(-1)!;try{await persist(item.row,item.range,false);setHistory(h=>h.slice(0,-1));}catch{/* Retain history for retry. */}}
 useEffect(()=>{undoRef.current=()=>{void undo();};});
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey&&!(event.target instanceof HTMLElement&&event.target.closest('input,textarea,[contenteditable=true]'))){event.preventDefault();undoRef.current();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 function start(event:PointerEvent<HTMLElement>,row:TimelineRow,mode:TimelineMode){
  if(busy||event.button!==0||!row.start||!row.end)return;event.preventDefault();event.stopPropagation();
  const bar=event.currentTarget.closest<HTMLElement>('.wf-timeline-bar')!,track=bar.parentElement!;
  const next:Drag={row,mode,original:{start:row.start,end:row.end},preview:{start:row.start,end:row.end},x:event.clientX,dayWidth:track.getBoundingClientRect().width/dates.length};
  bar.setPointerCapture(event.pointerId);active.current=next;setDrag(next);setSelection(row.id);
 }
 function move(event:PointerEvent){const value=active.current;if(!value)return;const next={...value,preview:changeRange(value.original,value.mode,(event.clientX-value.x)/value.dayWidth)};active.current=next;setDrag(next);}
 function drop(){const value=active.current;active.current=null;setDrag(null);if(value&&(value.preview.start!==value.original.start||value.preview.end!==value.original.end))void persist(value.row,value.preview).catch(()=>{});}
 function shiftMonth(delta:number){const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);setMonth(date.toISOString().slice(0,7));}
 function toggle(id:string){setCollapsed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 const todayIndex=dayNumber(today)-dayNumber(first);
 return <div className="wf-timeline"><section className="wf-timeline-main">
  <header className="wf-timeline-header"><h1>Timeline</h1><input className="wf-timeline-filter" aria-label="Timeline 검색" placeholder="프로젝트 / 작업 검색" value={filter} onChange={e=>setFilter(e.target.value)}/><button aria-label="이전 달" onClick={()=>shiftMonth(-1)}><ChevronLeft size={15}/></button><input aria-label="Timeline 월" type="month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/><button onClick={()=>setMonth(today.slice(0,7))}>오늘</button><button aria-label="다음 달" onClick={()=>shiftMonth(1)}><ChevronRight size={15}/></button><button title="Ctrl/Cmd + Z" aria-label="Timeline 실행 취소" disabled={busy||!history.length} onClick={()=>void undo()}><Undo2 size={15}/></button></header>
  <p>항목의 기간을 직접 계획하세요. 자식 항목의 날짜는 각자 유지됩니다.</p>
  <div className="wf-timeline-preview" role="status">{drag?`${drag.preview.start} → ${drag.preview.end}`:busy?'저장 중…':'Month View · 하루 단위 이동 · 양 끝을 드래그하여 기간 조정'}</div>
  {error&&<div role="alert" className="wf-error">{error}</div>}
  <div className="wf-timeline-grid" style={{'--days':dates.length} as CSSProperties}>
   <div className="wf-timeline-days"><div className="wf-timeline-label">프로젝트 / 단계 / 작업</div><div className="wf-timeline-track">{dates.map(date=><span key={date} className={`wf-timeline-day ${date===today?'is-today':''}`}>{Number(date.slice(8))}</span>)}</div></div>
   {rows.map(row=>{const range=drag?.row.id===row.id?drag.preview:{start:row.start,end:row.end};const visible=range.start&&range.end&&range.start<=last&&range.end>=first;const offset=range.start?Math.max(0,dayNumber(range.start)-dayNumber(first)):0;const right=range.end?Math.min(dates.length,dayNumber(range.end)-dayNumber(first)+1):0;
    return <div key={row.id} className="wf-timeline-row" data-entity-id={row.id}><div className="wf-timeline-label" style={{paddingLeft:10+row.depth*16}}>{row.hasChildren&&<button aria-label={`${row.title} ${collapsed.has(row.id)?'펼치기':'접기'}`} onClick={()=>toggle(row.id)}>{collapsed.has(row.id)?'▸':'▾'}</button>}<button onClick={()=>setSelection(row.id)} title={row.title}><span style={{color:row.color}}>●</span> {row.title}</button><small className="wf-status">{row.status}</small></div>
    <div className="wf-timeline-track">{todayIndex>=0&&todayIndex<dates.length&&<span className="wf-today-line" style={{left:`${(todayIndex+.5)/dates.length*100}%`}}/>}
     {visible&&<div role="button" tabIndex={0} aria-label={`${row.title} 기간 ${range.start} ${range.end}`} className="wf-timeline-bar" style={{left:`${offset/dates.length*100}%`,width:`${(right-offset)/dates.length*100}%`,background:row.kind==='project'?row.color:`${row.color}${row.kind==='phase'?'80':'50'}`,opacity:row.status==='DONE'?.5:1}} onClick={()=>setSelection(row.id)} onKeyDown={e=>{if(e.key==='Enter')setSelection(row.id);}} onPointerDown={e=>start(e,row,'move')} onPointerMove={move} onPointerUp={drop} onPointerCancel={()=>{active.current=null;setDrag(null);}}>
       <span className="wf-bar-handle" role="button" aria-label={`${row.title} 시작일 조정`} onPointerDown={e=>start(e,row,'start')}>⋮</span><span className="wf-bar-body">{row.title} · {range.start?.slice(5)} – {range.end?.slice(5)}</span><span className="wf-bar-handle" role="button" aria-label={`${row.title} 종료일 조정`} onPointerDown={e=>start(e,row,'end')}>⋮</span>
     </div>}
    </div></div>;
   })}
   {!rows.length&&<p className="wf-loading">Projects에서 프로젝트와 작업을 추가하세요.</p>}
  </div>
  <section className="wf-undated"><h2>Undated {undated.length}</h2><p>시작일과 마감일을 지정하면 타임라인에 바로 표시됩니다.</p><div className="wf-undated-list">{undated.map(task=><button key={task.id} onClick={()=>setSelection(task.id)}>{task.title}</button>)}</div></section>
 </section>
 {selected?.kind==='task'?<aside className="wf-timeline-rail"><TaskDetails task={selected.entity as WorkTask} onClose={()=>setSelection(null)}/></aside>:<aside className="wf-timeline-rail">{selected?<TimelineRangeDetails key={`${selected.id}-${selected.start}-${selected.end}`} row={selected} save={range=>persist(selected,range)} close={()=>setSelection(null)} busy={busy}/>:<><h2>Timeline 도움말</h2><p>막대 가운데: 기간 이동</p><p>왼쪽 / 오른쪽 끝: 시작 / 종료 조정</p><p>Ctrl/Cmd + Z: 마지막 날짜 변경 취소</p><p>기간이 겹치거나 부모 범위를 벗어나도 저장할 수 있습니다.</p></>}</aside>}
 </div>;
}
function TimelineRangeDetails({row,save,close,busy}:{row:TimelineRow;save:(range:Range)=>Promise<void>;close:()=>void;busy:boolean}){
 const entity=row.entity as Project|Phase;const [start,setStart]=useState(row.start??''),[end,setEnd]=useState(row.end??'');
 return <><button onClick={close} aria-label="기간 상세 닫기">×</button><h2>{entity.title}</h2><p>{row.kind==='project'?'Project':'Phase'} · {entity.status}</p><label>시작일<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>종료일<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><button disabled={busy||!start||!end||start>end} onClick={()=>void save({start,end}).catch(()=>{})}>기간 적용</button><p>{entity.memo}</p></>;
}
