'use client';
import {useEffect,useRef,useState,type CSSProperties,type DragEvent,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {Check,ChevronLeft,ChevronRight,Flag,Undo2,X} from 'lucide-react';
import {useGlobalTabs} from '@/components/GlobalTabs';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import type {Phase,Project,WorkTask} from '@/lib/api/workflow';
import {PROJECT_STATUS_LABELS,TASK_STATUS_LABELS} from '@/lib/workflow/labels';
import {mondayOf} from '@/lib/workflow/store';
import {
 NEUTRAL_COLOR,TIMELINE_LAYER_LABELS,TIMELINE_VIEW_LABELS,UNASSIGNED,addDays,changeRange,isPeriod,monthMarkers,monthWeeks,periodAnchor,periodColumns,periodLabel,periodOf,periodWindow,
 placeRange,planMoveUndo,projectColor,rangeRows,shiftPeriod,showsLayer,undatedTasks,weekProjectSpans,
 type PlanUndo,type Range,type RangeRow,type TimelineLayer,type TimelineMode,type TimelineView,
} from '@/lib/workflow/timeline';
import {useWorkflow} from './WorkflowContext';
import {useTaskSelection} from './useTaskSelection';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';

const today=()=>toDateKey(seoulToday());
const VIEWS:TimelineView[]=['year','quarter','month'];
const LAYERS=Object.keys(TIMELINE_LAYER_LABELS) as TimelineLayer[];
const PLAN_TYPE='application/workflow-plan';
const WEEKDAYS=['월','화','수','목','금','토','일'];
const MARKER_LIMIT=4;
const PHASE_STATUS_LABEL:Record<Phase['status'],string>={TODO:'할 일',DOING:'진행 중',DONE:'완료'};

type Params={view:TimelineView;period:string;layers:TimelineLayer[];projects:string[]};
/** View, period and display filters live in the URL next to ?task=, so S10, reloads and Global Tabs keep the same Timeline. */
function useTimelineParams():[Params,(patch:Partial<Params>)=>void]{
 const [params,setParams]=useState<Params>(()=>{
  const search=typeof window==='undefined'?new URLSearchParams():new URLSearchParams(window.location.search);
  const rawView=search.get('view'),view:TimelineView=VIEWS.includes(rawView as TimelineView)?rawView as TimelineView:'month';
  const rawPeriod=search.get('period'),list=(key:string)=>(search.get(key)??'').split(',').filter(Boolean);
  return {view,period:isPeriod(view,rawPeriod)?rawPeriod:periodOf(view,today()),layers:list('show').filter((value):value is TimelineLayer=>LAYERS.includes(value as TimelineLayer)),projects:list('project')};
 });
 function update(patch:Partial<Params>){
  setParams(current=>{
   const next={...current,...patch},url=new URL(window.location.href);
   const write=(key:string,value:string|null)=>{if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);};
   write('view',next.view==='month'?null:next.view);write('period',next.period===periodOf(next.view,today())?null:next.period);
   write('show',next.layers.join(',')||null);write('project',next.projects.join(',')||null);
   window.history.replaceState(window.history.state,'',url);
   return next;
  });
 }
 return [params,update];
}

type RangeUndo={kind:'range';entity:'project'|'phase';id:string;title:string;previous:Range};
type PlanHistory={kind:'plan';title:string;undo:PlanUndo};
type History=RangeUndo|PlanHistory;
type Drag={row:RangeRow;mode:TimelineMode;original:Range;preview:Range;x:number;dayWidth:number};

/**
 * S09 Timeline — a projection/editor over the canonical Project / Phase / Task data, not a planning database.
 * Year edits Project ranges, Quarter edits Project and Phase ranges, Month moves single Task plan days.
 * Each mark writes only the entity it represents; parent moves never cascade into Phases, Tasks, deadlines or
 * Workpad. Week is the Batch 3 weekday board and Today is Workpad — both are linked, not rebuilt.
 */
