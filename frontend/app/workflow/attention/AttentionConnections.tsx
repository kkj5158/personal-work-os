"use client";
import {useEffect,useRef,useState} from 'react';
import {attentionApi,type AttentionCredential,type AttentionDevice} from '@/lib/api/attention';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';

const namespaces={'codex-local':'Codex 로컬','claude-local':'Claude Code 로컬','team-kafka':'TEAM KAFKA'};
export default function AttentionConnections(){
 const [devices,setDevices]=useState<AttentionDevice[]>([]),[namespace,setNamespace]=useState<keyof typeof namespaces>('codex-local'),[credential,setCredential]=useState<AttentionCredential|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revokeId,setRevokeId]=useState<string|null>(null);
 const generation=useRef(0),pending=useRef(false),owner=useRef<string|null|undefined>(undefined);
 async function refresh(epoch=generation.current){try{const result=await attentionApi.devices();if(epoch===generation.current)setDevices(result);}catch{if(epoch===generation.current)setError('연결 목록을 불러오지 못했습니다.');}}
 useEffect(()=>{
  const clear=()=>{generation.current++;pending.current=false;setBusy(false);setCredential(null);setRevokeId(null);setNotice('');};
  const changed=(next:string|null)=>{if(owner.current===next)return;owner.current=next;clear();setDevices([]);setError('');if(next!==null)queueMicrotask(()=>void refresh(generation.current));};
  const client=createSupabaseBrowserClient();
  const subscription=client?.auth.onAuthStateChange((_event,session)=>changed(session?.user.id??null)).data.subscription;
  if(!client){changed('local-dev');}
  const hidden=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',hidden);
  return()=>{generation.current++;subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);};
 },[]);
 async function issue(){
  if(pending.current)return;pending.current=true;setBusy(true);setCredential(null);setError('');setNotice('');const epoch=generation.current;
  try{const result=await attentionApi.producer(namespaces[namespace],namespace);if(epoch!==generation.current)return;setCredential(result);void refresh(epoch);}catch{if(epoch===generation.current)setError('키를 발급하지 못했습니다. 로그인과 연결 상태를 확인해 주세요.');}finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
 }
 async function revoke(id:string){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');const epoch=generation.current;
  try{await attentionApi.revoke(id);if(epoch!==generation.current)return;if(credential?.credentialId===id)setCredential(null);setRevokeId(null);setNotice('연결을 해제했어요.');await refresh(epoch);}catch{if(epoch===generation.current)setError('연결을 해제하지 못했습니다. 다시 확인해 주세요.');}finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
 }
 async function copy(){const epoch=generation.current;try{await navigator.clipboard.writeText(credential!.token);if(epoch===generation.current)setNotice('키를 복사했어요. 해당 에이전트의 비공개 환경 설정에 저장해 주세요.');}catch{if(epoch===generation.current)setError('복사하지 못했습니다. 키 입력란에서 직접 복사해 주세요.');}}
 return <section className="aq-connections" aria-label="WORK QUEUE 연결 관리"><h2>기기와 에이전트 연결</h2><p>에이전트 키는 이 계정의 확인 항목 추가와 자신의 출처 해결 신호에만 사용됩니다. 확인 완료와 원본 작업 변경 권한은 없습니다.</p>
  <div className="aq-connection-controls"><label>연결할 에이전트<select value={namespace} disabled={busy} onChange={event=>{setNamespace(event.target.value as keyof typeof namespaces);setCredential(null);setNotice('');}}>{Object.entries(namespaces).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button disabled={busy} onClick={()=>void issue()}>{busy?'처리 중…':'새 에이전트 키 발급'}</button></div>
  {credential&&<div className="aq-issued-key"><p>이 키는 지금 한 번만 표시됩니다. 비공개 환경 설정에 저장한 뒤 닫아 주세요.</p><label>발급한 에이전트 키<input aria-label="발급한 에이전트 키" readOnly value={credential.token} spellCheck={false} autoComplete="off"/></label><div><button onClick={()=>void copy()}>키 복사</button><button onClick={()=>setCredential(null)}>키 표시 닫기</button></div></div>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <ul>{devices.map(device=><li key={device.id}><span>{device.name} · {device.kind==='DEVICE'?'Windows 앱':device.namespace} · {device.revokedAt?'해제됨':Date.parse(device.expiresAt)<=Date.now()?'만료됨':`만료 ${new Date(device.expiresAt).toLocaleDateString('ko-KR')}`}</span>{!device.revokedAt&&(revokeId===device.id?<span><button disabled={busy} onClick={()=>void revoke(device.id)}>이 연결 해제</button><button disabled={busy} onClick={()=>setRevokeId(null)}>취소</button></span>:<button disabled={busy} onClick={()=>setRevokeId(device.id)}>연결 해제…</button>)}</li>)}</ul>
  <button disabled={busy} onClick={()=>void refresh()}>연결 목록 새로고침</button>
 </section>;
}
