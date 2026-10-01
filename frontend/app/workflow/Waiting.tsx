'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {CalendarClock,Clock3,Flag,Hourglass,MoreHorizontal,Play,Plus,RotateCcw,Sun} from 'lucide-react';
import type {Project,TaskStatus,WorkTask} from '@/lib/api/workflow';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import {shortDate} from '@/lib/workflow/labels';
import {WorkflowConflictError} from '@/lib/workflow/store';
import {ALL_CONTEXT,CHECK_WHEN_LABELS,NO_PROJECT_CONTEXT,contextProjectId,defaultCheckDate,extendChoices,inWaitingContext,matchesCheckWhen,readWaitingContext,waitingContextSections,waitingProjection,writeWaitingContext,type CheckWhen,type WaitingContext} from '@/lib/workflow/waiting';
import {projectGroupSections,type ProjectGroupSection} from '@/lib/workflow/catalog';
import {UNASSIGNED} from '@/lib/workflow/explorer';
import {useWorkflow} from './WorkflowContext';
import {useTaskSelection} from './useTaskSelection';
import {RowControl,rowOpenHandler} from './TaskRow';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';
import {ProjectGroupChips,ProjectGroupFilter} from './ProjectGroupChips';

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
/**
 * Inline add row inside a Project context: only the title is required; reason / next action / check date stay optional.
 * There is no Project selector: the current context decides projectId (null = 프로젝트 없음), read at submit time so a
 * context switch can never leave a stale Project behind. Focus returns to the title for consecutive entry.
 */
function AddWaitingRow({table,projectId,focusRequest,onFocused}:{table:Table;projectId:string|null;focusRequest?:boolean;onFocused?:()=>void}){
 const flow=useWorkflow();const titleRef=useRef<HTMLInputElement>(null);
 // "+ 새 대기/확인" in 전체 switches context and asks the create row for focus once.
 useEffect(()=>{if(focusRequest){titleRef.current?.focus();onFocused?.();}},[focusRequest,onFocused]);
 const empty=()=>({title:'',reason:'',next:'',date:defaultCheckDate(table,today())});
 const [draft,setDraft]=useState(empty),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(){
  const title=draft.title.trim();if(!title||busy)return;setBusy(true);setError('');
  let createdId:string|null=null;
  try{
   // A Waiting item is an ordinary canonical Task that enters WAITING through the lifecycle command (history kept).
   const order=Math.max(-1,...flow.tasks.filter(task=>task.projectId===projectId&&!task.phaseId).map(task=>task.order))+1;
   const created=await flow.saveTask({title,projectId,phaseId:null,status:'TODO',priority:'NORMAL',startDate:null,dueDate:null,memo:null,order});createdId=created.id;
   await flow.setTaskStatus(created.id,{status:'WAITING',waitingReason:draft.reason.trim()||null,waitingNextAction:draft.next.trim()||null,waitingCheckDate:draft.date||null,waitingFlagged:false});
   setDraft(empty());
  }catch(e){setError(createdId?`작업은 만들었지만 대기로 바꾸지 못했습니다: ${errorText(e)}`:errorText(e));}
  finally{setBusy(false);titleRef.current?.focus();}
 }
 const label=table==='ready'?'확인할 일':'대기 작업';
 return <form className="wf-wait-row is-add" aria-label={`새 ${label} 추가`} onSubmit={event=>{event.preventDefault();void submit();}}>
  <input ref={titleRef} aria-label={`새 ${label} 제목`} placeholder={`+ 새 ${label} 제목 (Enter로 추가)`} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/>
  <input aria-label={`새 ${label} 대기 이유`} placeholder="대기 이유 (선택)" value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/>
  <input aria-label={`새 ${label} 결과가 오면`} placeholder="결과가 오면 (선택)" value={draft.next} onChange={event=>setDraft({...draft,next:event.target.value})}/>
  <input type="date" aria-label={`새 ${label} 확인 날짜`} value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value})}/>
  <span className="wf-wait-actions"><button className="wf-primary" disabled={!draft.title.trim()||busy}>{busy?'추가 중…':'추가'}</button><button type="button" disabled={busy} onClick={()=>{setDraft(empty());setError('');}}>취소</button></span>
  {error&&<small role="alert" className="wf-row-error">{error}</small>}
 </form>;
}

