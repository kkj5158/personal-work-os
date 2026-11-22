"use client";
import {useEffect,useRef,useState} from 'react';
import {moneyApi as api,type Account,type Category,seoul} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {categoryIndex} from '@/lib/money/categories';
import {useMoneyCache,useMoneyRows,useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData,LoadState} from './MoneyWebData';
type Context={version:number;loanId:string|null;loanVersion:number|null};
type Cancelled={id:string;cancellationId:string;version:number;title:string;memo:string|null;type:string;amount:number;currency:string;occurredAt:string;cancelledAt:string;categoryId:string|null;fromAccountId:string|null;toAccountId:string|null;evidence:{transaction:{sources:unknown[]}}};
type Impact={canDelete:boolean;reason:string|null;amount:number;currency:string;version:number;sourceCount:number};
type RegistrationCommand={requestId:string;expectedVersion:number;cancellationId:string|null;expectedLoanVersion:number|null;simpleDelete?:boolean};
type RegistrationResult={transaction:{version:number};cancellationId:string;message?:string};
type RegistrationOutcome={status:'APPLIED'|'NOT_APPLIED'|'UNKNOWN';result?:RegistrationResult};
type Requests=Record<string,{id:string;command:RegistrationCommand}>;
function useRegistrationRequests(){
 const owner=useMoneyCache().preferenceOwner,storageKey='registration-requests:'+owner;
 const [requests,setRequests]=useMoneyViewState<Requests>('registration-requests',()=>{
  try{return JSON.parse(window.sessionStorage.getItem(storageKey)??'{}') as Requests;}catch{return {};}
 });
 function update(key:string,id:string,command:RegistrationCommand|null){
  let stored:Requests={};
  try{stored=JSON.parse(window.sessionStorage.getItem(storageKey)??'{}');}catch{/* Storage can be unavailable. */}
  const change=(old:Requests)=>{const next={...old};if(command)next[key]={id,command};else delete next[key];return next;};
  const next=change(stored);
  try{if(Object.keys(next).length)window.sessionStorage.setItem(storageKey,JSON.stringify(next));else window.sessionStorage.removeItem(storageKey);}catch{/* Keep recovery available for this open session. */}
  setRequests(change);
 }
 return {requests,update};
}
export function RegistrationAction({id,version,cancellationId,onApplied}:{id:string;version:number;cancellationId?:string;onApplied?:()=>void}){
 const [,setRecent]=useMoneyViewState<{id:string;version:number;cancellationId:string}|null>('registration-undo',()=>null);
 const {requests,update}=useRegistrationRequests(),key=id+':'+(cancellationId??'cancel');
 const pending=requests[key]?.command??null;
 const setPending=(command:RegistrationCommand|null)=>update(key,id,command);
 const [impact,setImpact]=useState<Impact|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const cache=useMoneyCache(),coordinator=useMoneyRows(),guard=useRef(false);
 async function act(){
  if(guard.current)return;
  guard.current=true;setBusy(true);setError('');
  try{
   const path='/registration/'+id+(cancellationId?'/restore':'/cancel');
   let command=pending;
   let outcome:RegistrationOutcome|undefined;
   if(command)outcome=await api.get<RegistrationOutcome>('/ai/classification/outcomes/'+command.requestId);
   else{
    await coordinator.flush([id]);
    if(!cancellationId&&!impact){
     const preview=await api.get<Impact>('/registration/'+id+'/impact');
     setImpact(preview);return;
    }
    if(!cancellationId&&(!impact?.canDelete||impact.version!==version)){
     setImpact(null);cache.mutate('transaction');throw Error('거래가 변경되었습니다. 최신 거래의 삭제 영향을 다시 확인하세요.');
    }
    const context=cancellationId?await api.get<Context>('/registration/'+id+'/context'):null;
    command={requestId:crypto.randomUUID(),expectedVersion:impact?.version??version,cancellationId:cancellationId??null,expectedLoanVersion:context?.loanVersion??null,...(!cancellationId&&{simpleDelete:true})};
    setPending(command);
   }
   if(!outcome||outcome.status==='UNKNOWN'){
    try{outcome=await api.post<RegistrationOutcome>(path,command);}
    catch{outcome=await api.get<RegistrationOutcome>('/ai/classification/outcomes/'+command.requestId);}
   }
   if(outcome.status==='UNKNOWN')throw Error('처리 결과 확인 필요 · 같은 요청으로 다시 확인하세요.');
   setPending(null);setImpact(null);
   if(outcome.status!=='APPLIED'||!outcome.result?.transaction){cache.mutate('transaction');throw Error(outcome.result?.message??'거래 상태가 바뀌어 적용되지 않았습니다.');}
   if(cancellationId)setRecent(null);
   else setRecent({id,version:outcome.result.transaction.version,cancellationId:outcome.result.cancellationId});
   cache.mutate('transaction');cache.invalidate(key=>key.startsWith('/registration/'));onApplied?.();
  }catch(e){setError(e instanceof Error?e.message:'원래 등록 변경 결과를 확인해 주세요.');}
  finally{guard.current=false;setBusy(false);}
 }
 return <div className="money-registration-action">
  {(!impact||pending)&&<button type="button" disabled={busy} onClick={()=>void act()}>{busy?'확인 중…':pending?'원래 요청 확인·재시도':cancellationId?'복원':'삭제'}</button>}
  {impact&&!pending&&<div role="region" aria-label="거래 삭제 영향"><strong>{moneyAmount(impact.amount,impact.currency)}</strong>
   <p>{impact.canDelete?'거래 집계에서 제외됩니다. 취소 내역에서 같은 거래를 복원할 수 있습니다.':impact.reason}</p>
   <small>원본 {impact.sourceCount}건과 감사 이력을 보존합니다.</small>
   {impact.canDelete&&<button type="button" disabled={busy} onClick={()=>void act()}>삭제 확인</button>}
   <button type="button" disabled={busy} onClick={()=>setImpact(null)}>닫기</button></div>}
  {error&&<small role="alert">{error}</small>}
 </div>;
}
export function RegistrationUndoNotice(){
 const [recent,setRecent]=useMoneyViewState<{id:string;version:number;cancellationId:string}|null>('registration-undo',()=>null);
 const {requests}=useRegistrationRequests();
 return <>{Object.entries(requests).map(([key,{id,command}])=><div key={key} role="status" className="money-toolbar">
  {command.cancellationId?'복원':'삭제'} 요청 결과 확인 <RegistrationAction id={id} version={command.expectedVersion} cancellationId={command.cancellationId??undefined}/>
 </div>)}{recent&&<div role="status" className="money-toolbar">거래를 삭제했습니다. 원본과 이력을 보존했습니다. <RegistrationAction {...recent}/><button onClick={()=>setRecent(null)}>닫기</button></div>}</>;
}
function OriginalNotification({id}:{id:string}){const raw=useMoneyData<{title:string|null;text:string|null;bigText:string|null;postedAt:string}>('/notifications/'+id);return <><LoadState error={raw.error} loading={raw.loading}/>{raw.data&&<p>{raw.data.title}<small>{seoul(raw.data.postedAt)}</small>{raw.data.bigText||raw.data.text}</p>}</>;}
function RegistrationHistory({id,categories}:{id:string;categories:Category[]}){
 const source=useMoneyData<{amount:number;currency:string;memo:string|null;sources:{rawEventId:string;evidence?:{rule?:string}}[]}>('/transactions/'+id),classification=useMoneyData<{items:{id:string;categoryId:string|null;createdAt:string;reason:string;active:boolean;sourceKind:string;status:string}[]}>('/ai/classification/history?transactionId='+id),operations=useMoneyData<{items:{id:string;kind:string;createdAt:string}[]}>('/registration/'+id+'/history'),[original,setOriginal]=useState('');
 const recommendations=useMoneyData<{items:{revision:number;categoryId:string|null;result:{reason?:string};disposition:string}[]}>('/ai/classification/recommendations/history/'+id);const index=categoryIndex(categories);
 return <><LoadState error={source.error||classification.error||operations.error} loading={source.loading||classification.loading||operations.loading}/><section aria-label="보존된 원본"><strong>원본·금융 출처</strong>{source.data&&<p>{moneyAmount(source.data.amount,source.data.currency)}<small>{source.data.memo}</small></p>}{source.data?.sources.length===0&&<p>사용자 직접 등록 · 원문 알림 없음</p>}{source.data?.sources.map((s,i)=><div key={s.rawEventId}><button onClick={()=>setOriginal(original===s.rawEventId?'':s.rawEventId)}>원본 알림 {i+1}{s.evidence?.rule==='OWNER_ASSERTED_REVIEW'?' · 사용자 금융 판단':''}</button>{original===s.rawEventId&&<OriginalNotification id={s.rawEventId}/>}</div>)}</section><section aria-label="보존된 분류 이력"><strong>분류 이력</strong>{classification.data?.items.map(e=><p key={e.id}>{seoul(e.createdAt)} · {e.categoryId?index.path(e.categoryId):'미분류'} · {e.reason}{e.sourceKind==='EVENT'&&!e.active?' · 실행 취소됨':e.sourceKind==='JOB'?' · 적용 보호 또는 실패':''}</p>)}</section><section aria-label="보존된 미확정 추천 이력"><strong>미확정 추천 이력</strong>{recommendations.data?.items.map(r=><p key={r.revision}>추천 후보 {r.revision} · {r.categoryId?index.path(r.categoryId):"분류 불가"} · {r.result.reason}</p>)}</section><section aria-label="등록 취소·복원 이력"><strong>취소·복원 이력</strong>{operations.data?.items.map(e=><p key={e.id}>{seoul(e.createdAt)} · {e.kind==='REGISTRATION_CANCELLED'?'등록 취소':'등록 복원'}</p>)}</section></>;
}
export function CancellationHistory({accounts,categories}:{accounts:Account[];categories:Category[]}){
 const [search,setSearch]=useMoneyViewState('registration-search',()=>''),[query,setQuery]=useState(search),[from,setFrom]=useMoneyViewState('registration-from',()=>''),[to,setTo]=useMoneyViewState('registration-to',()=>''),[account,setAccount]=useMoneyViewState('registration-account',()=>''),[category,setCategory]=useMoneyViewState('registration-category',()=>''),[offset,setOffset]=useState(0),[expanded,setExpanded]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setOffset(0);},250);return()=>clearTimeout(timer);},[search]);
 const params=new URLSearchParams({search:query,offset:String(offset)});if(from)params.set('from',from);if(to)params.set('to',to);if(account)params.set('accountId',account);if(category)params.set('categoryId',category);
 const result=useMoneyData<{items:Cancelled[];total:number}>('/registration/cancelled?'+params),index=categoryIndex(categories);
 return <section aria-label="등록 취소 내역"><div className="money-toolbar"><input aria-label="취소 내역 검색" placeholder="제목·메모·거래처 검색" value={search} onChange={e=>setSearch(e.target.value)}/><label>거래일 시작<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setOffset(0);}}/></label><label>거래일 끝<input type="date" value={to} onChange={e=>{setTo(e.target.value);setOffset(0);}}/></label><select aria-label="취소 내역 계좌" value={account} onChange={e=>{setAccount(e.target.value);setOffset(0);}}><option value="">모든 계좌</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName}</option>)}</select><select aria-label="취소 내역 분류" value={category} onChange={e=>{setCategory(e.target.value);setOffset(0);}}><option value="">모든 분류</option>{categories.map(c=><option key={c.id} value={c.id}>{index.path(c.id)}</option>)}</select></div><LoadState error={result.error} loading={result.loading}/><div className="money-table-wrap"><table className="money-table money-book-ledger"><thead><tr><th>거래일</th><th>거래·제목</th><th>계좌</th><th>금액</th><th>보존 분류</th><th>취소 시각</th><th>출처·이력</th><th>복원</th></tr></thead><tbody>{result.data?.items.map(row=><tr key={row.cancellationId}><td>{seoul(row.occurredAt)}</td><td>{row.title}<small>{row.memo}</small></td><td>{accounts.find(a=>a.id===(row.fromAccountId??row.toAccountId))?.displayName}{row.type==='TRANSFER'&&<small>→ {accounts.find(a=>a.id===row.toAccountId)?.displayName}</small>}</td><td>{moneyAmount(row.amount,row.currency)}</td><td>{row.categoryId?index.path(row.categoryId):'미분류'}</td><td>{seoul(row.cancelledAt)}</td><td><button aria-expanded={expanded===row.id} onClick={()=>setExpanded(expanded===row.id?'':row.id)}>원본·분류·취소 이력</button>{expanded===row.id&&<RegistrationHistory id={row.id} categories={categories}/>}</td><td><RegistrationAction id={row.id} version={row.version} cancellationId={row.cancellationId}/></td></tr>)}</tbody></table></div>{result.data&&!result.data.items.length&&<p className="money-empty">조건에 맞는 등록 취소 내역이 없습니다.</p>}<div className="money-actions"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>이전</button><span>{result.data?.total??0}건</span><button disabled={offset+50>=(result.data?.total??0)} onClick={()=>setOffset(offset+50)}>다음</button></div></section>;
}
