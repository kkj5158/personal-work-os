'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {workflowApi,type Project,type Phase,type WorkTask,type EntityInput,type PlanDay,type StatusChange,type TaskReferenceResult,type WeekView,type TaskPatch,type ProjectPatch,type PhasePatch} from '@/lib/api/workflow';
import { seoulToday } from '@/lib/seoulDate';
import { toDateKey } from '@/lib/date';
import { publishEntityChange, subscribeEntityChanges, getWindowInstanceId } from '@/lib/windowSync';
import {applyOverlays,canRebase,emptyData,isConflict,mondayOf,normalize,removeEntity,replaceEntity,setTaskPlanDays,WorkflowConflictError,type EntityKind,type Overlay,type StoreData} from '@/lib/workflow/store';

type ContextValue=StoreData & {loading:boolean;error:string;refresh:()=>Promise<void>;
 saveProject:(v:EntityInput<Project>)=>Promise<Project>;savePhase:(v:EntityInput<Phase>)=>Promise<Phase>;saveTask:(v:EntityInput<WorkTask>)=>Promise<WorkTask>;
 updateProject:(id:string,patch:Partial<Project>)=>Promise<Project>;updatePhase:(id:string,patch:Partial<Phase>)=>Promise<Phase>;updateTask:(id:string,patch:Partial<WorkTask>)=>Promise<WorkTask>;
 setTaskStatus:(id:string,change:StatusChange)=>Promise<WorkTask>;archiveTask:(id:string,archived:boolean)=>Promise<WorkTask>;duplicateTask:(id:string)=>Promise<WorkTask>;
 deleteProject:(id:string)=>Promise<void>;deletePhase:(id:string)=>Promise<void>;deleteTask:(id:string)=>Promise<void>;
 addToToday:(id:string)=>Promise<TaskReferenceResult>;continueTask:(id:string,date:string)=>Promise<TaskReferenceResult>;
 addPlanDay:(id:string,date:string)=>Promise<PlanDay[]>;removePlanDay:(id:string,date:string)=>Promise<PlanDay[]>;
 weekStart:string;week:WeekView|null;ensureWeek:()=>Promise<WeekView|null>;setWeekSelection:(taskId:string,selected:boolean)=>Promise<WeekView>};
const Context=createContext<ContextValue|null>(null);
export function useWorkflow(){const value=useContext(Context);if(!value)throw new Error('WORK FLOW provider is missing');return value;}

const TASK_FIELDS=['title','projectId','phaseId','priority','startDate','dueDate','deadlineDate','memo','nextStep','order','waitingReason','waitingNextAction','waitingCheckDate','waitingFlagged'] as const;
const PROJECT_FIELDS=['title','status','projectType','goal','startDate','endDate','color','memo','order','nextTaskId','unassignedWeight'] as const;
const PHASE_FIELDS=['title','status','startDate','endDate','memo','order','weight','progressOverride'] as const;
function pick(source:object,fields:readonly string[]){const values=source as Record<string,unknown>,out:Record<string,unknown>={};for(const key of fields)if(key in values)out[key]=values[key];return out;}
const today=()=>toDateKey(seoulToday());

/**
 * Normalized WORK FLOW store. Edits are applied optimistically as overlays over the last server-confirmed
 * data, sent as revision-checked field patches, and replaced by the server's entity (no full reload). A 409 is
 * retried once on the latest revision only when another window did not touch the edited fields; otherwise the
 * overlay is dropped and a WorkflowConflictError lets the editor keep its draft. Committed changes are announced
 * to other windows, which refresh while keeping their own pending overlays.
 */
