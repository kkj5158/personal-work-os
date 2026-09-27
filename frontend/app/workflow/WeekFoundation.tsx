'use client';
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {workflowApi,type WeekView} from '@/lib/api/workflow';
import {addDaysKey} from '@/lib/workflow/store';
import {shortDate,TASK_STATUS_LABELS} from '@/lib/workflow/labels';
import {useWorkflow} from './WorkflowContext';
import {useTaskSelection} from './useTaskSelection';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';

/**
 * This Week foundation: the week projection (explicit selection ∪ plan days) over the canonical Tasks, with the
 * shared S10 detail. The full plan list / weekday board (S04/S05) arrives in the next batch.
 */
export default function WeekFoundation(){
 const flow=useWorkflow();const [selected,select]=useTaskSelection();
 const [weekStart,setWeekStart]=useState(flow.weekStart),[view,setView]=useState<WeekView|null>(null),[error,setError]=useState('');
 const current=weekStart===flow.weekStart?flow.week:view;
 const {ensureWeek}=flow;
 useEffect(()=>{
  let live=true;
  if(weekStart===flow.weekStart){void ensureWeek();return;}
  workflowApi.week(weekStart).then(v=>{if(live){setView(v);setError('');}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'이번 주를 불러오지 못했습니다.');});
  return()=>{live=false;};
 },[weekStart,flow.weekStart,ensureWeek]);
 const rows=(current?.tasks??[]).map(item=>({item,task:flow.tasks.find(t=>t.id===item.taskId)})).filter(row=>row.task);
 return <SplitView detail={selected?<TaskDetailPanel key={selected} taskId={selected} onClose={()=>select(null)} onSelect={select}/>:null}>
  <section className="wf-foundation">
   <header><h1>이번 주</h1>
    <button aria-label="이전 주" onClick={()=>setWeekStart(addDaysKey(weekStart,-7))}><ChevronLeft size={15}/></button>
    <strong>{shortDate(weekStart)} – {shortDate(addDaysKey(weekStart,6))}</strong>
    <button aria-label="다음 주" onClick={()=>setWeekStart(addDaysKey(weekStart,7))}><ChevronRight size={15}/></button>
    {weekStart!==flow.weekStart&&<button onClick={()=>setWeekStart(flow.weekStart)}>이번 주</button>}
   </header>
   <p className="wf-foundation-note">이번 주에 집중 선택한 작업과 이번 주에 날짜를 배치한 작업을 함께 보여줍니다. 프로젝트별 계획 목록과 요일 보드는 다음 단계에서 제공됩니다.</p>
   {error&&<p className="wf-error" role="alert">{error}</p>}
   {rows.length?<ul className="wf-foundation-list">{rows.map(({item,task})=><li key={item.taskId}>
    <button className={selected===item.taskId?'selected':''} onClick={()=>select(item.taskId)}>
     <span><strong>{task!.title}</strong> <small>{flow.projects.find(p=>p.id===task!.projectId)?.title??'프로젝트 없음'} · {TASK_STATUS_LABELS[task!.status]}</small></span>
     <small>{item.selected?'집중 선택':'날짜 배치'}</small>
     <small>{item.plannedDates.length?item.plannedDates.map(shortDate).join(', '):'날짜 미정'}</small>
    </button></li>)}</ul>
   :<p className="wf-muted">{current?'이번 주에 선택하거나 배치한 작업이 없습니다. 작업 상세에서 "이번 주 포함"을 켜거나 계획 날짜를 추가하세요.':'불러오는 중…'}</p>}
  </section>
 </SplitView>;
}
