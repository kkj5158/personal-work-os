"use client";
import {useRef,useState} from 'react';
import {attentionApi,type AttentionItem} from '@/lib/api/attention';
import {ApiError} from '@/lib/api/client';
type Plan={candidateCount:number;previewId:string;fingerprint:string;requestId:string;restore:boolean};

export default function CompletedCleanup({items,disabled,onChange}:{items:AttentionItem[];disabled:boolean;onChange:()=>void}){
  const [selected,setSelected]=useState<string[]>([]),[plan,setPlan]=useState<Plan|null>(null),[batch,setBatch]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const running=useRef(false);
  const targets=items.filter(i=>i.status==='COMPLETED'&&selected.includes(i.id)).map(i=>i.id);
  async function preview(ids?:string[],undoBatch?:string){
    if(running.current)return;
    running.current=true;setBusy(true);setMessage('');setPlan(null);
    try{
      const {data}=await attentionApi.previewCompleted({requestId:crypto.randomUUID(),ids,undoBatch});
      if(!data.candidateCount || (ids&&ids.length!==data.candidateCount)){setMessage('대상 목록이 바뀌었거나 비어 있습니다. 다시 확인하세요.');onChange();return;}
      setPlan({...data,requestId:crypto.randomUUID(),restore:!!undoBatch});
    }catch{setMessage('미리보기를 불러오지 못했습니다. 선택 범위를 확인하세요.');}
    finally{running.current=false;setBusy(false);}
  }
  async function execute(){
    if(!plan||running.current)return;
    running.current=true;setBusy(true);
    try{
      const {data}=await attentionApi.executeCompleted({requestId:plan.requestId,previewId:plan.previewId,fingerprint:plan.fingerprint,confirmed:true});
      setMessage(data.appliedCount+'개 '+(plan.restore?'복원했습니다.':'숨겼습니다.'));setBatch(plan.restore?'':data.restorationBatchId);
      setPlan(null);setSelected([]);onChange();
    }catch(e){
      if(e instanceof ApiError&&e.status===409){setPlan(null);setMessage('대상이 변경되었습니다. 미리보기를 다시 확인하세요.');onChange();}
      else setMessage('결과를 확인할 수 없습니다. 같은 요청을 다시 시도하세요.');
    }finally{running.current=false;setBusy(false);}
  }
  return <div data-no-drag><details><summary>완료 카드 삭제</summary>
    <fieldset disabled={disabled||busy||!!plan}>{items.filter(i=>i.status==='COMPLETED').map(item=><div key={item.id}><label>
      <input type="checkbox" checked={selected.includes(item.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,item.id]:prev.filter(id=>id!==item.id))}/>{item.action}</label>
      <button onClick={()=>void preview([item.id])}>이 카드 삭제</button></div>)}
      <button disabled={!targets.length} onClick={()=>void preview(targets)}>선택 {targets.length}개 삭제</button>
      <button onClick={()=>void preview()}>필터와 관계없이 모든 완료 카드 삭제</button></fieldset></details>
    {plan&&<div role="group" aria-label="대상 확인"><p>{plan.candidateCount}개를 {plan.restore?'원래 상태로 복원':'숨김 기록으로 이동'}합니다.</p>
      <button disabled={busy} onClick={()=>setPlan(null)}>취소</button> <button disabled={disabled||busy} onClick={()=>void execute()}>{plan.restore?'복원 확인':'삭제 확인'}</button></div>}
    {message&&<p role="status">{message}</p>}{batch&&!plan&&<button disabled={disabled||busy} onClick={()=>void preview(undefined,batch)}>방금 삭제 되돌리기</button>}
  </div>;
}
