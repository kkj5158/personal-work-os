'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {CalendarClock,Clock3,Flag,Hourglass,Play,Sun} from 'lucide-react';
import type {TaskStatus,WorkTask} from '@/lib/api/workflow';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import {shortDate} from '@/lib/workflow/labels';
import {WorkflowConflictError} from '@/lib/workflow/store';
import {CHECK_WHEN_LABELS,defaultCheckDate,extendChoices,matchesCheckWhen,waitingProjection,type CheckWhen} from '@/lib/workflow/waiting';
import {UNASSIGNED} from '@/lib/workflow/explorer';
import {useWorkflow} from './WorkflowContext';
import {useTaskSelection} from './useTaskSelection';
import {RowControl,rowOpenHandler} from './TaskRow';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';

const today=()=>toDateKey(seoulToday());
const errorText=(e:unknown)=>e instanceof WorkflowConflictError?'다른 창에서 먼저 변경되어 최신 값으로 표시합니다.':e instanceof Error?e.message:'저장하지 못했습니다.';

/** Small non-modal popover anchored to its trigger; closes on outside click and Escape. */
function Popover({label,trigger,children,className=''}:{label:string;trigger:(open:boolean,toggle:()=>void)=>ReactNode;children:(close:()=>void)=>ReactNode;className?:string}){
 const [open,setOpen]=useState(false),box=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:MouseEvent)=>{if(!box.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
  document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 return <span className={`wf-wait-pop-anchor ${className}`} ref={box}>{trigger(open,()=>setOpen(value=>!value))}{open&&<span className="wf-wait-pop" role="group" aria-label={label}>{children(()=>setOpen(false))}</span>}</span>;
}

/** Inline text cell: keeps a local draft, commits on blur / Enter, reverts on Escape. A failed save keeps the draft. */
function InlineText({value,label,placeholder,onCommit}:{value:string;label:string;placeholder?:string;onCommit:(next:string|null)=>Promise<unknown>}){
 // null = show the canonical value; a string = a local draft (kept after a failed save until the user resolves it).
 const [draft,setDraft]=useState<string|null>(null),cancelled=useRef(false);
 async function commit(){if(cancelled.current){cancelled.current=false;setDraft(null);return;}if(draft===null)return;const next=draft.trim();if(next===value.trim()){setDraft(null);return;}try{await onCommit(next||null);setDraft(null);}catch{/* keep the draft visible */}}
 return <input className={`wf-wait-input ${draft!==null&&draft.trim()!==value.trim()?'is-dirty':''}`} aria-label={label} placeholder={placeholder} value={draft??value} onFocus={()=>setDraft(current=>current??value)} onChange={event=>setDraft(event.target.value)} onBlur={()=>void commit()} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();if(event.key==='Escape'){cancelled.current=true;event.currentTarget.blur();}}}/>;
}

/** 대기 연장: a small inline date choice (오늘 / 내일 / 다음 주 / 날짜 없음 / 직접 날짜). No edit modal. */
function ExtendPicker({task,onPick}:{task:WorkTask;onPick:(date:string|null)=>Promise<void>}){
 const [custom,setCustom]=useState('');
 const label=task.waitingCheckDate?`${shortDate(task.waitingCheckDate)} 확인`:'날짜 없음';
 return <Popover label={`${task.title} 확인 날짜 변경`} className="wf-wait-extend" trigger={(open,toggle)=><button type="button" className={`wf-wait-date ${task.waitingCheckDate&&task.waitingCheckDate<=today()?'is-due':''}`} aria-expanded={open} aria-label={`${task.title} 확인 날짜 ${label}`} onClick={toggle}><CalendarClock size={12} aria-hidden/>{label}</button>}>
  {close=><>
   <span className="wf-wait-pop-title">대기 연장 · 확인 날짜</span>
   <span className="wf-wait-choices">{extendChoices(today()).map(choice=><button key={choice.key} type="button" onClick={()=>{close();void onPick(choice.date);}}>{choice.label}</button>)}</span>
   <span className="wf-wait-custom"><input type="date" aria-label={`${task.title} 확인 날짜 직접 선택`} value={custom} onChange={event=>setCustom(event.target.value)}/><button type="button" disabled={!custom} onClick={()=>{const date=custom;setCustom('');close();void onPick(date);}}>적용</button></span>
  </>}
 </Popover>;
}

