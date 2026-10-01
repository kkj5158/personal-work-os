'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {CalendarClock,Check,ChevronDown,ChevronRight,CircleCheck,Clock3,Hourglass,MoreHorizontal,Pencil,Play,Plus,RotateCcw,Search,Sun,Trash2,Undo2} from 'lucide-react';
import {workflowApi,type Project,type TaskReferenceResult,type WorkTask} from '@/lib/api/workflow';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import {shortDate} from '@/lib/workflow/labels';
import {WorkflowConflictError} from '@/lib/workflow/store';
import {isActiveProject,projectGroupSections,type ProjectGroupSection} from '@/lib/workflow/catalog';
import {AGENT_KEYS,AGENT_LABELS,CHECK_WHEN_LABELS,NO_PROJECT,agentOf,agentValue,completedWaiting,createPrefill,daysBetween,defaultCheckDate,emptyWaitingFilters,extendChoices,isNarrowed,
 matchesCheckWhen,matchesWaitingFilters,resumeStatus,searchProjectSections,toggleProject,toggleProjectGroup,waitingProjection,waitingSnapshot,waitingStats,type AgentKey,type CheckWhen,type WaitingFilters} from '@/lib/workflow/waiting';
import {useWorkflow} from './WorkflowContext';
import SplitView from './SplitView';

const today=()=>toDateKey(seoulToday());
const errorText=(e:unknown)=>e instanceof WorkflowConflictError?'다른 창에서 먼저 변경되어 최신 값으로 표시합니다.':e instanceof Error?e.message:'저장하지 못했습니다.';
const toggle=<T extends string>(list:T[],value:T)=>list.includes(value)?list.filter(item=>item!==value):[...list,value];

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

/** Check date: a small inline choice (오늘 / 내일 / 다음 주 / 날짜 없음 / 직접 날짜). No edit modal. */
function DatePicker({label,title,due,trigger,onPick}:{label:string;title:string;due?:boolean;trigger?:ReactNode;onPick:(date:string|null)=>void}){
 const [custom,setCustom]=useState('');
 return <Popover label={title} className="wf-wait-extend" trigger={(open,toggleOpen)=><button type="button" className={`wf-wait-date ${due?'is-due':''}`} aria-expanded={open} aria-label={label} onClick={toggleOpen}>{trigger}</button>}>
  {close=><>
   <span className="wf-wait-pop-title">확인 날짜</span>
   <span className="wf-wait-choices">{extendChoices(today()).map(choice=><button key={choice.key} type="button" onClick={()=>{close();onPick(choice.date);}}>{choice.label}</button>)}</span>
   <span className="wf-wait-custom"><input type="date" aria-label={`${title} 직접 선택`} value={custom} onChange={event=>setCustom(event.target.value)}/><button type="button" disabled={!custom} onClick={()=>{const date=custom;setCustom('');close();onPick(date);}}>적용</button></span>
  </>}
 </Popover>;
}

function AgentBadge({agent}:{agent:AgentKey}){return <span className={`wf-agent is-${agent.toLowerCase()}`}><span className="wf-agent-dot" aria-hidden/>{AGENT_LABELS[agent]}</span>;}
function AgentSelect({value,label,onChange}:{value:AgentKey;label:string;onChange:(next:AgentKey)=>void}){
 return <select aria-label={label} value={value} onChange={event=>onChange(event.target.value as AgentKey)}>{AGENT_KEYS.map(key=><option key={key} value={key}>{AGENT_LABELS[key]}</option>)}</select>;
}

type Table='ready'|'waiting';
type Info=(projectId:string|null)=>{project?:Project;group:string};
type Undo=()=>Promise<unknown>;

/** 그룹 → 프로젝트 cascading selection: the Project list is limited to the chosen group; '' = 프로젝트 없음. */
function GroupProjectSelect({sections,group,projectId,label,onChange}:{sections:ProjectGroupSection[];group:string;projectId:string;label:string;onChange:(group:string,projectId:string)=>void}){
 const projects=sections.find(section=>section.key===group)?.projects??[];
 // Changing the group resets a Project that does not belong to it; a group with one Project selects it.
 const pickGroup=(next:string)=>{const list=sections.find(section=>section.key===next)?.projects??[];onChange(next,list.some(project=>project.id===projectId)?projectId:list.length===1?list[0].id:'');};
 return <span className="wf-wait-gp">
  <select aria-label={`${label} 그룹`} value={group} onChange={event=>pickGroup(event.target.value)}><option value="">프로젝트 없음</option>{sections.map(section=><option key={section.key} value={section.key}>{section.name}</option>)}</select>
  <select aria-label={`${label} 프로젝트`} value={projectId} disabled={!group} onChange={event=>onChange(group,event.target.value)}><option value="">{group?'프로젝트 선택':'—'}</option>{projects.map(project=><option key={project.id} value={project.id}>{project.title}</option>)}</select>
 </span>;
}

/**
 * Inline add row (both active tables): 그룹 → 프로젝트 → 제목 → 담당 Agent → 대기 이유 → 결과가 오면 → 확인일 → 추가.
 * Only the title is required. The current Project filter prefills group / Project; after a create the text fields reset,
 * group / Project / Agent stay and focus returns to the title, so several items can be entered in a row.
 */