export default function Timeline(){
 const flow=useWorkflow(),tabs=useGlobalTabs(),day=today();
 const [params,setParams]=useTimelineParams();
 const [selectedTask,selectTask]=useTaskSelection();
 const [rangeSelection,setRangeSelection]=useState<{kind:'project'|'phase';id:string}|null>(null);
 const [history,setHistory]=useState<History[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const pending=useRef(false),undoRef=useRef<()=>void>(()=>{});
 const {view,period,layers,projects:projectFilter}=params;

 async function guarded(action:()=>Promise<void>){
  if(pending.current)return false;pending.current=true;setBusy(true);setError('');
  try{await action();return true;}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');return false;}finally{pending.current=false;setBusy(false);}
 }
 /** Writes only this Project's or Phase's own planned range. */
 async function saveRange(row:{kind:'project'|'phase';id:string;title:string;start:string|null;end:string|null},range:Range,remember=true){
  const done=await guarded(async()=>{
   if(row.kind==='project')await flow.updateProject(row.id,{startDate:range.start,endDate:range.end});
   else await flow.updatePhase(row.id,{startDate:range.start,endDate:range.end});
  });
  if(done&&remember&&row.start&&row.end)setHistory(items=>[...items,{kind:'range',entity:row.kind,id:row.id,title:row.title,previous:{start:row.start!,end:row.end!}}]);
  if(done)setNotice(`${row.kind==='project'?'프로젝트':'작업 묶음'} ‘${row.title}’ 기간: ${range.start} – ${range.end} (하위 항목 날짜는 그대로입니다)`);
  return done;
 }
 /** Moves one plan-day placement; deadline, Workpad records, weekly selection and other plan days stay as they are. */
 async function movePlan(task:WorkTask,from:string,to:string){
  if(from===to)return;
  let merged=false;
  const done=await guarded(async()=>{merged=(await flow.movePlanDay(task.id,from,to)).merged;});
  if(!done)return;
  setHistory(items=>[...items,{kind:'plan',title:task.title,undo:planMoveUndo(task.id,from,to,merged)}]);
  setNotice(`‘${task.title}’ 계획: ${from.slice(5)} → ${to.slice(5)}${merged?' · 같은 날 계획과 합쳤습니다':''}`);
 }
 async function undo(){
  if(busy||!history.length)return;
  const item=history.at(-1)!;
  const done=item.kind==='range'
   ?await guarded(async()=>{if(item.entity==='project')await flow.updateProject(item.id,{startDate:item.previous.start,endDate:item.previous.end});else await flow.updatePhase(item.id,{startDate:item.previous.start,endDate:item.previous.end});})
   :await guarded(async()=>{const undo=item.undo;if(undo.kind==='move')await flow.movePlanDay(undo.taskId,undo.from,undo.to);else await flow.addPlanDay(undo.taskId,undo.date);});
  // A failed undo keeps its history entry for a retry.
  if(done){setHistory(items=>items.slice(0,-1));setNotice(`실행 취소: ${item.title}`);}
 }
 useEffect(()=>{undoRef.current=()=>{void undo();};});
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!event.shiftKey&&!(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]'))){event.preventDefault();undoRef.current();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);

 const toggleIn=<T extends string>(list:T[],value:T)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
 const anchor=periodAnchor(period);
 // Switching resolution keeps the same moment: today when it lies in the shown period, otherwise the period start.
 const focusDate=periodOf(view,day)===period?day:anchor;
 const setView=(next:TimelineView)=>setParams({view:next,period:periodOf(next,focusDate)});
 const weekHref=`/workflow/week?view=board&week=${mondayOf(focusDate)}`;
 const go=(href:string)=>(event:{preventDefault:()=>void})=>{if(tabs){event.preventDefault();tabs.navigate(href);}};
 const projects=flow.projects.filter(project=>!project.archivedAt).sort((a,b)=>a.order-b.order);
 const selectRange=(kind:'project'|'phase',id:string)=>{selectTask(null);setRangeSelection({kind,id});};
 const openTask=(id:string)=>{setRangeSelection(null);selectTask(id);};
 const rangeEntity=rangeSelection?(rangeSelection.kind==='project'?flow.projects.find(item=>item.id===rangeSelection.id):flow.phases.find(item=>item.id===rangeSelection.id)):undefined;
 const detail=selectedTask?<TaskDetailPanel key={selectedTask} taskId={selectedTask} onClose={()=>selectTask(null)} onSelect={selectTask}/>
  :rangeSelection&&rangeEntity?<RangeDetails key={`${rangeEntity.id}-${rangeEntity.startDate}-${rangeEntity.endDate}`} kind={rangeSelection.kind} entity={rangeEntity} busy={busy} close={()=>setRangeSelection(null)}
   save={range=>saveRange({kind:rangeSelection.kind,id:rangeEntity.id,title:rangeEntity.title,start:rangeEntity.startDate,end:rangeEntity.endDate},range)}/>:null;

 return <SplitView detail={detail} label={selectedTask?'작업 상세':'기간 상세'}><div className="wf-tl">
  <header className="wf-tl-header">
   <div><h1>Timeline</h1><p className="wf-muted">같은 프로젝트·작업을 해상도만 바꿔 봅니다. 상위 항목을 옮겨도 하위 날짜는 바뀌지 않습니다.</p></div>
   <nav className="wf-tl-views" aria-label="Timeline 보기">
    {VIEWS.map(value=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)}>{TIMELINE_VIEW_LABELS[value]}</button>)}
    <a className="wf-tl-link" href={weekHref} onClick={go(weekHref)} title="이번 주 요일 보드(S05)에서 계획합니다">주간 ↗</a>
    <a className="wf-tl-link" href="/workflow/today" onClick={go('/workflow/today')} title="Workpad에서 오늘 실행합니다">오늘 ↗</a>
   </nav>
   <div className="wf-tl-period">
    <button type="button" aria-label="이전 기간" onClick={()=>setParams({period:shiftPeriod(view,period,-1)})}><ChevronLeft size={15}/></button>
    <strong aria-live="polite">{periodLabel(view,period)}</strong>
    <button type="button" aria-label="다음 기간" onClick={()=>setParams({period:shiftPeriod(view,period,1)})}><ChevronRight size={15}/></button>
    <button type="button" onClick={()=>setParams({period:periodOf(view,day)})}>오늘</button>
    <button type="button" title="Ctrl/Cmd + Z" aria-label="Timeline 실행 취소" disabled={busy||!history.length} onClick={()=>void undo()}><Undo2 size={15}/></button>
   </div>
  </header>
  <section className="wf-explorer-filters" aria-label="Timeline 필터">
   <div className="wf-filter-row" role="group" aria-label="프로젝트 필터"><span className="wf-filter-label">프로젝트</span><div className="wf-filter-buttons">
    <button type="button" aria-pressed={!projectFilter.length} onClick={()=>setParams({projects:[]})}>전체</button>
    {projects.map(project=><button key={project.id} type="button" aria-pressed={projectFilter.includes(project.id)} onClick={()=>setParams({projects:toggleIn(projectFilter,project.id)})}><span className="wf-filter-dot" style={{background:projectColor(project.color)}} aria-hidden/>{project.title}</button>)}
    {view==='month'&&<button type="button" aria-pressed={projectFilter.includes(UNASSIGNED)} onClick={()=>setParams({projects:toggleIn(projectFilter,UNASSIGNED)})}><span className="wf-filter-dot" style={{background:NEUTRAL_COLOR}} aria-hidden/>프로젝트 없음</button>}
   </div></div>
   {view==='month'&&<div className="wf-filter-row" role="group" aria-label="표시 항목 필터"><span className="wf-filter-label">표시 항목</span><div className="wf-filter-buttons">
    <button type="button" aria-pressed={!layers.length} onClick={()=>setParams({layers:[]})}>전체</button>
    {LAYERS.map(layer=><button key={layer} type="button" aria-pressed={layers.includes(layer)} onClick={()=>setParams({layers:toggleIn(layers,layer)})}>{TIMELINE_LAYER_LABELS[layer]}</button>)}
   </div></div>}
  </section>
  <Legend view={view}/>
  <div className="wf-tl-status" role="status">{busy?'저장 중…':notice}</div>
  {error&&<div role="alert" className="wf-error">{error}</div>}
  {view==='month'
   ?<MonthView month={period} today={day} layers={layers} projectFilter={projectFilter} busy={busy} selectedTask={selectedTask} onOpenTask={openTask} onSelectProject={id=>selectRange('project',id)} onMove={movePlan}/>
   :<RangeView view={view} period={period} today={day} projectFilter={projectFilter} busy={busy} collapsed={collapsed} selected={rangeSelection?.id??null}
     onToggle={id=>setCollapsed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;})}
     onSelect={selectRange} onSave={(row,range)=>saveRange(row,range)}/>}
 </div></SplitView>;
}

