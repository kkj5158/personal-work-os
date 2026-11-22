"use client";
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/api/client';
import type {AttentionDevice} from '@/lib/api/attention';
type Scope={scopeId:string;credentialId:string};
const path='/api/workflow/attention/browser-scopes';
export function BrowserConsent({devices}:{devices:AttentionDevice[]}){
  const [scopes,setScopes]=useState<Scope[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const abort=new AbortController();apiClient.get<Scope[]>(path,abort.signal).then(rows=>{if(!abort.signal.aborted)setScopes(rows);}).catch(()=>{});return ()=>abort.abort();},[]);
  async function update(id:string,revoke:boolean){
    setBusy(true);setError('');
    try{if(revoke)await apiClient.delete(path+'/'+id);else await apiClient.post(path+'/'+id,{});
      setScopes(await apiClient.get<Scope[]>(path));
    }catch{setError('동의 상태를 변경하지 못했습니다. 연결을 확인하세요.');}finally{setBusy(false);}
  }
  return <details><summary>ChatGPT 새 요청·답변 자동 발췌</summary><p>승인할 기기를 선택한 뒤 범위 코드를 해당 Chrome 프로필의 작업큐 확장에 입력하세요. 새 요청은 최대 2,048자, 답변은 최대 6,144자까지 기록합니다.</p>
    {devices.filter(d=>d.kind==='DEVICE'&&!d.revokedAt).map(d=><div key={d.id}>
      {scopes.some(s=>s.credentialId===d.id)?scopes.filter(s=>s.credentialId===d.id).map(s=><p key={s.scopeId}>{d.name} <code>{s.scopeId}</code> <button disabled={busy} onClick={()=>void update(s.scopeId,true)}>승인 해제</button></p>):
      <button disabled={busy} onClick={()=>void update(d.id,false)}>{d.name} 발췌 승인</button>}</div>)}{error&&<p role="alert">{error}</p>}</details>;
}