export function WorkflowProvider({children}:{children:ReactNode}){
 const confirmed=useRef<StoreData>(emptyData()),overlays=useRef<Overlay[]>([]),seq=useRef(0);
 const [data,setData]=useState<StoreData>(emptyData());
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [week,setWeek]=useState<WeekView|null>(null);const weekRef=useRef<WeekView|null>(null);
 const weekStart=mondayOf(today());
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const render=useCallback(()=>setData(applyOverlays(confirmed.current,overlays.current)),[]);
 const acceptWeek=useCallback((next:WeekView)=>{weekRef.current=next;setWeek(next);return next;},[]);
 const loadWeek=useCallback(async()=>acceptWeek(await workflowApi.week(mondayOf(today()))),[acceptWeek]);
 const refresh=useCallback(async()=>{
  try{const next=await workflowApi.get();confirmed.current=normalize(next);render();setError('');}
  catch(e){setError(e instanceof Error?e.message:'WORK FLOW를 불러오지 못했습니다.');throw e;}
  finally{setLoading(false);}
  if(weekRef.current)await loadWeek().catch(()=>{});
 },[render,loadWeek]);
 // Stable and idempotent: loads the current week once (per Monday) no matter how many panels ask.
 const weekLoad=useRef<{week:string;promise:Promise<WeekView|null>}|null>(null);
 const ensureWeek=useCallback(()=>{
  const current=mondayOf(today());
  if(weekLoad.current?.week!==current)weekLoad.current={week:current,promise:loadWeek().catch(()=>null)};
  return weekLoad.current.promise;
 },[loadWeek]);
 const announce=useCallback(()=>publishEntityChange({entityType:'workflow',entityId:'data',revision:Date.now()}),[]);
 function enqueue<T>(operation:()=>Promise<T>):Promise<T>{const result=queue.current.then(operation);queue.current=result.catch(()=>{});return result;}
 function failed(e:unknown):never{if(!(e instanceof WorkflowConflictError))setError(e instanceof Error?e.message:'저장하지 못했습니다.');throw e;}

 // Refresh after focus and after other windows commit WORK FLOW or Workpad changes; pending overlays survive.
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const later=()=>{clearTimeout(timer);timer=setTimeout(()=>{void queue.current.then(()=>refresh()).catch(()=>{});},150);};
  // refresh updates state only after the network request settles.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  void refresh().catch(()=>{});
  const unsubscribe=subscribeEntityChanges(event=>{if(event.windowInstanceId!==getWindowInstanceId()&&(event.entityType==='workflow'||event.entityType==='workpad'))later();});
  window.addEventListener('focus',later);
  return()=>{clearTimeout(timer);unsubscribe();window.removeEventListener('focus',later);};
 },[refresh]);

 function find(kind:EntityKind,id:string){return (confirmed.current[kind] as {id:string}[]).find(item=>item.id===id) as (Project|Phase|WorkTask)|undefined;}
 function send(kind:EntityKind,id:string,revision:number,patch:Record<string,unknown>){
  return kind==='tasks'?workflowApi.patchTask(id,revision,patch as TaskPatch):kind==='projects'?workflowApi.patchProject(id,revision,patch as ProjectPatch):workflowApi.patchPhase(id,revision,patch as PhasePatch);
 }
 /** Shared revisioned write: optimistic overlay → request → (409: three-way rebase or conflict) → confirmed entity. */
 function revisioned<T extends Project|Phase|WorkTask>(kind:EntityKind,id:string,overlay:Record<string,unknown>,request:(revision:number)=>Promise<T>):Promise<T>{
  const token=++seq.current;overlays.current=[...overlays.current,{token,kind,id,patch:overlay}];render();
  return enqueue(async()=>{
   try{
    const base=find(kind,id);if(!base)throw new Error('항목을 찾을 수 없습니다.');
    let saved:T;
    try{saved=await request(base.revision??0);}
    catch(e){
     if(!isConflict(e))throw e;
     confirmed.current=normalize(await workflowApi.get());
     const latest=find(kind,id);
     if(!latest)throw new WorkflowConflictError('다른 창에서 삭제된 항목입니다.');
     if(!canRebase(base as unknown as Record<string,unknown>,latest as unknown as Record<string,unknown>,overlay))throw new WorkflowConflictError(undefined,latest);
     saved=await request(latest.revision??0);
    }
    confirmed.current=replaceEntity(confirmed.current,kind,saved as never);announce();return saved;
   }catch(e){return failed(e);}
   finally{overlays.current=overlays.current.filter(item=>item.token!==token);render();}
  });
 }
 function patchEntity<T extends Project|Phase|WorkTask>(kind:EntityKind,id:string,patch:Record<string,unknown>):Promise<T>{
  if(!Object.keys(patch).length){const current=find(kind,id);return current?Promise.resolve(current as T):Promise.reject(new Error('항목을 찾을 수 없습니다.'));}
  return revisioned<T>(kind,id,patch,revision=>send(kind,id,revision,patch) as Promise<T>);
 }
 function setTaskStatus(id:string,change:StatusChange){
  const overlay:Record<string,unknown>={...change};
  return revisioned<WorkTask>('tasks',id,overlay,revision=>workflowApi.changeStatus(id,revision,change));
 }
 async function updateTask(id:string,patch:Partial<WorkTask>){
  const fields=pick(patch,TASK_FIELDS);
  let result:WorkTask|undefined;
  if(Object.keys(fields).length)result=await patchEntity<WorkTask>('tasks',id,fields);
  if(patch.status&&patch.status!==(find('tasks',id) as WorkTask|undefined)?.status)result=await setTaskStatus(id,{status:patch.status});
  return result??(find('tasks',id) as WorkTask);
 }
 function create<T extends Project|Phase|WorkTask>(kind:EntityKind,request:()=>Promise<T>):Promise<T>{
  return enqueue(async()=>{try{const saved=await request();confirmed.current=replaceEntity(confirmed.current,kind,saved as never);render();announce();return saved;}catch(e){return failed(e);}});
 }
 function remove(kind:EntityKind,request:()=>Promise<void>,id:string):Promise<void>{
  return enqueue(async()=>{try{await request();confirmed.current=removeEntity(confirmed.current,kind,id);render();announce();}catch(e){failed(e);}});
 }
 function reference(id:string,date:string,request:()=>Promise<TaskReferenceResult>){
  return enqueue(async()=>{
   try{
    const result=await request();
    if(!confirmed.current.planDays.some(day=>day.taskId===id&&day.date===date))confirmed.current=setTaskPlanDays(confirmed.current,id,[...confirmed.current.planDays.filter(day=>day.taskId===id),{taskId:id,date,order:0}]);
    render();
    // Open Workpad editors pick up the new reference through their own revision channel.
    if(result?.day)publishEntityChange({entityType:'workpad',entityId:result.day.date,revision:result.day.revision});
    announce();if(weekRef.current&&mondayOf(date)===weekRef.current.weekStart)await loadWeek().catch(()=>{});
    return result;
   }catch(e){return failed(e);}
  });
 }
 function planDays(id:string,request:()=>Promise<PlanDay[]>){
  return enqueue(async()=>{try{const days=await request();confirmed.current=setTaskPlanDays(confirmed.current,id,days);render();announce();if(weekRef.current)await loadWeek().catch(()=>{});return days;}catch(e){return failed(e);}});
 }
 const value:ContextValue={...data,loading,error,refresh,weekStart,week,
  saveProject:v=>v.id?patchEntity<Project>('projects',v.id,pick(v,PROJECT_FIELDS)):create('projects',()=>workflowApi.saveProject(v)),
  savePhase:v=>v.id?patchEntity<Phase>('phases',v.id,pick(v,PHASE_FIELDS)):create('phases',()=>workflowApi.savePhase(v)),
  saveTask:v=>v.id?updateTask(v.id,v):create('tasks',()=>workflowApi.saveTask(v)),
  updateProject:(id,patch)=>patchEntity<Project>('projects',id,pick(patch,PROJECT_FIELDS)),
  updatePhase:(id,patch)=>patchEntity<Phase>('phases',id,pick(patch,PHASE_FIELDS)),
  updateTask,setTaskStatus,
  archiveTask:(id,archived)=>revisioned<WorkTask>('tasks',id,{archivedAt:archived?new Date().toISOString():null},revision=>workflowApi.archiveTask(id,revision,archived)),
  duplicateTask:id=>create('tasks',()=>workflowApi.duplicateTask(id)),
  deleteProject:id=>remove('projects',()=>workflowApi.deleteProject(id),id),deletePhase:id=>remove('phases',()=>workflowApi.deletePhase(id),id),deleteTask:id=>remove('tasks',()=>workflowApi.deleteTask(id),id),
  addToToday:id=>{const date=today();return reference(id,date,()=>workflowApi.addToToday(id,date));},
  continueTask:(id,date)=>reference(id,date,()=>workflowApi.continueTask(id,date)),
  addPlanDay:(id,date)=>planDays(id,()=>workflowApi.addPlanDay(id,date)),
  removePlanDay:(id,date)=>planDays(id,()=>workflowApi.removePlanDay(id,date)),
  ensureWeek,
  setWeekSelection:(taskId,selected)=>enqueue(async()=>{try{const week=mondayOf(today());const next=acceptWeek(await (selected?workflowApi.selectTask(week,taskId):workflowApi.unselectTask(week,taskId)));announce();return next;}catch(e){return failed(e);}}),
 };
 return <Context.Provider value={value}>{error&&<div className="wf-error" role="alert">{error}<button onClick={()=>void refresh().catch(()=>{})}>다시 시도</button></div>}{children}</Context.Provider>;
}