function AddWaitingRow({table,sections,prefill}:{table:Table;sections:ProjectGroupSection[];prefill:{group:string;projectId:string}}){
 const flow=useWorkflow();const titleRef=useRef<HTMLInputElement>(null);
 const [place,setPlace]=useState(prefill),[seen,setSeen]=useState(`${prefill.group}|${prefill.projectId}`);
 // A filter change re-applies the prefill (render-time sync, no effect): the user's typed text is kept.
 if(seen!==`${prefill.group}|${prefill.projectId}`){setSeen(`${prefill.group}|${prefill.projectId}`);setPlace(prefill);}
 const empty=()=>({title:'',reason:'',next:'',date:defaultCheckDate(table,today())});
 const [draft,setDraft]=useState(empty),[agent,setAgent]=useState<AgentKey>('UNASSIGNED'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const needsProject=!!place.group&&!place.projectId;
 async function submit(){
  const title=draft.title.trim();if(!title||busy||needsProject)return;setBusy(true);setError('');
  let createdId:string|null=null;
  try{
   // A Waiting item is an ordinary canonical Task that enters WAITING through the lifecycle command (history kept).
   const projectId=place.projectId||null,order=Math.max(-1,...flow.tasks.filter(task=>task.projectId===projectId&&!task.phaseId).map(task=>task.order))+1;
   const created=await flow.saveTask({title,projectId,phaseId:null,status:'TODO',priority:'NORMAL',startDate:null,dueDate:null,memo:null,order});createdId=created.id;
   await flow.setTaskStatus(created.id,{status:'WAITING',waitingReason:draft.reason.trim()||null,waitingNextAction:draft.next.trim()||null,waitingCheckDate:draft.date||null,waitingFlagged:false,waitingAgent:agentValue(agent)});
   setDraft(empty());
  }catch(e){setError(createdId?`작업은 만들었지만 대기로 바꾸지 못했습니다: ${errorText(e)}`:errorText(e));}
  finally{setBusy(false);titleRef.current?.focus();}
 }
 const label=table==='ready'?'확인할 일':'대기 작업';
 return <form className="wf-wait-row is-add" aria-label={`새 ${label} 추가`} onSubmit={event=>{event.preventDefault();void submit();}}>
  <span className="wf-wait-plus" aria-hidden><Plus size={13}/></span>
  <GroupProjectSelect sections={sections} group={place.group} projectId={place.projectId} label={`새 ${label}`} onChange={(group,projectId)=>setPlace({group,projectId})}/>
  <input ref={titleRef} aria-label={`새 ${label} 제목`} placeholder={`새 ${label} 제목 (Enter로 추가)`} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/>
  <AgentSelect value={agent} label={`새 ${label} 담당 Agent`} onChange={setAgent}/>
  <input aria-label={`새 ${label} 대기 이유`} placeholder="대기 이유 (선택)" value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/>
  <input aria-label={`새 ${label} 결과가 오면`} placeholder="결과가 오면 (선택)" value={draft.next} onChange={event=>setDraft({...draft,next:event.target.value})}/>
  <input type="date" aria-label={`새 ${label} 확인 날짜`} value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value})}/>
  <span className="wf-wait-actions"><button className="wf-primary" disabled={!draft.title.trim()||busy||needsProject} title={needsProject?'프로젝트를 선택하세요':undefined}>{busy?'추가 중…':'추가'}</button><button type="button" disabled={busy} onClick={()=>{setDraft(empty());setError('');}}>취소</button></span>
  {error&&<small role="alert" className="wf-row-error">{error}</small>}
 </form>;
}

type RowActions={resume:(task:WorkTask)=>void;addToday:(task:WorkTask)=>void;complete:(task:WorkTask)=>void;remove:(task:WorkTask)=>Promise<void>;patch:(task:WorkTask,patch:Partial<WorkTask>)=>Promise<unknown>};