/** The visual vocabulary does not rely on colour alone: shape, label and icon differ per kind. */
function Legend({view}:{view:TimelineView}){
 return <p className="wf-tl-legend" aria-label="표시 규칙">
  <span><i className="wf-tl-key is-project"/>프로젝트 기간</span>
  {view==='quarter'&&<span><i className="wf-tl-key is-phase"/>작업 묶음 기간</span>}
  {view==='month'&&<><span><i className="wf-tl-key is-plan"/>계획한 날 (드래그·Alt+화살표로 이동)</span><span><Flag size={11} aria-hidden/> 실제 마감 (이동 불가)</span></>}
  <span><Check size={11} aria-hidden/> 완료</span><span><i className="wf-tl-key is-today"/>오늘</span>
 </p>;
}

function RangeView({view,period,today,projectFilter,busy,collapsed,selected,onToggle,onSelect,onSave}:{view:'year'|'quarter';period:string;today:string;projectFilter:string[];busy:boolean;collapsed:ReadonlySet<string>;selected:string|null;
 onToggle:(id:string)=>void;onSelect:(kind:'project'|'phase',id:string)=>void;onSave:(row:RangeRow,range:Range)=>Promise<boolean>}){
 const flow=useWorkflow();
 const frame=periodWindow(view,period),columns=periodColumns(view,period),total=columns.reduce((sum,column)=>sum+column.days,0);
 const rows=rangeRows(flow.projects,flow.phases,{includePhases:view==='quarter',projectFilter,collapsed});
 const [drag,setDrag]=useState<Drag|null>(null);const active=useRef<Drag|null>(null);
 const todayPlace=placeRange({start:today,end:today},frame);
 function start(event:PointerEvent<HTMLElement>,row:RangeRow,mode:TimelineMode){
  if(busy||event.button!==0||!row.start||!row.end)return;event.preventDefault();event.stopPropagation();
  const bar=event.currentTarget.closest<HTMLElement>('.wf-tl-bar')!,track=bar.parentElement!;
  const next:Drag={row,mode,original:{start:row.start,end:row.end},preview:{start:row.start,end:row.end},x:event.clientX,dayWidth:track.getBoundingClientRect().width/total};
  // Capture is a convenience; an unavailable pointer id must not abort the drag.
  try{bar.setPointerCapture?.(event.pointerId);}catch{/* keep dragging without capture */}
  active.current=next;setDrag(next);
 }
 function move(event:PointerEvent){const value=active.current;if(!value)return;const next={...value,preview:changeRange(value.original,value.mode,(event.clientX-value.x)/value.dayWidth)};active.current=next;setDrag(next);}
 function drop(){const value=active.current;active.current=null;setDrag(null);if(!value)return;if(value.preview.start!==value.original.start||value.preview.end!==value.original.end)void onSave(value.row,value.preview);else onSelect(value.row.kind,value.row.id);}
 /** Keyboard alternative: Alt+←/→ moves the range by a day (a week in Year); with Shift it resizes the end. */
 function key(event:ReactKeyboardEvent,row:RangeRow){
  if(event.key==='Enter'){onSelect(row.kind,row.id);return;}
  if(!event.altKey||!row.start||!row.end||(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'))return;
  event.preventDefault();const step=(event.key==='ArrowLeft'?-1:1)*(view==='year'?7:1);
  void onSave(row,changeRange({start:row.start,end:row.end},event.shiftKey?'end':'move',step));
 }
 return <div className="wf-tl-range" style={{'--tl-days':total} as CSSProperties}>
  {drag&&<div className="wf-tl-preview" role="status">{drag.row.title}: {drag.preview.start} → {drag.preview.end}</div>}
  <div className="wf-tl-range-head"><div className="wf-tl-label">{view==='year'?'프로젝트':'프로젝트 / 작업 묶음'}</div>
   <div className="wf-tl-track is-head">{columns.map(column=><span key={column.key} style={{flex:column.days}} className={today>=column.start&&today<=addDays(column.start,column.days-1)?'is-current':''}>{column.label}</span>)}</div></div>
  {rows.map(row=>{
   const range=drag?.row.id===row.id?drag.preview:{start:row.start,end:row.end};const placed=placeRange(range,frame);
   const status=row.kind==='project'?PROJECT_STATUS_LABELS[row.status as Project['status']]??row.status:PHASE_STATUS_LABEL[row.status as Phase['status']]??row.status;
   return <div key={row.id} className={`wf-tl-range-row is-${row.kind} ${selected===row.id?'is-selected':''}`} data-entity-id={row.id}>
    <div className="wf-tl-label" style={{paddingLeft:10+row.depth*18}}>
     {row.kind==='project'&&row.hasChildren&&<button type="button" className="wf-tl-toggle" aria-label={`${row.title} ${collapsed.has(row.id)?'펼치기':'접기'}`} onClick={()=>onToggle(row.id)}>{collapsed.has(row.id)?'▸':'▾'}</button>}
     <button type="button" className="wf-tl-name" onClick={()=>onSelect(row.kind,row.id)} title={row.title}><span className="wf-tl-kind" aria-hidden>{row.kind==='project'?'■':'▭'}</span><span>{row.title}</span></button>
     <small className="wf-tl-state">{row.done&&<Check size={10} aria-hidden/>}{status}</small>
    </div>
    <div className="wf-tl-track" style={{backgroundSize:`calc(100% / ${columns.length}) 100%`}}>
     {todayPlace&&<span className="wf-tl-today" style={{left:`${(todayPlace.offset+.5)/total*100}%`}} aria-hidden/>}
     {placed?<div role="button" tabIndex={0} aria-pressed={selected===row.id} aria-label={`${row.kind==='project'?'프로젝트':'작업 묶음'} ${row.title} 기간 ${range.start} – ${range.end}${row.done?' (완료)':''}`}
       className={`wf-tl-bar is-${row.kind} ${row.done?'is-done':''} ${placed.clippedStart?'clip-start':''} ${placed.clippedEnd?'clip-end':''}`}
       style={{left:`${placed.offset/total*100}%`,width:`${placed.length/total*100}%`,['--bar-color' as string]:row.color}}
       onPointerDown={event=>start(event,row,'move')} onPointerMove={move} onPointerUp={drop} onPointerCancel={()=>{active.current=null;setDrag(null);}} onKeyDown={event=>key(event,row)}>
       {!placed.clippedStart&&<span className="wf-tl-handle" aria-label={`${row.title} 시작일 조정`} onPointerDown={event=>start(event,row,'start')}/>}
       <span className="wf-tl-bar-body">{row.done&&<Check size={10} aria-hidden/>}{row.title} · {range.start?.slice(5)} – {range.end?.slice(5)}</span>
       {!placed.clippedEnd&&<span className="wf-tl-handle" aria-label={`${row.title} 종료일 조정`} onPointerDown={event=>start(event,row,'end')}/>}
      </div>
      :<button type="button" className="wf-tl-no-range" onClick={()=>onSelect(row.kind,row.id)}>{row.start&&row.end?'이 기간 밖':'기간 없음 · 기간 추가'}</button>}
    </div>
   </div>;
  })}
  {!rows.length&&<p className="wf-empty">{projectFilter.length?'선택한 프로젝트가 없습니다.':'Projects에서 프로젝트를 추가하세요.'}</p>}
 </div>;
}

function MonthView({month,today,layers,projectFilter,busy,selectedTask,onOpenTask,onSelectProject,onMove}:{month:string;today:string;layers:TimelineLayer[];projectFilter:string[];busy:boolean;selectedTask:string|null;
 onOpenTask:(id:string)=>void;onSelectProject:(id:string)=>void;onMove:(task:WorkTask,from:string,to:string)=>Promise<void>}){
 const flow=useWorkflow();
 const weeks=monthWeeks(month),range={start:weeks[0][0],end:weeks.at(-1)![6]};
 const {plans,deadlines}=monthMarkers(range,flow.tasks,flow.planDays,{layers,projectFilter});
 const [expanded,setExpanded]=useState<Set<string>>(new Set()),[dropTarget,setDropTarget]=useState<string|null>(null);
 const undated=showsLayer(layers,'PLAN')?undatedTasks(flow.tasks,flow.planDays,projectFilter):[];
 const colorOf=(task:WorkTask)=>{const project=flow.projects.find(item=>item.id===task.projectId);return project?projectColor(project.color):NEUTRAL_COLOR;};
 function onDrop(event:DragEvent,date:string){
  setDropTarget(null);
  const raw=event.dataTransfer.getData(PLAN_TYPE);if(!raw)return;event.preventDefault();
  const {taskId,from}=JSON.parse(raw) as {taskId:string;from:string};const task=flow.tasks.find(item=>item.id===taskId);
  if(task&&!busy)void onMove(task,from,date);
 }
 /** Keyboard alternative to drag: Alt+←/→ one day, Alt+↑/↓ one week. */
 function markerKey(event:ReactKeyboardEvent,task:WorkTask,date:string){
  const steps:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(!event.altKey||!(event.key in steps)||busy)return;event.preventDefault();void onMove(task,date,addDays(date,steps[event.key]));
 }
 return <div className="wf-tl-month">
  <div className="wf-tl-month-head">{WEEKDAYS.map(label=><span key={label}>{label}</span>)}</div>
  {weeks.map(week=>{
   const spans=showsLayer(layers,'PROJECT')?weekProjectSpans(week,flow.projects,projectFilter):[];
   return <div key={week[0]} className="wf-tl-week">
    {spans.length>0&&<div className="wf-tl-spans">{spans.map(span=><button key={span.project.id} type="button" className={`wf-tl-span ${span.project.status==='DONE'?'is-done':''} ${span.clippedStart?'clip-start':''} ${span.clippedEnd?'clip-end':''}`}
      style={{gridColumn:`${span.startColumn+1} / ${span.endColumn+2}`,['--bar-color' as string]:span.color}} aria-label={`프로젝트 기간 ${span.project.title} ${span.project.startDate} – ${span.project.endDate}`} onClick={()=>onSelectProject(span.project.id)}>
      <span className="wf-tl-kind" aria-hidden>■</span>{span.project.status==='DONE'&&<Check size={10} aria-hidden/>}{span.project.title}<small>{span.project.startDate?.slice(5)} – {span.project.endDate?.slice(5)}</small></button>)}</div>}
    <div className="wf-tl-days">{week.map(date=>{
     const dayPlans=plans.get(date)??[],dayDeadlines=deadlines.get(date)??[],open=expanded.has(date),shown=open?dayPlans:dayPlans.slice(0,MARKER_LIMIT);
     const outside=!date.startsWith(month);
     return <div key={date} className={`wf-tl-day ${outside?'is-outside':''} ${date===today?'is-today':''} ${dropTarget===date?'is-drop':''}`} data-date={date} aria-label={`${date}${date===today?' 오늘':''}`}
      onDragOver={event=>{if(event.dataTransfer.types.includes(PLAN_TYPE)){event.preventDefault();setDropTarget(date);}}} onDragLeave={()=>setDropTarget(current=>current===date?null:current)} onDrop={event=>onDrop(event,date)}>
      <span className="wf-tl-date">{Number(date.slice(8))}{date===today&&<em>오늘</em>}</span>
      {dayDeadlines.map(marker=><button key={`d-${marker.task.id}`} type="button" className={`wf-tl-deadline ${marker.task.status==='DONE'?'is-done':''} ${selectedTask===marker.task.id?'is-selected':''}`} data-deadline-task={marker.task.id}
        aria-label={`실제 마감 ${marker.task.title} ${date}${marker.task.status==='DONE'?' (완료)':''}`} onClick={()=>onOpenTask(marker.task.id)}><Flag size={10} aria-hidden/><span>마감</span> {marker.task.title}</button>)}
      {shown.map(marker=><button key={`p-${marker.task.id}`} type="button" draggable={!busy} className={`wf-tl-plan ${marker.task.status==='DONE'?'is-done':''} ${selectedTask===marker.task.id?'is-selected':''}`} data-plan-task={marker.task.id}
        style={{['--bar-color' as string]:colorOf(marker.task)}} aria-pressed={selectedTask===marker.task.id} aria-label={`계획 ${marker.task.title} ${date} · ${TASK_STATUS_LABELS[marker.task.status]}`} title="드래그하거나 Alt+화살표로 계획한 날만 옮깁니다"
        onDragStart={event=>{event.dataTransfer.setData(PLAN_TYPE,JSON.stringify({taskId:marker.task.id,from:date}));event.dataTransfer.effectAllowed='move';}}
        onKeyDown={event=>markerKey(event,marker.task,date)} onClick={()=>onOpenTask(marker.task.id)}>
        {marker.task.status==='DONE'?<Check size={10} aria-hidden/>:<i className="wf-tl-dot" aria-hidden/>}<span>{marker.task.title}</span></button>)}
      {dayPlans.length>MARKER_LIMIT&&<button type="button" className="wf-tl-more" onClick={()=>setExpanded(old=>{const next=new Set(old);if(next.has(date))next.delete(date);else next.add(date);return next;})}>{open?'접기':`+${dayPlans.length-MARKER_LIMIT} 더보기`}</button>}
     </div>;
    })}</div>
   </div>;
  })}
  {undated.length>0&&<section className="wf-tl-undated" aria-label="날짜 미정 작업"><h2>날짜 미정 작업 <span className="wf-count">{undated.length}</span></h2><p className="wf-muted">계획한 날도 실제 마감도 없는 진행 중 작업입니다. 요일 보드나 작업 상세에서 날짜를 정할 수 있습니다.</p>
   <div className="wf-tl-undated-list">{undated.map(task=><button key={task.id} type="button" className={selectedTask===task.id?'is-selected':''} onClick={()=>onOpenTask(task.id)}><i className="wf-tl-dot" style={{background:colorOf(task)}} aria-hidden/>{task.title}</button>)}</div></section>}
 </div>;
}

/** Explicit date-menu alternative for Project / Phase ranges. Saving writes only this entity's range. */
function RangeDetails({kind,entity,busy,save,close}:{kind:'project'|'phase';entity:Project|Phase;busy:boolean;save:(range:Range)=>Promise<boolean>;close:()=>void}){
 const [start,setStart]=useState(entity.startDate??''),[end,setEnd]=useState(entity.endDate??'');
 const status=kind==='project'?PROJECT_STATUS_LABELS[(entity as Project).status]:PHASE_STATUS_LABEL[(entity as Phase).status];
 return <section className="wf-tl-range-detail" aria-label={`${entity.title} 기간`}>
  <header><small>{kind==='project'?'프로젝트 기간':'작업 묶음 기간'} · {status}</small><button type="button" className="wf-td-icon" aria-label="기간 상세 닫기" onClick={close}><X size={16}/></button></header>
  <h2>{entity.title}</h2>
  <label>시작일<input type="date" value={start} onChange={event=>setStart(event.target.value)}/></label>
  <label>종료일<input type="date" value={end} onChange={event=>setEnd(event.target.value)}/></label>
  <button type="button" className="wf-primary" disabled={busy||!start||!end||start>end} onClick={()=>void save({start,end})}>기간 적용</button>
  <p className="wf-muted">이 {kind==='project'?'프로젝트':'작업 묶음'}의 기간만 바뀝니다. {kind==='project'?'작업 묶음, ':''}작업의 계획한 날·마감·Workpad 기록은 그대로입니다.</p>
  {entity.memo&&<p className="wf-muted">{entity.memo}</p>}
 </section>;
}
