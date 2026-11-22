"use client";
import {useEffect,useRef,useState} from 'react';
import {attentionApi,type AttentionCredential,type AttentionDevice} from '@/lib/api/attention';
import {BrowserConsent} from './BrowserConsent';
import {DesktopCaptureConsent} from './DesktopCaptureConsent';
import {createSupabaseBrowserClient} from '@/lib/supabase/client';
const namespaces={'codex-local':'Codex 로컬','claude-local':'Claude Code 로컬','team-kafka':'TEAM KAFKA'};
const expired=(d:AttentionDevice)=>!d.revokedAt&&!!d.expiresAt&&Date.parse(d.expiresAt)<=Date.now();
export default function AttentionConnections(){
 const [devices,setDevices]=useState<AttentionDevice[]>([]),[namespace,setNamespace]=useState<keyof typeof namespaces|'windows'>('codex-local'),[credential,setCredential]=useState<AttentionCredential|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[manage,setManage]=useState<string|null>(null);
 const generation=useRef(0),pending=useRef(false),owner=useRef<string|null|undefined>(undefined);
 async function refresh(epoch=generation.current){setLoading(true);setError('');try{const result=await attentionApi.devices();if(epoch===generation.current)setDevices(result);}catch{if(epoch===generation.current)setError('연결 목록을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.');}finally{if(epoch===generation.current)setLoading(false);}}
 useEffect(()=>{
  const clear=()=>{generation.current++;pending.current=false;setBusy(false);setCredential(null);setManage(null);setNotice('');};
  const changed=(next:string|null)=>{if(owner.current===next)return;owner.current=next;clear();setDevices([]);setError('');if(next!==null)queueMicrotask(()=>void refresh(generation.current));else setLoading(false);};
  const client=createSupabaseBrowserClient();const subscription=client?.auth.onAuthStateChange((_event,session)=>changed(session?.user.id??null)).data.subscription;
  if(!client)changed('local-dev');
  const hidden=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',hidden);
  return()=>{generation.current++;subscription?.unsubscribe();document.removeEventListener('visibilitychange',hidden);};
 },[]);
 async function action(work:()=>Promise<unknown>,message:string){
  if(pending.current)return;pending.current=true;setBusy(true);setCredential(null);setError('');setNotice('');const epoch=generation.current;
  try{const result=await work();if(epoch!==generation.current)return;if(result&&typeof result==='object'&&'token' in result)setCredential(result as AttentionCredential);setManage(null);setNotice(message);await refresh(epoch);}catch{if(epoch===generation.current)setError('요청을 처리하지 못했습니다. 로그인과 최신 연결 상태를 확인해 주세요.');}finally{if(epoch===generation.current){pending.current=false;setBusy(false);}}
 }
 async function copy(){if(!credential)return;const epoch=generation.current;try{await navigator.clipboard.writeText(credential.token);if(epoch===generation.current)setNotice('키를 복사했어요. 에이전트의 비공개 환경 설정에 저장해 주세요.');}catch{if(epoch===generation.current)setError('복사하지 못했습니다. 키 입력란에서 직접 복사해 주세요.');}}
 const active=devices.filter(d=>!d.revokedAt&&!expired(d)),repair=devices.filter(expired),revoked=devices.filter(d=>!!d.revokedAt);
 function row(d:AttentionDevice){return <li className="aq-connection" key={d.id}><div className="aq-connection-head"><span className="aq-connection-glyph" aria-hidden>{d.kind==='DEVICE'?'⊞':d.namespace==='team-kafka'?'K':'C'}</span><div><strong>{d.name}</strong><small>{d.kind==='DEVICE'?'Windows 앱':d.namespace}</small></div><span className={'aq-connection-state '+(expired(d)?'repair':'')}>{expired(d)?'재연결 필요':'인증 유효'}</span></div><div className="aq-connection-meta"><small>{d.lastUsedAt?`마지막 요청: ${new Date(d.lastUsedAt).toLocaleString('ko-KR')}`:'마지막 요청 기록 없음'}</small><button disabled={busy} onClick={()=>{setCredential(null);setManage(manage===d.id?null:d.id);}}>{expired(d)?d.kind==='DEVICE'?'재연결':'복구':'관리'}</button></div>{manage===d.id&&<div className="aq-connection-action">{d.kind==='DEVICE'&&expired(d)?<p>Windows 앱이 저장된 만료일을 검사하므로 앱에서 연결을 다시 시작해 주세요. 같은 설치를 페어링하면 이전 키는 해제됩니다.</p>:!d.persistent&&<><p>기존 키를 안전하게 보관한 경우 직접 해제할 때까지 인증을 유지할 수 있습니다. 분실·노출이 의심되면 복구하지 말고 해제 후 새 키를 발급하세요.</p><button disabled={busy} onClick={()=>void action(()=>attentionApi.restore(d.id),'기존 키의 인증을 유지하도록 변경했어요.')}>{expired(d)?'기존 키 보관 확인 · 복구':'영구 연결로 전환'}</button></>}<p>연결을 해제하면 이 키의 접근이 즉시 차단됩니다. 해제한 키는 복구할 수 없습니다.</p><button className="aq-danger" disabled={busy} onClick={()=>void action(()=>attentionApi.revoke(d.id),'연결을 해제했어요.')}>이 연결 해제</button><button disabled={busy} onClick={()=>setManage(null)}>취소</button></div>}</li>;}
 return <section className="aq-connections" aria-label="WORK QUEUE 연결 관리"><h3>연결 관리</h3><p>새 연결은 직접 해제할 때까지 인증이 유지됩니다. 기기의 온라인 상태를 뜻하지 않습니다.</p><div className="aq-connection-counts"><div><b>{active.length}</b>사용 가능</div><div><b>{repair.length}</b>재연결 필요</div><div><b>{revoked.length}</b>해제 기록</div></div><button disabled={busy||loading} onClick={()=>void refresh()}>연결 목록 새로고침</button>{loading&&<p role="status">연결 목록을 불러오는 중…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!loading&&!error&&devices.length===0&&<p>등록된 연결이 없습니다. 아래에서 새 연결을 추가하세요.</p>}<ul className="aq-connection-list">{active.map(row)}{repair.map(row)}</ul>
 <BrowserConsent devices={devices}/>
 {devices.some(device=>device.kind==='DEVICE')&&<DesktopCaptureConsent key={devices.map(device=>device.id).join(',')} devices={devices}/>}
 <h3>새 연결</h3><div className="aq-new-connections">{Object.entries({...namespaces,windows:'Windows 앱 연결 안내'}).map(([value,label])=><button key={value} aria-pressed={namespace===value} disabled={busy} onClick={()=>{setNamespace(value as typeof namespace);setCredential(null);setNotice('');}}>{label}</button>)}</div>
 {namespace==='windows'?<p className="aq-connection-action">Windows 앱에서 연결을 시작하고 기존 POS 계정으로 승인하세요. 웹에서 기기 키를 직접 만들지 않습니다. 기존 설치 프로그램은 이번 릴리스에서 변경하지 않습니다.</p>:<div className="aq-connection-action"><p>에이전트 키는 이 계정의 항목 추가와 자신의 출처 해결 신호에만 사용됩니다. 발급한 키는 한 번만 표시됩니다.</p><button disabled={busy} onClick={()=>void action(()=>attentionApi.producer(namespaces[namespace],namespace),'새 키를 발급했어요.')}>{busy?'처리 중…':'새 에이전트 키 발급'}</button></div>}
 {credential&&<div className="aq-issued-key"><p>지금 한 번만 표시됩니다. 비공개 환경 설정에 저장한 뒤 닫아 주세요.</p><label>발급한 에이전트 키<input aria-label="발급한 에이전트 키" readOnly value={credential.token} spellCheck={false} autoComplete="off"/></label><div><button onClick={()=>void copy()}>키 복사</button><button onClick={()=>setCredential(null)}>키 표시 닫기</button></div></div>}
 <details className="aq-connection-history"><summary>해제된 연결 기록 ({revoked.length})</summary><ul>{revoked.map(d=><li key={d.id}>{d.name} · {d.kind==='DEVICE'?'Windows 앱':d.namespace} <span>연결 해제됨 · 복구 불가</span></li>)}</ul></details><p className="aq-connection-tip">마지막 요청은 인증 사용 시 최대 5분 간격으로 기록합니다. 기존 키는 다시 표시할 수 없습니다. 키를 교체하려면 새 키 발급 → 클라이언트 설정 교체 → 이전 연결 해제 순서로 진행하세요.</p></section>;
}