/** ⋯ → 편집: the row becomes a compact inline form (no detail panel). Enter saves, Escape cancels. */
function EditRow({task,sections,info,onSave,onCancel}:{task:WorkTask;sections:ProjectGroupSection[];info:Info;onSave:(patch:Partial<WorkTask>)=>Promise<unknown>;onCancel:()=>void}){
 const group=sections.find(section=>section.projects.some(project=>project.id===task.projectId))?.key??'';
 const [place,setPlace]=useState({group,projectId:group?task.projectId??'':''});
 const [draft,setDraft]=useState({title:task.title,reason:task.waitingReason??'',next:task.waitingNextAction??'',date:task.waitingCheckDate??''}),[agent,setAgent]=useState(agentOf(task));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 // A Project that is not offered any more (archived) is kept unless the user picks another one.
 const hidden=!!task.projectId&&!group,invalid=!draft.title.trim()||(!!place.group&&!place.projectId);
 async function save(){
  if(invalid||busy)return;setBusy(true);setError('');
  const projectId=hidden&&!place.group?task.projectId:place.projectId||null,patch:Partial<WorkTask>={};
  if(draft.title.trim()!==task.title)patch.title=draft.title.trim();
  if(projectId!==task.projectId){patch.projectId=projectId;patch.phaseId=null;}
  if(agentValue(agent)!==(task.waitingAgent??null))patch.waitingAgent=agentValue(agent);
  if((draft.reason.trim()||null)!==(task.waitingReason??null))patch.waitingReason=draft.reason.trim()||null;
  if((draft.next.trim()||null)!==(task.waitingNextAction??null))patch.waitingNextAction=draft.next.trim()||null;
  if((draft.date||null)!==(task.waitingCheckDate??null))patch.waitingCheckDate=draft.date||null;
  try{if(Object.keys(patch).length)await onSave(patch);onCancel();}catch(e){setError(errorText(e));setBusy(false);}
 }
 return <form className="wf-wait-row is-edit" aria-label={`${task.title} 편집`} onSubmit={event=>{event.preventDefault();void save();}} onKeyDown={event=>{if(event.key==='Escape')onCancel();}}>
  <span className="wf-wait-plus" aria-hidden><Pencil size={12}/></span>
  <span className="wf-wait-gp-edit"><GroupProjectSelect sections={sections} group={place.group} projectId={place.projectId} label={`${task.title} 편집`} onChange={(next,projectId)=>setPlace({group:next,projectId})}/>{hidden&&!place.group&&<small className="wf-muted">현재: {info(task.projectId).project?.title??'보관된 프로젝트'}</small>}</span>
  <input autoFocus aria-label={`${task.title} 편집 제목`} value={draft.title} onChange={event=>setDraft({...draft,title:event.target.value})}/>
  <AgentSelect value={agent} label={`${task.title} 편집 담당 Agent`} onChange={setAgent}/>
  <input aria-label={`${task.title} 편집 대기 이유`} placeholder="대기 이유" value={draft.reason} onChange={event=>setDraft({...draft,reason:event.target.value})}/>
  <input aria-label={`${task.title} 편집 결과가 오면`} placeholder="결과가 오면" value={draft.next} onChange={event=>setDraft({...draft,next:event.target.value})}/>
  <input type="date" aria-label={`${task.title} 편집 확인 날짜`} value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value})}/>
  <span className="wf-wait-actions"><button className="wf-primary" disabled={invalid||busy}>{busy?'저장 중…':'저장'}</button><button type="button" disabled={busy} onClick={onCancel}>취소</button></span>
  {error&&<small role="alert" className="wf-row-error">{error}</small>}
 </form>;
}

function ProjectCell({projectId,info}:{projectId:string|null;info:Info}){
 const {project,group}=info(projectId);
 return <span className="wf-wait-project" title={project?`${group} / ${project.title}`:'프로젝트 없음'}><span className="wf-filter-dot" style={{background:project?.color||'#8c959f'}} aria-hidden/>
  <span className="wf-wait-project-text">{project?<><small>{group}{project.archivedAt?' · 보관됨':''}</small><strong>{project.title}</strong></>:<strong className="wf-muted">프로젝트 없음</strong>}</span></span>;
}

function WaitingRow({task,sections,info,checked,onCheck,actions}:{task:WorkTask;sections:ProjectGroupSection[];info:Info;checked:boolean;onCheck:()=>void;actions:RowActions}){
 const [editing,setEditing]=useState(false),[message,setMessage]=useState('');
 const patch=(change:Partial<WorkTask>)=>actions.patch(task,change).then(()=>setMessage(''),e=>{setMessage(errorText(e));throw e;});
 if(editing)return <EditRow task={task} sections={sections} info={info} onSave={change=>actions.patch(task,change)} onCancel={()=>setEditing(false)}/>;
 const due=!!task.waitingCheckDate&&task.waitingCheckDate<=today(),dateLabel=task.waitingCheckDate?shortDate(task.waitingCheckDate):'날짜 없음';
 return <div className={`wf-wait-row ${checked?'is-selected':''}`} data-task-id={task.id} role="row">
  <input type="checkbox" aria-label={`${task.title} 선택`} checked={checked} onChange={onCheck}/>
  <ProjectCell projectId={task.projectId} info={info}/>
  <span className="wf-wait-title"><span className="wf-wait-title-text">{task.title}</span>{message&&<small role="status" className="wf-row-error">{message}</small>}</span>
  <AgentBadge agent={agentOf(task)}/>
  <InlineText label={`${task.title} 대기 이유`} placeholder="대기 이유" value={task.waitingReason??''} onCommit={value=>patch({waitingReason:value})}/>
  <InlineText label={`${task.title} 결과가 오면`} placeholder="결과가 오면 할 일" value={task.waitingNextAction??''} onCommit={value=>patch({waitingNextAction:value})}/>
  <DatePicker title={`${task.title} 확인 날짜 변경`} label={`${task.title} 확인 날짜 ${dateLabel}`} due={due} trigger={<><CalendarClock size={12} aria-hidden/>{dateLabel}</>} onPick={date=>void patch({waitingCheckDate:date}).catch(()=>{})}/>
  <span className="wf-wait-actions">
   <button type="button" className="wf-wait-action" aria-label={`${task.title} 재개`} title="대기를 끝내고 원래 작업으로 되돌립니다 (오늘에는 추가하지 않음)" onClick={()=>actions.resume(task)}><Play size={12} aria-hidden/>재개</button>
   <button type="button" className="wf-wait-action" aria-label={`${task.title} 오늘에 추가`} title="재개하고 바로 오늘에 추가합니다" onClick={()=>actions.addToday(task)}><Sun size={12} aria-hidden/>오늘에 추가</button>
   <button type="button" className="wf-wait-action is-complete" aria-label={`${task.title} 완료`} title="활성 대기에서 빼고 완료 이력으로 보존합니다" onClick={()=>actions.complete(task)}><Check size={12} aria-hidden/>완료</button>
   <Popover label={`${task.title} 더보기`} className="wf-wait-more" trigger={(open,toggleOpen)=><button type="button" className="wf-wait-action is-more" aria-label={`${task.title} 더보기`} aria-expanded={open} onClick={toggleOpen}><MoreHorizontal size={14} aria-hidden/></button>}>
    {close=><RowMenu onEdit={()=>{close();setEditing(true);}} onDelete={()=>actions.remove(task).then(close,e=>setMessage(errorText(e)))}/>}
   </Popover>
  </span>
 </div>;
}