/** 재개: the same canonical Task returns to 할 일 or 진행 중 (waiting context kept in history), optionally added to today. */
function ResumeButton({task,onResume}:{task:WorkTask;onResume:(status:TaskStatus,addToday:boolean)=>Promise<void>}){
 const [addToday,setAddToday]=useState(false);
 return <Popover label={`${task.title} 재개`} trigger={(open,toggle)=><button type="button" className="wf-wait-action" aria-expanded={open} onClick={toggle}><Play size={12} aria-hidden/>재개</button>}>
  {close=><>
   <span className="wf-wait-pop-title">같은 작업을 다시 진행합니다</span>
   <span className="wf-wait-choices"><button type="button" onClick={()=>{close();void onResume('TODO',addToday);}}>할 일로 재개</button><button type="button" onClick={()=>{close();void onResume('DOING',addToday);}}>진행 중으로 재개</button></span>
   <label className="wf-wait-check"><input type="checkbox" checked={addToday} onChange={event=>setAddToday(event.target.checked)}/>재개하면서 오늘에 추가</label>
  </>}
 </Popover>;
}

type Table='ready'|'waiting';
/** Inline add row: only the title is required; Project / reason / next action / check date stay optional. */
function AddWaitingRow({table,defaultProject}:{table:Table;defaultProject:string|null}){
 const flow=useWorkflow();
 const empty=()=>({projectId:defaultProject??'',title:'',reason:'',next:'',date:defaultCheckDate(table,today())});
 const [draft,setDraft]=useState(empty),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(){
  const title=draft.title.trim();if(!title||busy)return;setBusy(true);setError('');
  let createdId:string|null=null;
  try{
   // A Waiting item is an ordinary canonical Task that enters WAITING through the lifecycle command (history kept).
   const projectId=draft.projectId||null,order=Math.max(-1,...flow.tasks.filter(task=>task.projectId===projectId&&!task.phaseId).map(task=>task.order))+1;
   const created=await flow.saveTask({title,projectId,phaseId:null,status:'TODO',priority:'NORMAL',startDate:null,dueDate:null,memo:null,order});createdId=created.id;
   await flow.setTaskStatus(created.id,{status:'WAITING',waitingReason:draft.reason.trim()||null,waitingNextAction:draft.next.trim()||null,waitingCheckDate:draft.date||null,waitingFlagged:false});
   setDraft(empty());
  }catch(e){setError(createdId?`작업은 만들었지만 대기로 바꾸지 못했습니다: ${errorText(e)}`:errorText(e));}
  finally{setBusy(false);}
 }
 const label=table==='ready'?'확인할 일':'대기 작업';
 return <form className="wf-wait-row is-add" aria-label={`새 ${label} 추가`} onSubmit={event=>{event.preventDefault();void submit();}}>
  <select aria-label={`새 ${label} 프로젝트`} value={draft.projectId} onChange={event=>setDraft({...draft,projectId:event.target.value})}><option value="">프로젝트 없음</option>{flow.projects.filter(project=>!project.archivedAt).sort((a,b)=>a.order-b.order).map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select>
  <input aria-label={`새 ${label} 제목`} placeholder="제목 입력" value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/>
  <input aria-label={`새 ${label} 대기 이유`} placeholder="대기 이유 (선택)" value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/>
  <input aria-label={`새 ${label} 결과가 오면`} placeholder="결과가 오면 (선택)" value={draft.next} onChange={event=>setDraft({...draft,next:event.target.value})}/>
  <input type="date" aria-label={`새 ${label} 확인 날짜`} value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value})}/>
  <span className="wf-wait-actions"><button className="wf-primary" disabled={!draft.title.trim()||busy}>{busy?'추가 중…':'추가'}</button><button type="button" disabled={busy} onClick={()=>{setDraft(empty());setError('');}}>취소</button></span>
  {error&&<small role="alert" className="wf-row-error">{error}</small>}
 </form>;
}

