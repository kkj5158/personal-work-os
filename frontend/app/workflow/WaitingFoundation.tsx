'use client';
import {useEffect,useState} from 'react';
import {workflowApi,type WaitingView,type WorkTask} from '@/lib/api/workflow';
import {shortDate} from '@/lib/workflow/labels';
import {useWorkflow} from './WorkflowContext';
import {useTaskSelection} from './useTaskSelection';
import SplitView from './SplitView';
import TaskDetailPanel from './TaskDetailPanel';

/**
 * Waiting foundation: WAITING Tasks split into the "ready to check" projection and the rest. "Ready to check" is
 * not a status. The full S08 screen (inline add rows, resume/extend controls) arrives in a later batch.
 */
export default function WaitingFoundation(){
 const flow=useWorkflow();const [selected,select]=useTaskSelection();
 const [view,setView]=useState<WaitingView|null>(null),[error,setError]=useState('');
 // Re-query whenever the canonical tasks change (status edits in the detail panel or another window).
 useEffect(()=>{
  let live=true;
  workflowApi.waiting().then(v=>{if(live){setView(v);setError('');}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'대기 목록을 불러오지 못했습니다.');});
  return()=>{live=false;};
 },[flow.tasks]);
 const list=(tasks:WorkTask[])=>tasks.length?<ul className="wf-foundation-list">{tasks.map(task=><li key={task.id}>
  <button className={selected===task.id?'selected':''} onClick={()=>select(task.id)}>
   <span><strong>{task.title}</strong> <small>{flow.projects.find(p=>p.id===task.projectId)?.title??'프로젝트 없음'}{task.waitingReason?` · ${task.waitingReason}`:''}</small></span>
   <small>{task.waitingNextAction??''}</small>
   <small>{task.waitingCheckDate?`${shortDate(task.waitingCheckDate)} 확인`:'확인일 없음'}</small>
  </button></li>)}</ul>:<p className="wf-muted">없음</p>;
 return <SplitView detail={selected?<TaskDetailPanel key={selected} taskId={selected} onClose={()=>select(null)} onSelect={select}/>:null}>
  <section className="wf-foundation">
   <header><h1>대기 / 확인할 일</h1></header>
   <p className="wf-foundation-note">대기 상태의 작업만 보여줍니다. 확인 날짜가 되었거나 직접 표시한 작업은 &lsquo;확인할 때가 된 일&rsquo;에 올라옵니다. 인라인 추가와 재개·연장 조작은 다음 단계에서 제공됩니다.</p>
   {error&&<p className="wf-error" role="alert">{error}</p>}
   <h2>확인할 때가 된 일 {view?.readyToCheck.length??''}</h2>{view?list(view.readyToCheck):<p className="wf-muted">불러오는 중…</p>}
   <h2>대기 중 {view?.waiting.length??''}</h2>{view?list(view.waiting):null}
  </section>
 </SplitView>;
}