/** ⋯ menu: 편집 / 삭제 only. Delete is the one action that asks first. */
function RowMenu({onEdit,onDelete}:{onEdit:()=>void;onDelete:()=>void}){
 const [confirm,setConfirm]=useState(false);
 return confirm?<><span className="wf-wait-pop-title">이 항목을 삭제할까요? 완료와 달리 되돌릴 수 없습니다.</span><span className="wf-wait-choices"><button type="button" className="wf-danger-button" onClick={onDelete}>삭제</button><button type="button" onClick={()=>setConfirm(false)}>취소</button></span></>
  :<span className="wf-wait-menu"><button type="button" onClick={onEdit}><Pencil size={12} aria-hidden/>편집</button><button type="button" className="wf-danger-text" onClick={()=>setConfirm(true)}><Trash2 size={12} aria-hidden/>삭제</button></span>;
}

function WaitingTable({table,tasks,sections,createSections,info,prefill,selected,onSelect,actions}:{table:Table;tasks:WorkTask[];sections:ProjectGroupSection[];createSections:ProjectGroupSection[];info:Info;prefill:{group:string;projectId:string};
 selected:Set<string>;onSelect:(ids:string[],on:boolean)=>void;actions:RowActions}){
 const ready=table==='ready',name=ready?'확인할 때가 된 일':'대기 중',ids=tasks.map(task=>task.id),all=ids.length>0&&ids.every(id=>selected.has(id));
 return <section className={`wf-wait-section is-${table}`} aria-label={name}>
  <header><h2>{ready?<Clock3 size={18} aria-hidden/>:<Hourglass size={18} aria-hidden/>}{name} <span className="wf-count">{tasks.length}</span></h2>
   <p className="wf-muted">{ready?'확인 날짜가 오늘이거나 지난 대기 작업입니다. 별도 상태가 아니라 같은 대기 작업의 보기입니다.':'외부 결과·승인을 기다리는 작업입니다. 확인 날짜가 되면 위로 올라옵니다.'}</p></header>
  <div className="wf-wait-table" role="table" aria-label={`${name} 목록`}>
   <div className="wf-wait-row is-head" role="row"><input type="checkbox" aria-label={`${name} 전체 선택`} checked={all} disabled={!ids.length} onChange={()=>onSelect(ids,!all)}/><span>그룹 / 프로젝트</span><span>제목</span><span>담당 Agent</span><span>대기 이유</span><span>결과가 오면</span><span>{ready?'확인 예정':'다시 확인'}</span><span>작업</span></div>
   <AddWaitingRow table={table} sections={createSections} prefill={prefill}/>
   {tasks.map(task=><WaitingRow key={task.id} task={task} sections={sections} info={info} checked={selected.has(task.id)} onCheck={()=>onSelect([task.id],!selected.has(task.id))} actions={actions}/>)}
   {!tasks.length&&<p className="wf-muted wf-wait-empty">{ready?'지금 확인할 대기 작업이 없습니다.':'대기 중인 작업이 없습니다.'}</p>}
  </div>
 </section>;
}

/**
 * Grouped Project filter (103 §7): every Projects-page group is a visible row with its Project chips, in the saved
 * group / Project order. The search narrows the chips in place while every group row stays. Multi-select; 전체 and
 * individual selections are mutually exclusive; a group's 전체 selects that whole group.
 */