function WaitingRow({task,table,selected,onSelect,onNotice}:{task:WorkTask;table:Table;selected:boolean;onSelect:()=>void;onNotice:(text:string)=>void}){
 const flow=useWorkflow();const [message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>,success=''){try{setMessage('');await action();if(success)onNotice(success);}catch(e){setMessage(errorText(e));throw e;}}
 const quiet=(action:()=>Promise<unknown>,success='')=>run(action,success).catch(()=>{});
 const update=(patch:Partial<WorkTask>)=>run(()=>flow.updateTask(task.id,patch));
 return <div className={`wf-wait-row ${selected?'is-selected':''}`} data-task-id={task.id} onClick={rowOpenHandler(onSelect)}>
  <RowControl><select aria-label={`${task.title} 프로젝트`} value={task.projectId??''} onChange={event=>void update({projectId:event.target.value||null,phaseId:null}).catch(()=>{})}><option value="">프로젝트 없음</option>{flow.projects.filter(project=>!project.archivedAt||project.id===task.projectId).map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></RowControl>
  <span className="wf-wait-title"><button type="button" className="wf-title-button" aria-current={selected||undefined}>{task.title}</button>{task.waitingFlagged&&<small className="wf-wait-flagged"><Flag size={10} aria-hidden/>확인 표시</small>}{message&&<small role="status" className="wf-row-error">{message}</small>}</span>
  <RowControl><InlineText label={`${task.title} 대기 이유`} placeholder="대기 이유" value={task.waitingReason??''} onCommit={value=>update({waitingReason:value})}/></RowControl>
  <RowControl><InlineText label={`${task.title} 결과가 오면`} placeholder="결과가 오면 할 일" value={task.waitingNextAction??''} onCommit={value=>update({waitingNextAction:value})}/></RowControl>
  {/* Extending moves the next check out: the explicit "check now" flag is cleared with it. */}
  <RowControl><ExtendPicker task={task} onPick={date=>quiet(()=>flow.updateTask(task.id,{waitingCheckDate:date,waitingFlagged:false}),date?`확인 날짜를 ${shortDate(date)}로 바꿨습니다.`:'확인 날짜를 비웠습니다.')}/></RowControl>
  <RowControl className="wf-wait-actions">
   <ResumeButton task={task} onResume={(status,addToday)=>quiet(async()=>{await flow.setTaskStatus(task.id,{status});if(addToday)await flow.addToToday(task.id);},`‘${task.title}’을(를) ${status==='DOING'?'진행 중':'할 일'}으로 재개했습니다${addToday?' · 오늘에 추가됨':''}.`)}/>
   <button type="button" className="wf-wait-action" aria-label={`${task.title} 오늘에 추가`} onClick={()=>void quiet(()=>flow.addToToday(task.id),`‘${task.title}’을(를) 오늘에 추가했습니다.`)}><Sun size={12} aria-hidden/>오늘에 추가</button>
   {table==='waiting'&&<button type="button" className="wf-wait-action" aria-label={`${task.title} 지금 확인`} title="확인할 때가 된 일로 올립니다" onClick={()=>void quiet(()=>flow.updateTask(task.id,{waitingFlagged:true}))}><Flag size={12} aria-hidden/>지금 확인</button>}
  </RowControl>
 </div>;
}

function WaitingTable({table,tasks,selected,select,onNotice,defaultProject}:{table:Table;tasks:WorkTask[];selected:string|null;select:(id:string)=>void;onNotice:(text:string)=>void;defaultProject:string|null}){
 const ready=table==='ready';
 return <section className={`wf-wait-section is-${table}`} aria-label={ready?'확인할 때가 된 일':'대기 중'}>
  <header><h2>{ready?<Clock3 size={18} aria-hidden/>:<Hourglass size={18} aria-hidden/>}{ready?'확인할 때가 된 일':'대기 중'} <span className="wf-count">{tasks.length}</span></h2>
   <p className="wf-muted">{ready?'확인 날짜가 되었거나 직접 확인 표시한 대기 작업입니다. 별도 상태가 아니라 같은 대기 작업의 보기입니다.':'외부 결과·승인을 기다리는 작업입니다. 확인 날짜가 되면 위로 올라옵니다.'}</p></header>
  <div className="wf-wait-table" role="table" aria-label={`${ready?'확인할 때가 된 일':'대기 중'} 목록`}>
   <div className="wf-wait-row is-head" role="row"><span>프로젝트</span><span>제목</span><span>대기 이유</span><span>결과가 오면</span><span>{ready?'확인 예정':'다시 확인'}</span><span>작업</span></div>
   <AddWaitingRow table={table} defaultProject={defaultProject}/>
   {tasks.map(task=><WaitingRow key={task.id} task={task} table={table} selected={selected===task.id} onSelect={()=>select(task.id)} onNotice={onNotice}/>)}
   {!tasks.length&&<p className="wf-muted wf-wait-empty">{ready?'지금 확인할 대기 작업이 없습니다.':'대기 중인 작업이 없습니다.'}</p>}
  </div>
 </section>;
}

/**
 * S08 Waiting / Check: only canonical Tasks whose status is WAITING, as two projections of the same status.
 * Not an idea list, archive or generic hold bucket. New items are created from each table's inline row.
 */
export default function Waiting(){
 const flow=useWorkflow();const [selected,select]=useTaskSelection();
 const [projectFilter,setProjectFilter]=useState<string[]>([]),[when,setWhen]=useState<CheckWhen[]>([]),[search,setSearch]=useState(''),[notice,setNotice]=useState('');
 const day=today();
 const matches=(task:WorkTask)=>(!projectFilter.length||projectFilter.includes(task.projectId??UNASSIGNED))&&matchesCheckWhen(task,when,day)
  &&(!search.trim()||`${task.title} ${task.waitingReason??''} ${task.waitingNextAction??''} ${flow.projects.find(project=>project.id===task.projectId)?.title??''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const all=waitingProjection(flow.tasks,day),view={ready:all.ready.filter(matches),waiting:all.waiting.filter(matches)};
 const projects=flow.projects.filter(project=>!project.archivedAt).sort((a,b)=>a.order-b.order);
 const toggle=<T extends string>(list:T[],value:T)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
 const defaultProject=projectFilter.length===1&&projectFilter[0]!==UNASSIGNED?projectFilter[0]:null;
 return <SplitView detail={selected?<TaskDetailPanel key={selected} taskId={selected} onClose={()=>select(null)} onSelect={select}/>:null}>
  <div className={`wf-wait-layout ${selected?'has-split-detail':''}`}><main className="wf-wait-main">
   <header className="wf-page-heading"><div><h1>대기 / 확인할 일</h1><p className="wf-muted">지금 바로 처리할 수는 없지만 다시 돌아와야 하는 대기 작업만 모아 봅니다.</p></div>
    <input className="wf-wait-search" aria-label="대기 작업 검색" placeholder="제목, 프로젝트, 내용으로 검색…" value={search} onChange={event=>setSearch(event.target.value)}/></header>
   <section className="wf-explorer-filters" aria-label="대기 필터">
    <div className="wf-filter-row" role="group" aria-label="프로젝트 필터"><span className="wf-filter-label">프로젝트</span><div className="wf-filter-buttons">
     <button type="button" aria-pressed={!projectFilter.length} onClick={()=>setProjectFilter([])}>전체</button>
     {[...projects.map(project=>({id:project.id,title:project.title,color:project.color||'#0969da'})),{id:UNASSIGNED,title:'프로젝트 없음',color:'#8c959f'}].map(item=><button key={item.id} type="button" aria-pressed={projectFilter.includes(item.id)} onClick={()=>setProjectFilter(toggle(projectFilter,item.id))}><span className="wf-filter-dot" style={{background:item.color}} aria-hidden/>{item.title}</button>)}
    </div></div>
    <div className="wf-filter-row" role="group" aria-label="확인 시점 필터"><span className="wf-filter-label">확인 시점</span><div className="wf-filter-buttons">
     <button type="button" aria-pressed={!when.length} onClick={()=>setWhen([])}>전체</button>
     {(Object.keys(CHECK_WHEN_LABELS) as CheckWhen[]).map(value=><button key={value} type="button" aria-pressed={when.includes(value)} onClick={()=>setWhen(toggle(when,value))}>{CHECK_WHEN_LABELS[value]}</button>)}
    </div></div>
   </section>
   {notice&&<p className="wf-wait-notice" role="status">{notice}<button type="button" aria-label="알림 닫기" onClick={()=>setNotice('')}>×</button></p>}
   <WaitingTable table="ready" tasks={view.ready} selected={selected} select={select} onNotice={setNotice} defaultProject={defaultProject}/>
   <WaitingTable table="waiting" tasks={view.waiting} selected={selected} select={select} onNotice={setNotice} defaultProject={defaultProject}/>
  </main>
  {!selected&&<aside className="wf-context-rail wf-wait-rail"><div className="wf-wait-summary"><h2>대기 항목 요약</h2><div><span><small>확인 필요</small><strong>{all.ready.length}</strong></span><span><small>대기 중</small><strong>{all.waiting.length}</strong></span></div></div>
   <div className="wf-detail"><h2>대기와 보류의 차이</h2><p className="wf-muted"><strong>대기</strong>는 외부 결과·승인을 기다리는 작업 상태입니다. <strong>보류</strong>는 프로젝트를 잠시 추진하지 않기로 한 상태이며 이 화면의 대상이 아닙니다.</p><p className="wf-muted">재개하면 같은 작업이 할 일 또는 진행 중으로 돌아가고, 대기 이유와 확인 날짜는 기록으로 남습니다.</p></div></aside>}
  </div>
 </SplitView>;
}