function WaitingRow({task,table,selected,showProject,onSelect,onNotice}:{task:WorkTask;table:Table;selected:boolean;showProject:boolean;onSelect:()=>void;onNotice:(text:string)=>void}){
 const flow=useWorkflow();const [message,setMessage]=useState('');
 async function run(action:()=>Promise<unknown>,success=''){try{setMessage('');await action();if(success)onNotice(success);}catch(e){setMessage(errorText(e));throw e;}}
 const quiet=(action:()=>Promise<unknown>,success='')=>run(action,success).catch(()=>{});
 const update=(patch:Partial<WorkTask>)=>run(()=>flow.updateTask(task.id,patch));
 const moveTo=(projectId:string|null)=>{const name=flow.projects.find(project=>project.id===projectId)?.title??'프로젝트 없음';void quiet(()=>flow.updateTask(task.id,{projectId,phaseId:null}),`‘${task.title}’을(를) ${name}(으)로 옮겼습니다.`);};
 return <div className={`wf-wait-row ${selected?'is-selected':''}`} data-task-id={task.id} onClick={rowOpenHandler(onSelect)}>
  {/* 전체 is the management view: Project association is edited here (the current Project stays listed even when archived). */}
  {showProject&&<RowControl><select aria-label={`${task.title} 프로젝트`} value={task.projectId??''} onChange={event=>moveTo(event.target.value||null)}><option value="">프로젝트 없음</option>{flow.projects.filter(project=>!project.archivedAt||project.id===task.projectId).map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select></RowControl>}
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

/** `projectId` undefined = 전체 (aggregated management: Project column, no add row); otherwise the context's Project. */
function WaitingTable({table,tasks,selected,select,onNotice,projectId,focusRequest,onFocused}:{table:Table;tasks:WorkTask[];selected:string|null;select:(id:string)=>void;onNotice:(text:string)=>void;projectId:string|null|undefined;focusRequest?:boolean;onFocused?:()=>void}){
 const ready=table==='ready',all=projectId===undefined;
 return <section className={`wf-wait-section is-${table}`} aria-label={ready?'확인할 때가 된 일':'대기 중'}>
  <header><h2>{ready?<Clock3 size={18} aria-hidden/>:<Hourglass size={18} aria-hidden/>}{ready?'확인할 때가 된 일':'대기 중'} <span className="wf-count">{tasks.length}</span></h2>
   <p className="wf-muted">{ready?'확인 날짜가 되었거나 직접 확인 표시한 대기 작업입니다. 별도 상태가 아니라 같은 대기 작업의 보기입니다.':'외부 결과·승인을 기다리는 작업입니다. 확인 날짜가 되면 위로 올라옵니다.'}</p></header>
  <div className={`wf-wait-table ${all?'':'is-context'}`} role="table" aria-label={`${ready?'확인할 때가 된 일':'대기 중'} 목록`}>
   <div className="wf-wait-row is-head" role="row">{all&&<span>프로젝트</span>}<span>제목</span><span>대기 이유</span><span>결과가 오면</span><span>{ready?'확인 예정':'다시 확인'}</span><span>작업</span></div>
   {!all&&<AddWaitingRow table={table} projectId={projectId} focusRequest={focusRequest} onFocused={onFocused}/>}
   {tasks.map(task=><WaitingRow key={task.id} task={task} table={table} selected={selected===task.id} showProject={all} onSelect={()=>select(task.id)} onNotice={onNotice}/>)}
   {!tasks.length&&<p className="wf-muted wf-wait-empty">{ready?'지금 확인할 대기 작업이 없습니다.':'대기 중인 작업이 없습니다.'}</p>}
  </div>
 </section>;
}

const STATUS_LABEL:Record<string,string>={PAUSED:'보류',DONE:'완료'};
const projectNote=(project:Project)=>project.archivedAt?'보관됨':STATUS_LABEL[project.status];

/** Vertical grouped list of contexts inside a popover (더보기, + 새 대기/확인): group label, then its Projects. */
function ContextMenu({sections,count,onPick,label}:{sections:ProjectGroupSection[];count:(id:string)=>number;onPick:(id:string)=>void;label?:string}){
 return <span className="wf-wait-ctx-menu">{label&&<span className="wf-wait-pop-title">{label}</span>}{sections.map(section=><span key={section.key} className="wf-wait-ctx-group" role="group" aria-label={`${section.name} 그룹`}><span className="wf-wait-ctx-group-name">{section.name}</span>
  {section.projects.map(project=>{const note=projectNote(project);return <button key={project.id} type="button" title={project.title} onClick={()=>onPick(project.id)}><span className="wf-filter-dot" style={{background:project.color||'#0969da'}} aria-hidden/><span className="wf-pchip-name">{project.title}</span>{note&&<small className="wf-pchip-note">{note}</small>}<small className="wf-pchip-count">{count(project.id)}</small></button>;})}</span>)}</span>;
}

/**
 * Project context navigation: 전체 / 프로젝트 없음, then active Projects grouped exactly like the Projects page, and
 * 더보기 for 보류 · 완료 and archived-with-items Projects. Selecting one means "I am viewing and entering Waiting items
 * for this Project"; it is a workspace context, not only a filter.
 */
function ContextNav({context,onChange,primary,more,count,total}:{context:WaitingContext;onChange:(next:WaitingContext)=>void;primary:ProjectGroupSection[];more:ProjectGroupSection[];count:(id:string)=>number;total:number}){
 const moreCount=more.reduce((sum,section)=>sum+section.projects.length,0);
 const fixed=(id:string,title:string,color:string,value:number)=><button type="button" className="wf-pchip wf-wait-ctx" aria-pressed={context===id} onClick={()=>onChange(id)}><span className="wf-filter-dot" style={{background:color}} aria-hidden/>{title}<small className="wf-pchip-count">{value}</small></button>;
 return <nav className="wf-wait-contexts" aria-label="대기 프로젝트 컨텍스트">
  <ProjectGroupChips sections={primary} pressed={id=>context===id} onPick={onChange} count={count} note={projectNote} chipClassName="wf-wait-ctx"
   leading={<span className="wf-pgroup is-plain">{fixed(ALL_CONTEXT,'전체','#3f5166',total)}{fixed(NO_PROJECT_CONTEXT,'프로젝트 없음','#8c959f',count(NO_PROJECT_CONTEXT))}</span>}
   trailing={moreCount>0&&<Popover label="다른 프로젝트 컨텍스트" className="wf-wait-ctx-more" trigger={(open,toggle)=><button type="button" className="wf-pchip wf-wait-ctx" aria-expanded={open} aria-haspopup="true" onClick={toggle}><MoreHorizontal size={13} aria-hidden/>더보기 <small className="wf-pchip-count">{moreCount}</small></button>}>
    {close=><ContextMenu label="보류 · 완료 · 보관된 프로젝트" sections={more} count={count} onPick={id=>{close();onChange(id);}}/>}
   </Popover>}/>
 </nav>;
}

/** 전체 → "+ 새 대기/확인": choose where the new item belongs, then that context opens with its create row focused. */
function NewWaitingEntry({primary,more,count,onPick}:{primary:ProjectGroupSection[];more:ProjectGroupSection[];count:(id:string)=>number;onPick:(id:string)=>void}){
 return <Popover label="새 대기/확인 위치 선택" className="wf-wait-new" trigger={(open,toggle)=><button type="button" className="wf-primary wf-wait-new-button" aria-expanded={open} aria-haspopup="true" onClick={toggle}><Plus size={13} aria-hidden/>새 대기/확인</button>}>
  {close=><>
   <span className="wf-wait-pop-title">어느 프로젝트의 대기 항목인가요?</span>
   <span className="wf-wait-ctx-group"><button type="button" onClick={()=>{close();onPick(NO_PROJECT_CONTEXT);}}><span className="wf-filter-dot" style={{background:'#8c959f'}} aria-hidden/><span className="wf-pchip-name">프로젝트 없음</span><small className="wf-pchip-count">{count(NO_PROJECT_CONTEXT)}</small></button></span>
   <ContextMenu sections={primary} count={count} onPick={id=>{close();onPick(id);}}/>
   {more.length>0&&<ContextMenu label="보류 · 완료 · 보관" sections={more} count={count} onPick={id=>{close();onPick(id);}}/>}
  </>}
 </Popover>;
}

/** 직접 지정: one Asia/Seoul date key. The pressed chip shows it (직접 지정 · 10/03); 해제 removes it. */
function CustomDateFilter({date,onApply,onClear}:{date:string|null;onApply:(date:string)=>void;onClear:()=>void}){
 const [value,setValue]=useState(date??'');
 return <Popover label="직접 지정 확인 날짜" className="wf-wait-custom-date" trigger={(open,toggle)=><button type="button" aria-pressed={!!date} aria-expanded={open} onClick={()=>{setValue(date??today());toggle();}}><CalendarClock size={12} aria-hidden/>{date?`직접 지정 · ${shortDate(date)}`:'직접 지정'}</button>}>
  {close=><>
   <span className="wf-wait-pop-title">이 날짜에 확인할 항목만 보기</span>
   <span className="wf-wait-custom"><input type="date" aria-label="직접 지정 날짜" value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&value){event.preventDefault();close();onApply(value);}}}/>
    <button type="button" disabled={!value} onClick={()=>{close();onApply(value);}}>적용</button>
    {date&&<button type="button" onClick={()=>{close();onClear();}}>해제</button>}</span>
  </>}
 </Popover>;
}