function ProjectFilterPanel({sections,selected,onChange,count,total}:{sections:ProjectGroupSection[];selected:string[];onChange:(next:string[])=>void;count:(id:string)=>number;total:number}){
 const [query,setQuery]=useState('');
 const shown=searchProjectSections(sections,query);
 return <section className="wf-wait-pfilter" role="group" aria-label="프로젝트 필터">
  <header><h2>프로젝트 필터</h2>
   <span className="wf-filter-buttons"><button type="button" aria-pressed={!selected.length} onClick={()=>onChange([])}>전체<small className="wf-pchip-count">{total}</small></button>
    <button type="button" aria-pressed={selected.includes(NO_PROJECT)} onClick={()=>onChange(toggleProject(selected,NO_PROJECT))}><span className="wf-filter-dot" style={{background:'#8c959f'}} aria-hidden/>프로젝트 없음<small className="wf-pchip-count">{count(NO_PROJECT)}</small></button></span>
   <label className="wf-wait-psearch"><Search size={13} aria-hidden/><input aria-label="프로젝트 검색" placeholder="프로젝트 검색… (한글/영문 모두 가능)" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <button type="button" className="wf-filter-reset" disabled={!selected.length&&!query} onClick={()=>{onChange([]);setQuery('');}}><RotateCcw size={12} aria-hidden/>선택 초기화</button>
  </header>
  {shown.map((section,index)=>{const ids=sections[index].projects.map(project=>project.id),whole=ids.length>0&&ids.every(id=>selected.includes(id));
   return <div key={section.key} className="wf-wait-pgroup" role="group" aria-label={`${section.name} 그룹`}>
    <span className="wf-wait-pgroup-name" title={section.name}><span>{section.name}</span><small className="wf-count">{ids.length}</small></span>
    <span className="wf-filter-buttons wf-wait-pgroup-chips">
     <button type="button" className="wf-wait-pgroup-all" aria-pressed={whole} aria-label={`${section.name} 그룹 전체`} onClick={()=>onChange(toggleProjectGroup(selected,ids))}>전체</button>
     {section.projects.map(project=><button key={project.id} type="button" className="wf-pchip" aria-pressed={selected.includes(project.id)} title={project.title} onClick={()=>onChange(toggleProject(selected,project.id))}>
      <span className="wf-filter-dot" style={{background:project.color||'#0969da'}} aria-hidden/><span className="wf-pchip-name">{project.title}</span><small className="wf-pchip-count">{count(project.id)}</small></button>)}
     {!section.projects.length&&<small className="wf-muted wf-wait-pgroup-empty">일치하는 프로젝트 없음</small>}
    </span>
   </div>;})}
  {!sections.length&&<p className="wf-muted wf-wait-empty">프로젝트가 없습니다. 프로젝트 없이도 대기 항목을 추가할 수 있습니다.</p>}
 </section>;
}

/** 직접 지정: one Asia/Seoul date key. The pressed chip shows it (직접 지정 · 10/03); 해제 removes it. */
function CustomDateFilter({date,onApply,onClear}:{date:string|null;onApply:(date:string)=>void;onClear:()=>void}){
 const [value,setValue]=useState(date??'');
 return <Popover label="직접 지정 확인 날짜" className="wf-wait-custom-date" trigger={(open,toggleOpen)=><button type="button" aria-pressed={!!date} aria-expanded={open} onClick={()=>{setValue(date??today());toggleOpen();}}><CalendarClock size={12} aria-hidden/>{date?`직접 지정 · ${shortDate(date)}`:'직접 지정'}</button>}>
  {close=><>
   <span className="wf-wait-pop-title">이 날짜에 확인할 항목만 보기</span>
   <span className="wf-wait-custom"><input type="date" aria-label="직접 지정 날짜" value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&value){event.preventDefault();close();onApply(value);}}}/>
    <button type="button" disabled={!value} onClick={()=>{close();onApply(value);}}>적용</button>
    {date&&<button type="button" onClick={()=>{close();onClear();}}>해제</button>}</span>
  </>}
 </Popover>;
}

/** Contextual bulk bar: only while rows are selected. Same immediate + Undo behaviour as the row actions. */
function BulkBar({count,onToday,onResume,onComplete,onAgent,onDate,onClear}:{count:number;onToday:()=>void;onResume:()=>void;onComplete:()=>void;onAgent:(agent:AgentKey)=>void;onDate:(date:string|null)=>void;onClear:()=>void}){
 return <div className="wf-wait-bulk" role="toolbar" aria-label="선택한 대기 항목 일괄 작업"><strong>{count}개 선택</strong>
  <button type="button" className="wf-wait-action" onClick={onToday}><Sun size={12} aria-hidden/>오늘에 추가</button>
  <button type="button" className="wf-wait-action" onClick={onResume}><Play size={12} aria-hidden/>재개</button>
  <button type="button" className="wf-wait-action is-complete" onClick={onComplete}><Check size={12} aria-hidden/>완료</button>
  <label className="wf-wait-bulk-field">Agent 변경<select aria-label="선택 항목 Agent 변경" value="" onChange={event=>{if(event.target.value)onAgent(event.target.value as AgentKey);}}><option value="">선택…</option>{AGENT_KEYS.map(key=><option key={key} value={key}>{AGENT_LABELS[key]}</option>)}</select></label>
  <DatePicker title="선택 항목 확인일 변경" label="선택 항목 확인일 변경" trigger={<><CalendarClock size={12} aria-hidden/>확인일 변경</>} onPick={onDate}/>
  <button type="button" className="wf-wait-bulk-clear" onClick={onClear}>선택 해제</button>
 </div>;
}

/**
 * Completed Waiting history: collapsed by default (완료 이력 N건 ›). 다시 대기하기 reactivates the same Task and asks for
 * a new check date or 날짜 없음 in a small popover; an already-expired date is never silently reused.
 */
