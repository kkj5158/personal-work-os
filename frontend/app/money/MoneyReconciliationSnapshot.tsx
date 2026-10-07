"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {moneyAmount} from '@/lib/money/accounts';
import {resourceKey} from '@/lib/money/cache';
import {moneyApi as api,seoul,type Transaction,type Raw} from '@/lib/money/model';
import {useMoneyData,LoadState,type BookRow} from './MoneyWebData';
import {useMoneyCache,useMoneyScroll,useMoneyViewState} from './MoneyDataProvider';
import {RawEvidence} from './MoneyEditors';
import type {Props,ReconciliationInvestigation} from './MoneyWebViews';
type Evidence={id:string;kind:'RAW'|'TRANSACTION';at:string;amount:number|null;currency:string;title:string|null;status:string;reason:string;sourceIds:string[];bookkeepingVisible:boolean};
type Snapshot={account:{id:string;displayName:string};currency:string;cutoff:string;comparisonAt:string|null;anchor:{at:string;amount:number;kind:string}|null;observation:{at:string;amount:number;kind:string}|null;registeredBalance:number|null;referenceBalance:number|null;difference:number|null;status:string;partial:boolean;conflictingEvidence:boolean;eligibleUnregistered:number;unresolved:number;registeredCount:number;bookkeepingVisibleCount:number;unsupportedCurrency:boolean;token:string;totalEvidence:number;filteredEvidence:number;items:Evidence[];scopeEvidence?:number;adjustmentContext?:ReconciliationInvestigation};
function reasonLabel(reason:string){return /[가-힣]/.test(reason)?reason:({REGISTERED:'이미 등록된 금융 거래',ELIGIBLE_UNREGISTERED:'거래 등록 전 · 계좌와 연결 확인',SUPPORTING:'기존 거래의 추가 원문',NEEDS_CONFIRMATION:'자료 부족 · 내용 확인 필요'} as Record<string,string>)[reason]??'자료 또는 연결 확인 필요';}
const statuses:Record<string,string>={INSUFFICIENT:'확인 자료 부족',MANUAL_ANCHOR:'수동 기준점',REGISTERED_MATCH:'등록 내역과 같음',EXPLAINED_UNREGISTERED:'등록 전 내역으로 설명됨',UNEXPLAINED:'원인 확인 필요'};
const initial=()=>({accountId:'',cutoff:new Date().toISOString(),search:'',offset:0,token:'',selectedId:'',scope:'attention'});
export function ReconciliationSnapshot(p:Props){
 const query=useSearchParams(),cache=useMoneyCache();
 const [view,setView]=useMoneyViewState('reconciliation-investigation',()=>({...initial(),accountId:query.get('account')??''}));
 const accountId=query.get('account')??view.accountId;
 const account=accountId?p.accounts.find(a=>a.id===accountId):p.accounts.find(a=>!a.archived);
 const scope=view.scope??'attention';
 const parameters=new URLSearchParams({cutoff:view.cutoff,offset:String(view.offset),search:view.search,scope});if(view.offset&&view.token)parameters.set('token',view.token);
 const path=account?`/accounts/${account.id}/reconciliation-snapshot?${parameters}`:null;
 const result=useMoneyData<Snapshot>(path),data=result.data;
 useMoneyScroll('reconciliation:'+account?.id,!!data);
 // The address-bar account becomes the return context, including visits without a filter edit.
 useEffect(()=>{if(account&&view.accountId!==account.id)setView(old=>({...old,accountId:account.id}));},[account,view.accountId,setView]);
 const activeQuery=useRef<string|null>(null);
 const requestContext=path+'|'+view.selectedId;
 useLayoutEffect(()=>{activeQuery.current=requestContext;return()=>{activeQuery.current=null;};},[requestContext]);
 const [error,setError]=useState('');
 const selected=data?.items.find(e=>e.id===view.selectedId);
 function fresh(){setView({...view,cutoff:new Date().toISOString(),offset:0,token:''});}
 async function open(item:Evidence,book=false){setError('');const current=requestContext;try{const selection=book?{kind:'book' as const,value:await api.get<BookRow>('/bookkeeping/'+item.id)}:item.kind==='TRANSACTION'?{kind:'transaction' as const,value:await api.get<Transaction>('/transactions/'+item.id)}:{kind:'review' as const,value:await api.get<Raw>('/notifications/'+item.id)};if(activeQuery.current===current)p.select(selection);}catch{if(activeQuery.current===current)setError('선택한 근거를 불러오지 못했습니다. 조사 자료와 선택을 유지했습니다.');}}
 function changeAccount(id:string){if(p.changeContext&&!p.changeContext())return;setView({...initial(),accountId:id});p.navigate?.('/money/reconciliation?account='+id);}
 return <>
  <div className="money-toolbar"><label>계좌 <select aria-label="잔액 점검 계좌" value={account?.id??''} onChange={e=>changeAccount(e.target.value)}>{p.accounts.map(a=><option key={a.id} value={a.id}>{a.displayName}{a.archived?' · 보관':''}</option>)}</select></label><button onClick={()=>{if(path){cache.invalidate(key=>key===resourceKey(path));void cache.load(path).catch(()=>{});}}}>같은 기준 자료 갱신</button><button onClick={fresh}>현재 시각으로 새 조사</button><span>{data?statuses[data.status]:''}</span></div>
  <LoadState error={result.error} loading={result.loading} lastSuccessAt={result.lastSuccessAt}/>
  {result.error&&<p className="money-financial-notice">증빙 또는 버전이 바뀌었다면 ‘현재 시각으로 새 조사’를 선택해 주세요. 이전 자료를 최신 조사 결과로 확정하지 않습니다.</p>}
  {!account&&<p className="money-empty">등록된 계좌가 없습니다.</p>}
  {data&&<>
   <p className="money-asof">조회 기준 {seoul(data.cutoff).replace('T',' ')} · 비교 기준 {data.comparisonAt?seoul(data.comparisonAt).replace('T',' '):'확인되지 않음'} · {data.currency}</p>
   <div className="money-recon-balances">{[{name:'등록 거래 기준 잔액',amount:data.registeredBalance,note:`금융 사실 ${data.registeredCount}건 · 직접 등록 포함`},{name:'받은 내역 참고 잔액',amount:data.referenceBalance,note:`명확한 미등록 이동 ${data.eligibleUnregistered}건 포함`},{name:'알림에 기록된 잔액',amount:data.observation?.amount,note:data.observation?.kind==='MANUAL'?'수동 기준점 · 은행 독립 확인 아님':'같은 계좌·시각의 알림 근거'}].map(metric=><section className="money-metric" key={metric.name}><p>{metric.name}</p><strong>{data.conflictingEvidence||data.unsupportedCurrency?'비교 불가':moneyAmount(metric.amount,data.currency)}</strong><small>{metric.note}</small></section>)}</div>
   <p className="money-financial-notice">{statuses[data.status]} · {data.partial?`확인된 범위만 계산 · 미확인 ${data.unresolved}건`:'같은 기준점 이후, 비교 시각까지의 내역을 계산했습니다.'} {data.conflictingEvidence&&'같은 시각의 잔액 근거가 상충합니다.'} {data.unsupportedCurrency&&'통화 근거가 달라 합산할 수 없습니다.'} 가계부 실제 표시 {data.bookkeepingVisibleCount}건. 미분류 여부가 금융 잔액을 바꾸지 않습니다.</p>
   <div className="money-recon-investigation"><section className="money-card">
    <div className="money-section-heading"><h2>{scope==='registered'?'같은 값으로 들어간 거래':scope==='additional'?'같은 거래의 추가 알림':scope==='all'?'전체 내역':'먼저 확인할 내역'}</h2><span>전체 증빙 {data.totalEvidence}건</span></div><div className="money-toolbar"><button aria-pressed={scope==='attention'} onClick={()=>setView({...view,scope:'attention',offset:0,selectedId:''})}>확인할 내역</button><button aria-pressed={scope==='all'} onClick={()=>setView({...view,scope:'all',offset:0,selectedId:''})}>전체 내역</button></div><label className="money-field"><span>전체 증빙 검색</span><input value={view.search} placeholder="거래처 · 내역 · 확인 사유" onChange={e=>setView({...view,search:e.target.value,offset:0})}/></label>
    <div className="money-table-scroll"><table className="money-reconciliation-table"><thead><tr><th>상태</th><th>내역 · 근거</th><th>금액</th><th>가계부</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id} aria-selected={item.id===view.selectedId}><td>{item.status==='REGISTERED'?'등록됨':item.status==='ELIGIBLE_UNREGISTERED'?'등록 전':'확인 필요'}</td><td><button onClick={()=>setView({...view,selectedId:item.id})}>{item.title??'내역 확인'}</button><small>{seoul(item.at).replace('T',' ')} · {reasonLabel(item.reason)}</small></td><td className="number">{moneyAmount(item.amount,item.currency)}</td><td>{item.bookkeepingVisible?'표시됨':item.reason.includes('이체')?'내부 이체':item.kind==='RAW'?'금융 확인 필요':'추적 범위 확인'}</td></tr>)}</tbody></table></div>
    {!data.items.length&&<p className="money-empty">조건에 맞는 증빙이 없습니다.</p>}
    <div className="money-toolbar"><button disabled={!view.offset||result.loading} onClick={()=>setView({...view,offset:Math.max(0,view.offset-10),token:data.token})}>이전 10개</button><span>{view.offset+1}–{view.offset+data.items.length} / {data.filteredEvidence}</span><button disabled={view.offset+10>=data.filteredEvidence||result.loading} onClick={()=>setView({...view,offset:view.offset+10,token:data.token})}>다음 10개</button></div>
   <details open={scope==='registered'} onToggle={e=>{if(e.currentTarget.open&&scope!=='registered')setView({...view,scope:'registered',offset:0,selectedId:''});}}><summary>같은 값으로 들어간 거래 · {data.registeredCount}건</summary><p>두 계산에 같은 값으로 포함된 거래입니다. 전체 자료에서 검색하고 10개씩 확인합니다.</p></details><details open={scope==='additional'} onToggle={e=>{if(e.currentTarget.open&&scope!=='additional')setView({...view,scope:'additional',offset:0,selectedId:''});}}><summary>같은 거래의 추가 알림</summary><p>기존 거래에 연결된 원문이며 금액을 다시 더하지 않습니다.</p></details></section><aside className="money-card money-recon-evidence" aria-label="선택 근거"><h2>선택 내역</h2>{selected?<><h3>{selected.title??'내역 확인'}</h3><strong>{moneyAmount(selected.amount,selected.currency)}</strong><p>{reasonLabel(selected.reason)}</p><p>{selected.kind==='TRANSACTION'?'금융 이동은 한 번만 계산합니다. 추가 원문은 이동 수를 늘리지 않습니다.':'참고 계산은 거래 등록 명령이 아닙니다. 계좌·금액·시각을 금융 확인에서 확인해 주세요.'}</p><button onClick={()=>void open(selected)}>{selected.kind==='TRANSACTION'?'금융 거래 확인':'금융 등록 검토'}</button>{selected.kind==='TRANSACTION'&&selected.bookkeepingVisible&&<button onClick={()=>void open(selected,true)}>가계부 분류 확인</button>}{selected.sourceIds.map(id=><RawEvidence key={id} id={id}/>)}</>:<><p className="money-muted">{view.selectedId?'현재 조회에서 이 내역을 확인할 수 없습니다. 선택을 해제하거나 조회 조건을 확인해 주세요.':'내역을 선택하면 원문·연결·표시 근거를 확인할 수 있습니다.'}</p>{view.selectedId&&<button onClick={()=>setView({...view,selectedId:''})}>선택 해제</button>}</>}<details><summary>계산 기준</summary><p>기준점 {data.anchor?moneyAmount(data.anchor.amount,data.currency):'없음'} · {data.anchor?seoul(data.anchor.at).replace('T',' '):'—'}</p><p>잔액 차이 {moneyAmount(data.difference,data.currency)}</p><p>기준과 계산에 공통으로 사용된 알림은 독립 검증으로 표시하지 않습니다.</p></details></aside></div>
   <details className="money-card"><summary>원인 조사 후 수동 기준점 검토</summary><p>누락 거래·잘못된 계좌·중복·시각 차이·취소 및 환불을 먼저 확인해 주세요. 잔액은 자동 조정하지 않습니다.</p><button disabled={!data.adjustmentContext||!!result.error||result.loading} onClick={()=>account&&p.select({kind:'reconciliation',value:account,investigation:data.adjustmentContext})}>선택한 조사 기준으로 잔액 조정 검토</button></details>
  </>}{error&&<p role="alert">{error}</p>}
 </>;
}
