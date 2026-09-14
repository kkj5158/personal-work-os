'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {workflowApi,type WorkflowData,type Project,type Phase,type WorkTask,type EntityInput} from '@/lib/api/workflow';
import { seoulToday } from '@/lib/seoulDate';
import { toDateKey } from '@/lib/date';

type ContextValue=WorkflowData & {loading:boolean;error:string;refresh:()=>Promise<void>;saveProject:(v:EntityInput<Project>)=>Promise<Project>;savePhase:(v:EntityInput<Phase>)=>Promise<Phase>;saveTask:(v:EntityInput<WorkTask>)=>Promise<WorkTask>;updateProject:(id:string,patch:Partial<Project>)=>Promise<Project>;updatePhase:(id:string,patch:Partial<Phase>)=>Promise<Phase>;updateTask:(id:string,patch:Partial<WorkTask>)=>Promise<WorkTask>;deleteProject:(id:string)=>Promise<void>;deletePhase:(id:string)=>Promise<void>;deleteTask:(id:string)=>Promise<void>;addToToday:(id:string)=>Promise<void>};
const Context=createContext<ContextValue|null>(null);
export function useWorkflow(){const value=useContext(Context);if(!value)throw new Error('WORK FLOW provider is missing');return value;}
export function WorkflowProvider({children}:{children:ReactNode}){
 const [data,setData]=useState<WorkflowData>({projects:[],phases:[],tasks:[]});
 const current=useRef(data); const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const refresh=useCallback(async()=>{try{const next=await workflowApi.get();current.current=next;setData(next);setError('');}catch(e){setError(e instanceof Error?e.message:'WORK FLOW를 불러오지 못했습니다.');throw e;}finally{setLoading(false);}},[]);
 // refresh updates state only after the network request settles.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void refresh().catch(()=>{});const focus=()=>{void refresh().catch(()=>{});};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 function mutate<T>(operation:()=>Promise<T>):Promise<T>{
  const result=queue.current.then(async()=>{try{const result=await operation();await refresh();return result;}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');throw e;}});
  queue.current=result.catch(()=>{});return result;
 }
 const value:ContextValue={...data,loading,error,refresh,
 saveProject:v=>mutate(()=>workflowApi.saveProject(v)),savePhase:v=>mutate(()=>workflowApi.savePhase(v)),saveTask:v=>mutate(()=>workflowApi.saveTask(v)),
 updateProject:(id,patch)=>mutate(()=>{const entity=current.current.projects.find(t=>t.id===id);if(!entity)throw new Error('프로젝트를 찾을 수 없습니다.');return workflowApi.saveProject({...entity,...patch,id});}),
 updatePhase:(id,patch)=>mutate(()=>{const entity=current.current.phases.find(t=>t.id===id);if(!entity)throw new Error('Phase를 찾을 수 없습니다.');return workflowApi.savePhase({...entity,...patch,id});}),
 updateTask:(id,patch)=>mutate(()=>{const entity=current.current.tasks.find(t=>t.id===id);if(!entity)throw new Error('작업을 찾을 수 없습니다.');return workflowApi.saveTask({...entity,...patch,id});}),
 deleteProject:id=>mutate(()=>workflowApi.deleteProject(id)),deletePhase:id=>mutate(()=>workflowApi.deletePhase(id)),deleteTask:id=>mutate(()=>workflowApi.deleteTask(id)),
 addToToday:async id=>{await mutate(()=>workflowApi.addToToday(id,toDateKey(seoulToday())));},};
 return <Context.Provider value={value}>{error&&<div className="wf-error" role="alert">{error}<button onClick={()=>void refresh().catch(()=>{})}>다시 시도</button></div>}{children}</Context.Provider>;
}