function History({tasks,info,onReactivate}:{tasks:WorkTask[];info:Info;onReactivate:(task:WorkTask,date:string|null)=>void}){
 const [open,setOpen]=useState(false);
 return <section className="wf-wait-section is-history" aria-label="완료 이력">
  <button type="button" className="wf-wait-history-toggle" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><CircleCheck size={16} aria-hidden/>완료 이력 {tasks.length}건{open?<ChevronDown size={14} aria-hidden/>:<ChevronRight size={14} aria-hidden/>}</button>
  {open&&<><p className="wf-muted">완료한 대기 작업입니다. 삭제된 것이 아니며, 필요하면 같은 항목을 다시 대기 상태로 되돌릴 수 있습니다.</p>
   <div className="wf-wait-table is-history" role="table" aria-label="완료 이력 목록">
    <div className="wf-wait-row is-head" role="row"><span>완료일</span><span>그룹 / 프로젝트</span><span>제목</span><span>담당 Agent</span><span>대기 이유</span><span>결과가 오면</span><span>대기 기간</span><span>작업</span></div>
    {tasks.map(task=>{const days=daysBetween(task.waitingSince,task.waitingCompletedAt??'');
     return <div key={task.id} className="wf-wait-row" data-task-id={task.id} role="row">
      <span>{task.waitingCompletedAt?shortDate(toDateKey(new Date(task.waitingCompletedAt))):'—'}</span>
      <ProjectCell projectId={task.projectId} info={info}/>
      <span className="wf-wait-title"><span className="wf-wait-title-text">{task.title}</span></span>
      <AgentBadge agent={agentOf(task)}/>
      <span className="wf-wait-cell-text">{task.waitingReason||'—'}</span><span className="wf-wait-cell-text">{task.waitingNextAction||'—'}</span>
      <span>{days===null?'—':`${days}일`}</span>
      <Reactivate task={task} onPick={date=>onReactivate(task,date)}/>
     </div>;})}
    {!tasks.length&&<p className="wf-muted wf-wait-empty">완료한 대기 작업이 아직 없습니다.</p>}
   </div></>}
 </section>;
}
function Reactivate({task,onPick}:{task:WorkTask;onPick:(date:string|null)=>void}){
 const [date,setDate]=useState('');
 return <Popover label={`${task.title} 다시 대기하기`} className="wf-wait-reactivate" trigger={(open,toggleOpen)=><button type="button" className="wf-wait-action" aria-expanded={open} aria-label={`${task.title} 다시 대기하기`} onClick={toggleOpen}><RotateCcw size={12} aria-hidden/>다시 대기하기</button>}>
  {close=><>
   <span className="wf-wait-pop-title">같은 항목을 다시 대기합니다 · 새 확인일을 정하세요</span>
   <span className="wf-wait-custom"><input type="date" aria-label={`${task.title} 새 확인일`} value={date} min={today()} onChange={event=>setDate(event.target.value)}/><button type="button" className="wf-primary" disabled={!date} onClick={()=>{close();onPick(date);}}>이 날짜로</button></span>
   <span className="wf-wait-choices"><button type="button" onClick={()=>{close();onPick(null);}}>날짜 없음으로 다시 대기</button></span>
  </>}
 </Popover>;
}

/**
 * S08 Waiting / Check: a fast processing queue over canonical WAITING Tasks (no second Waiting entity).
 * Two date projections (확인할 때가 된 일 / 대기 중), grouped Project filter AND 확인 시점 AND 담당 Agent, inline create in both
 * tables, immediate row / bulk actions with Undo, collapsed completed history, and an active-Waiting summary on the right.
 */