/**
 * S08 Waiting / Check: only canonical Tasks whose status is WAITING, as two projections of the same status.
 * Not an idea list, archive or generic hold bucket. A Project context (or 프로젝트 없음) is where new items are
 * entered; 전체 aggregates every context for review, filters, search and Project reassignment.
 */
export default function Waiting(){
 const flow=useWorkflow();const [selected,select]=useTaskSelection();
 const [projectFilter,setProjectFilter]=useState<string[]>([]),[when,setWhen]=useState<CheckWhen[]>([]),[customDate,setCustomDate]=useState<string|null>(null),[search,setSearch]=useState(''),[notice,setNotice]=useState('');
 // First visit = 전체; afterwards the last chosen context (read after mount so SSR and hydration agree).
 const [stored,setStored]=useState<WaitingContext>(ALL_CONTEXT),[focusAdd,setFocusAdd]=useState(false);
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setStored(readWaitingContext());},[]);
 const focused=useCallback(()=>setFocusAdd(false),[]);
 const day=today();
 const all=waitingProjection(flow.tasks,day),waitingTasks=[...all.ready,...all.waiting];
 const countOf=(id:string)=>waitingTasks.filter(task=>inWaitingContext(task,id)).length;
 const owning=new Set(waitingTasks.map(task=>task.projectId).filter((id):id is string=>!!id));
 const nav=waitingContextSections(flow.projects,flow.groups,owning,stored);
 // A remembered Project that no longer exists falls back to 전체 (derived; nothing is detached or rewritten).
 const context=stored===ALL_CONTEXT||stored===NO_PROJECT_CONTEXT||flow.loading||nav.known(stored)?stored:ALL_CONTEXT;
 const changeContext=(next:WaitingContext)=>{setStored(next);writeWaitingContext(next);};
 const projectId=contextProjectId(context),isAll=projectId===undefined;
 const current=flow.projects.find(project=>project.id===projectId);
 const matches=(task:WorkTask)=>inWaitingContext(task,context)&&(!isAll||!projectFilter.length||projectFilter.includes(task.projectId??UNASSIGNED))&&matchesCheckWhen(task,when,day,customDate)
  &&(!search.trim()||`${task.title} ${task.waitingReason??''} ${task.waitingNextAction??''} ${flow.projects.find(project=>project.id===task.projectId)?.title??''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const view={ready:all.ready.filter(matches),waiting:all.waiting.filter(matches)};
 // 전체 project filter: Projects-page groups; every non-archived Project plus archived ones that still own WAITING items.
 const filterSections=projectGroupSections(flow.projects,flow.groups,project=>!project.archivedAt||owning.has(project.id));
 const toggle=<T extends string>(list:T[],value:T)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];
 const narrowed=(isAll&&projectFilter.length>0)||when.length>0||!!search.trim();
 const resetFilters=()=>{setProjectFilter([]);setWhen([]);setCustomDate(null);setSearch('');};
 return <SplitView detail={selected?<TaskDetailPanel key={selected} taskId={selected} onClose={()=>select(null)} onSelect={select}/>:null}>
  <div className={`wf-wait-layout ${selected?'has-split-detail':''}`}><main className="wf-wait-main">
   <header className="wf-page-heading"><div><h1>대기 / 확인할 일</h1><p className="wf-muted">지금 바로 처리할 수는 없지만 다시 돌아와야 하는 대기 작업만 모아 봅니다.</p></div>
    <input className="wf-wait-search" aria-label="대기 작업 검색" placeholder="제목, 프로젝트, 내용으로 검색…" value={search} onChange={event=>setSearch(event.target.value)}/></header>
   <ContextNav context={context} onChange={changeContext} primary={nav.primary} more={nav.more} count={countOf} total={waitingTasks.length}/>
   <div className="wf-wait-context-bar">
    <p className="wf-wait-context-note" aria-live="polite">{isAll?<>전체 보기 · 모든 프로젝트의 대기 항목을 함께 검토하고 프로젝트를 옮깁니다.</>
     :<><strong>{current?.title??'프로젝트 없음'}</strong>의 대기 항목 · 아래 입력 줄에서 추가하면 {current?'이 프로젝트에 연결됩니다':'프로젝트 없이 만들어집니다'}.</>}</p>
    {isAll&&<NewWaitingEntry primary={nav.primary} more={nav.more} count={countOf} onPick={id=>{changeContext(id);setFocusAdd(true);}}/>}
   </div>
   <section className="wf-explorer-filters" aria-label="대기 필터">
    {isAll&&<ProjectGroupFilter sections={filterSections} selected={projectFilter} onChange={setProjectFilter} unassigned={UNASSIGNED} count={countOf}/>}
    <div className="wf-filter-row" role="group" aria-label="확인 시점 필터"><span className="wf-filter-label">확인 시점</span><div className="wf-filter-buttons">
     <button type="button" aria-pressed={!when.length} onClick={()=>{setWhen([]);setCustomDate(null);}}>전체</button>
     {(Object.keys(CHECK_WHEN_LABELS) as (keyof typeof CHECK_WHEN_LABELS)[]).map(value=><button key={value} type="button" aria-pressed={when.includes(value)} onClick={()=>setWhen(toggle(when,value))}>{CHECK_WHEN_LABELS[value]}</button>)}
     <CustomDateFilter date={when.includes('CUSTOM')?customDate:null} onApply={date=>{setCustomDate(date);setWhen(list=>list.includes('CUSTOM')?list:[...list,'CUSTOM']);}} onClear={()=>{setCustomDate(null);setWhen(list=>list.filter(item=>item!=='CUSTOM'));}}/>
     {narrowed&&<button type="button" className="wf-filter-reset" onClick={resetFilters}><RotateCcw size={12} aria-hidden/>필터 초기화</button>}
    </div></div>
   </section>
   {notice&&<p className="wf-wait-notice" role="status">{notice}<button type="button" aria-label="알림 닫기" onClick={()=>setNotice('')}>×</button></p>}
   <WaitingTable table="ready" tasks={view.ready} selected={selected} select={select} onNotice={setNotice} projectId={projectId}/>
   <WaitingTable table="waiting" tasks={view.waiting} selected={selected} select={select} onNotice={setNotice} projectId={projectId} focusRequest={focusAdd} onFocused={focused}/>
  </main>
  {!selected&&<aside className="wf-context-rail wf-wait-rail"><div className="wf-wait-summary"><h2>대기 항목 요약</h2><div><span><small>확인 필요</small><strong>{all.ready.length}</strong></span><span><small>대기 중</small><strong>{all.waiting.length}</strong></span></div></div>
   <div className="wf-detail"><h2>대기와 보류의 차이</h2><p className="wf-muted"><strong>대기</strong>는 외부 결과·승인을 기다리는 작업 상태입니다. <strong>보류</strong>는 프로젝트를 잠시 추진하지 않기로 한 상태이며 이 화면의 대상이 아닙니다.</p><p className="wf-muted">재개하면 같은 작업이 할 일 또는 진행 중으로 돌아가고, 대기 이유와 확인 날짜는 기록으로 남습니다.</p></div></aside>}
  </div>
 </SplitView>;
}