export default function Waiting(){
 const flow=useWorkflow();
 const [filters,setFilters]=useState<WaitingFilters>(emptyWaitingFilters),[selected,setSelected]=useState<Set<string>>(new Set());
 const [notice,setNotice]=useState<{text:string;undo?:Undo}|null>(null),[working,setWorking]=useState(false);
 const day=today();
 const all=waitingProjection(flow.tasks,day),active=[...all.ready,...all.waiting],history=completedWaiting(flow.tasks);
 const owning=new Set([...active,...history].map(task=>task.projectId).filter((id):id is string=>!!id));
 // Filter and lookups: the Projects-page groups. Archived Projects appear only while they still own Waiting items.
 const sections=projectGroupSections(flow.projects,flow.groups,project=>!project.archivedAt||owning.has(project.id));
 const createSections=projectGroupSections(flow.projects,flow.groups,isActiveProject);
 const info:Info=projectId=>{const project=flow.projects.find(item=>item.id===projectId);return {project,group:sections.find(section=>section.projects.some(item=>item.id===projectId))?.name??'그룹 없음'};};
 const countOf=(id:string)=>active.filter(task=>(task.projectId??NO_PROJECT)===id).length;
 const matches=(task:WorkTask)=>matchesWaitingFilters(task,filters,day,info(task.projectId).project?.title??'');
 const view={ready:all.ready.filter(matches),waiting:all.waiting.filter(matches)};
 // 평균 / 최장 대기일 are whole days: the time this screen was opened is precise enough.
 const [now]=useState(()=>Date.now()),stats=waitingStats(all.ready,all.waiting,now);
 const prefill=createPrefill(filters.projects,createSections);
 const picked=active.filter(task=>selected.has(task.id));
 const select=(ids:string[],on:boolean)=>setSelected(current=>{const next=new Set(current);for(const id of ids){if(on)next.add(id);else next.delete(id);}return next;});

 /** Runs one routine action over Tasks immediately (no confirmation) and offers one Undo for everything that succeeded. */
 async function run(tasks:WorkTask[],done:(count:number)=>string,each:(task:WorkTask)=>Promise<Undo>){
  if(working||!tasks.length)return;setWorking(true);
  const undos:Undo[]=[];let failure='';
  for(const task of tasks){try{undos.push(await each(task));}catch(e){failure=errorText(e);break;}}
  setWorking(false);setSelected(new Set());
  if(!undos.length){setNotice({text:failure||'변경하지 못했습니다.'});return;}
  setNotice({text:done(undos.length)+(failure?` · 일부는 실패했습니다: ${failure}`:''),undo:async()=>{for(const undo of undos.reverse())await undo();}});
 }
 const label=(tasks:WorkTask[])=>tasks.length===1?`‘${tasks[0].title}’`:`${tasks.length}개 항목`;
 // 재개 = end Waiting, back to active work (not added to Today). Undo returns the same Task to the same Waiting state.
 const resumeOne=async(task:WorkTask):Promise<Undo>=>{const snapshot=waitingSnapshot(task);await flow.setTaskStatus(task.id,{status:resumeStatus(task)});return()=>flow.setTaskStatus(task.id,snapshot);};
 // 오늘에 추가 = resume + Add to Today (the canonical command keeps its duplicate prevention). Undo removes only what this added.
 const todayOne=async(task:WorkTask):Promise<Undo>=>{
  const snapshot=waitingSnapshot(task);await flow.setTaskStatus(task.id,{status:resumeStatus(task)});
  let added:TaskReferenceResult;try{added=await flow.addToToday(task.id);}catch(e){await flow.setTaskStatus(task.id,snapshot).catch(()=>{});throw e;}
  return async()=>{
   if(added.created){const latest=await workflowApi.getDay(added.day.date);await workflowApi.saveDay(latest.date,{revision:latest.revision,blocks:latest.blocks.filter(block=>block.id!==added.blockId)});}
   if(added.planDayCreated)await flow.removePlanDay(task.id,added.day.date);
   await flow.setTaskStatus(task.id,snapshot);
  };
 };
 // 완료 = leave the active queue, stay in completed Waiting history (not a delete).
 const completeOne=async(task:WorkTask):Promise<Undo>=>{const snapshot=waitingSnapshot(task);await flow.setTaskStatus(task.id,{status:'DONE',completeWaiting:true});return()=>flow.setTaskStatus(task.id,snapshot);};
 const patchOne=(change:Partial<WorkTask>)=>async(task:WorkTask):Promise<Undo>=>{
  const before=Object.fromEntries(Object.keys(change).map(key=>[key,(task as unknown as Record<string,unknown>)[key]??null])) as Partial<WorkTask>;
  await flow.updateTask(task.id,change);return()=>flow.updateTask(task.id,before);
 };
 const actions:RowActions={
  resume:task=>void run([task],()=>`${label([task])}을(를) 재개했습니다.`,resumeOne),
  addToday:task=>void run([task],()=>`${label([task])}을(를) 재개하고 오늘에 추가했습니다.`,todayOne),
  complete:task=>void run([task],()=>`${label([task])}을(를) 완료했습니다 · 완료 이력에 보존됩니다.`,completeOne),
  remove:async task=>{await flow.deleteTask(task.id);setNotice({text:`‘${task.title}’을(를) 삭제했습니다.`});},
  patch:(task,change)=>flow.updateTask(task.id,change),
 };
 // 다시 대기하기: the same Task, a new check date (or none). The old date is cleared first so it is never reused silently.
 const reactivate=(task:WorkTask,date:string|null)=>void run([task],()=>`‘${task.title}’을(를) 다시 대기 상태로 되돌렸습니다${date?` · ${shortDate(date)} 확인`:' · 날짜 없음'}.`,async item=>{
  const previous=item.waitingCheckDate??null;
  await flow.updateTask(item.id,{waitingCheckDate:date});await flow.setTaskStatus(item.id,{status:'WAITING',waitingCheckDate:date});
  return async()=>{await flow.setTaskStatus(item.id,{status:'DONE',completeWaiting:true});await flow.updateTask(item.id,{waitingCheckDate:previous});};
 });
 async function undo(){
  if(!notice?.undo||working)return;setWorking(true);
  try{await notice.undo();setNotice({text:'되돌렸습니다.'});}catch(e){setNotice({text:`되돌리지 못했습니다: ${errorText(e)}`});}
  finally{setWorking(false);await flow.refresh().catch(()=>{});}
 }
 const whenCount=(value:CheckWhen)=>active.filter(task=>matchesCheckWhen(task,[value],day,filters.customDate)).length;
 const narrowed=isNarrowed(filters);
 return <SplitView detail={null}>
  <div className="wf-wait-layout"><main className="wf-wait-main">
   <header className="wf-page-heading"><div><h1>대기 / 확인할 일</h1><p className="wf-muted">지금 바로 처리할 수는 없지만 다시 돌아와야 하는 대기 작업만 모아 봅니다.</p></div>
    <input className="wf-wait-search" aria-label="대기 작업 검색" placeholder="제목, 프로젝트, 내용으로 검색…" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})}/></header>
   <ProjectFilterPanel sections={sections} selected={filters.projects} onChange={projects=>setFilters({...filters,projects})} count={countOf} total={active.length}/>
   <section className="wf-explorer-filters" aria-label="대기 필터">
    <div className="wf-filter-row" role="group" aria-label="확인 시점 필터"><span className="wf-filter-label">확인 시점</span><div className="wf-filter-buttons">
     <button type="button" aria-pressed={!filters.when.length} onClick={()=>setFilters({...filters,when:[],customDate:null})}>전체</button>
     {(Object.keys(CHECK_WHEN_LABELS) as (keyof typeof CHECK_WHEN_LABELS)[]).map(value=><button key={value} type="button" aria-pressed={filters.when.includes(value)} onClick={()=>setFilters({...filters,when:toggle(filters.when,value)})}>{CHECK_WHEN_LABELS[value]}<small className="wf-pchip-count">{whenCount(value)}</small></button>)}
     <CustomDateFilter date={filters.when.includes('CUSTOM')?filters.customDate:null} onApply={date=>setFilters(current=>({...current,customDate:date,when:current.when.includes('CUSTOM')?current.when:[...current.when,'CUSTOM']}))} onClear={()=>setFilters(current=>({...current,customDate:null,when:current.when.filter(item=>item!=='CUSTOM')}))}/>
    </div></div>
    <div className="wf-filter-row" role="group" aria-label="담당 Agent 필터"><span className="wf-filter-label">담당 Agent</span><div className="wf-filter-buttons">
     <button type="button" aria-pressed={!filters.agents.length} onClick={()=>setFilters({...filters,agents:[]})}>전체</button>
     {AGENT_KEYS.map(key=><button key={key} type="button" aria-pressed={filters.agents.includes(key)} onClick={()=>setFilters({...filters,agents:toggle(filters.agents,key)})}><span className={`wf-agent-dot is-${key.toLowerCase()}`} aria-hidden/>{AGENT_LABELS[key]}<small className="wf-pchip-count">{stats.agents[key]}</small></button>)}
     {narrowed&&<button type="button" className="wf-filter-reset" onClick={()=>setFilters(emptyWaitingFilters())}><RotateCcw size={12} aria-hidden/>필터 초기화</button>}
    </div></div>
   </section>
   {notice&&<p className="wf-wait-notice" role="status"><span>{notice.text}</span>{notice.undo&&<button type="button" className="wf-wait-undo" disabled={working} onClick={()=>void undo()}><Undo2 size={12} aria-hidden/>실행 취소</button>}<button type="button" aria-label="알림 닫기" onClick={()=>setNotice(null)}>×</button></p>}
   {picked.length>0&&<BulkBar count={picked.length} onClear={()=>setSelected(new Set())}
    onToday={()=>void run(picked,count=>`${count}개 항목을 재개하고 오늘에 추가했습니다.`,todayOne)} onResume={()=>void run(picked,count=>`${count}개 항목을 재개했습니다.`,resumeOne)}
    onComplete={()=>void run(picked,count=>`${count}개 항목을 완료했습니다 · 완료 이력에 보존됩니다.`,completeOne)}
    onAgent={agent=>void run(picked,count=>`${count}개 항목의 담당 Agent를 ${AGENT_LABELS[agent]}(으)로 바꿨습니다.`,patchOne({waitingAgent:agentValue(agent)}))}
    onDate={date=>void run(picked,count=>`${count}개 항목의 확인일을 ${date?shortDate(date):'날짜 없음'}(으)로 바꿨습니다.`,patchOne({waitingCheckDate:date}))}/>}
   <WaitingTable table="ready" tasks={view.ready} sections={sections} createSections={createSections} info={info} prefill={prefill} selected={selected} onSelect={select} actions={actions}/>
   <WaitingTable table="waiting" tasks={view.waiting} sections={sections} createSections={createSections} info={info} prefill={prefill} selected={selected} onSelect={select} actions={actions}/>
   <History tasks={history} info={info} onReactivate={reactivate}/>
  </main>
  <aside className="wf-context-rail wf-wait-rail">
   <section className="wf-wait-card" aria-label="담당 Agent 현황"><header><h2>담당 Agent 현황</h2><small>활성 {stats.total}</small></header>
    {AGENT_KEYS.map(key=><button key={key} type="button" className="wf-wait-agent-row" aria-pressed={filters.agents.length===1&&filters.agents[0]===key} aria-label={`${AGENT_LABELS[key]} ${stats.agents[key]}건 필터`}
     onClick={()=>setFilters({...filters,agents:filters.agents.length===1&&filters.agents[0]===key?[]:[key]})}><AgentBadge agent={key}/><span className="wf-count">{stats.agents[key]}</span></button>)}</section>
   <section className="wf-wait-card" aria-label="활성 대기 통계"><header><h2>대기 작업 통계</h2><small>완료 이력 제외</small></header>
    <div className="wf-wait-stats"><span className="is-ready"><strong>{stats.ready}</strong><small>확인할 때가 된 일</small></span><span><strong>{stats.waiting}</strong><small>대기 중</small></span><span><strong>{stats.noDate}</strong><small>날짜 없음</small></span></div>
    <div className="wf-wait-stats is-days"><span><small>평균 대기일</small><strong>{stats.averageDays===null?'—':`${stats.averageDays}일`}</strong></span><span><small>최장 대기일</small><strong>{stats.longestDays===null?'—':`${stats.longestDays}일`}</strong></span></div></section>
  </aside>
  </div>
 </SplitView>;
}
