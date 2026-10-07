"use client";
import {useState,useSyncExternalStore,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import type {AiItem} from '@/lib/money/ai';
import {categoryIndex} from '@/lib/money/categories';
import {moneyAmount} from '@/lib/money/accounts';
import {seoul,type Account,type Category} from '@/lib/money/model';
import {proposalBasis} from '@/lib/money/reviewCapabilities';
import {eventPrevious,reviewCounterparty,reviewReason,type ClassificationEvent} from '@/lib/money/classificationPresentation';
import {useMoneyCache,useMoneyRows,useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData,LoadState,type BookRow} from './MoneyWebData';
import {ClassificationStatus,classificationItem,classificationLabels} from './MoneyClassificationActions';
import {ClassificationUndo} from './MoneyClassificationUndo';
import './money-classification-workbench.css';

export type ClassificationRailProps={row:BookRow|null;item?:AiItem|null;categories:Category[];accounts:Account[];onClose?:()=>void;onEdit?:(row:BookRow)=>void;loading?:boolean;error?:string;children?:ReactNode};
const subscribeWidth=(listener:()=>void)=>{window.addEventListener('resize',listener);return()=>window.removeEventListener('resize',listener);};
export function ClassificationRail(props:ClassificationRailProps){
 const key=props.row?.id??props.item?.id??'none';
 const narrow=useSyncExternalStore(subscribeWidth,()=>window.innerWidth<1200,()=>false);
 const contents=<RailContents key={key} {...props}/>;
 return <aside className="money-classification-rail" aria-label={props.item?'AI 의견과 근거':'분류 근거와 이력'}>{narrow?<details className="money-classification-rail-fold"><summary>{props.item?'AI 의견 · 근거':'분류 근거 · 이력'}{key!=='none'&&' · 선택 거래'}</summary>{contents}</details>:contents}</aside>;
}
function RailContents({row:initial,item,categories,accounts,onClose,onEdit,loading=false,error='',children}:ClassificationRailProps){
 const coordinator=useMoneyRows(),cache=useMoneyCache(),router=useRouter(),index=categoryIndex(categories);
 const row=initial?coordinator.latest(initial):null;
 const id=row?.id??(item?.kind==='TRANSACTION'?item.id:null);
 const events=useMoneyData<{items:ClassificationEvent[];total:number}>(id?'/ai/classification/history?transactionId='+id+'&offset=0':null);
 const context=useMoneyData<{items:ClassificationEvent[];total:number}>(id?'/ai/classification/history?contextTransactionId='+id+'&offset=0':null);
 const eligibility=useMoneyData<{items:{id:string;requestEligible:boolean;reason:string}[]}>(id?'/ai/classification/eligibility?ids='+id:null);
 const detail=useMoneyData<AiItem>(id&&!item?'/ai/items/'+id+'?kind=TRANSACTION':null);
 const evidence=item??detail.data;
 const [,setReferences]=useMoneyViewState<string[]>('conversation-references',()=>[]),[,setConversationQuestion]=useMoneyViewState('conversation-question',()=>''),[question,setQuestion]=useState(''),[explanation,setExplanation]=useState(''),[requestOpen,setRequestOpen]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[requestError,setRequestError]=useState('');
 const history=events.data?.items??[],previous=eventPrevious(history,row?.classificationEventId);
 const canRequest=!!row&&eligibility.data?.items.some(value=>value.id===row.id&&value.requestEligible);
 async function request(){if(!row||!canRequest||busy)return;setBusy(true);setRequestError('');setNotice('');try{await coordinator.flush([row.id]);const latest=coordinator.latest(row);const result=await coordinator.execute<{queued:number}>('request:'+row.id,'/ai/classification/request',{items:[classificationItem(latest)],explanation:explanation.trim()||null});setNotice(result.queued?'이 거래의 AI 분류 요청을 저장했습니다. 최신 직접 수정은 보호하며 결과는 거래별로 반영합니다.':'분류 요청을 적용하지 않았습니다.');cache.mutate('ai');cache.mutate('book');setRequestOpen(false);}catch(e){setRequestError(e instanceof Error?e.message:'분류 요청을 저장하지 못했습니다. 설명을 유지했습니다.');}finally{setBusy(false);}}
 function ask(){if(!id||!question.trim())return;setReferences([id]);setConversationQuestion(question.trim());router.push('/money/classification?ai=conversation&transactionId='+id);}
 return <><header><h3>{item?'AI 의견 · 근거':'분류 근거 · 이력'}</h3>{(row||item)&&onClose&&<button aria-label="분류 근거 닫기" onClick={onClose}>닫기</button>}</header><LoadState loading={loading} error={error}/>{row||item?<>
 <section className="money-classification-selected"><h4>{item?reviewCounterparty(item):row?.counterpartyText||row?.title||'거래처 정보 없음'}</h4><strong>{moneyAmount(row?.amount??item?.amount,row?.currency??item?.currency??'KRW')}</strong><span> · {accounts.find(account=>account.id===(row?.accountId??item?.accountId))?.displayName??'계좌 연결 확인 필요'}</span><small>{seoul(row?.occurredAt??item!.occurredAt)}</small></section>
 <section className="money-classification-opinion"><span>현재 분류</span><strong>{index.path(row?row.categoryId:item?.categoryId)}</strong>{item?.proposal?.categoryId&&<><span>분류 제안</span><strong>{index.path(item.proposal.categoryId)}</strong><p>{item.proposal.reason||proposalBasis[item.proposal.basis]||'저장된 제안 근거를 확인해 주세요.'}</p><small>현재 값과 분류 제안을 구분합니다. 명시적으로 선택한 분류만 저장합니다.</small></>}{item&&!item.proposal?.categoryId&&<p>{item.kind==='RAW'?reviewReason(item):'분류 제안이 없습니다. 직접 분류하거나 이 거래만 AI에 요청할 수 있습니다.'}</p>}{row&&<ClassificationStatus row={row}/>}</section>
 {row&&<section><h4>이 거래의 분류 변경</h4><LoadState loading={events.loading} error={events.error} lastSuccessAt={events.lastSuccessAt}/>{previous!==undefined&&<p>이전 {index.path(previous)} → 현재 {index.path(row.categoryId)}</p>}{history.slice(0,3).map(event=><div key={event.id} className="money-classification-history-entry"><small>{seoul(event.createdAt)} · {classificationLabels[event.origin]??'분류 변경'}{!event.active&&' · 실행 취소'}</small><p>{index.path(event.previousValue.categoryId)} → {index.path(event.categoryId)}</p>{event.evidence?.reason&&<small>{event.evidence.reason}</small>}{event.evidence?.retention==='EXPIRED'&&<small>근거 보관 기간 종료</small>}</div>)}{!history.length&&!events.loading&&!events.error&&<p className="money-muted">저장된 분류 변경 이력이 없습니다.</p>}{row.classificationEventId&&<ClassificationUndo key={row.classificationEventId} eventIds={[row.classificationEventId]} transactionIds={[row.id]}/>}<Link href={'/money/classification?ai=operations&transactionId='+row.id}>전체 분류 이력 보기</Link></section>}
 {id&&<section><h4>같은 구매 맥락의 최근 분류</h4><LoadState loading={context.loading} error={context.error}/>{context.data?.items.slice(0,3).map(event=><div key={event.id} className="money-classification-history-entry"><small>{seoul(event.occurredAt??event.createdAt)} · {classificationLabels[event.origin]??'확정 분류'}</small><strong>{event.merchant||event.title||'거래처 정보 없음'}</strong><p>{index.path(event.categoryId)}</p></div>)}{!context.loading&&!context.error&&!context.data?.items.length&&<p className="money-muted">같은 계좌·유형·구매 맥락의 실제 분류 이력이 없습니다.</p>}</section>}
 {evidence&&<details className="money-classification-detail"><summary>근거 자세히</summary><p>{evidence.evidence?.summary||evidence.proposal?.reason||'추가로 저장된 근거가 없습니다.'}</p>{evidence.evidence?.rules?.map(rule=><p key={rule.id}>적용 가능한 규칙: {rule.name||rule.merchant} · {index.path(rule.categoryId)}</p>)}{evidence.evidence?.external?.map(lookup=><div key={lookup.id}><p>{lookup.result?.summary||lookup.result?.message||'저장된 외부 검색 결과'}</p>{lookup.result?.sources?.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>)}</details>}
 <details className="money-classification-detail"><summary>원문 보기</summary><LoadState loading={detail.loading} error={detail.error}/>{evidence?.rawSources?.length?evidence.rawSources.map(raw=><div key={raw.id}><h4>{raw.title||'은행 알림'}</h4><pre>{raw.bigText||raw.text||'알림 본문 없음'}</pre><small>{seoul(raw.postedAt)} · 출처 {raw.sourcePackage}</small></div>):<p>현재 조회에서 연결된 원문이 없습니다. 수동 입력 여부는 원장 출처에서 확인합니다.</p>}</details>
 {children}
 {row&&<section className="money-classification-request"><LoadState loading={eligibility.loading} error={eligibility.error}/>{canRequest?<><button disabled={busy} onClick={()=>setRequestOpen(value=>!value)}>{row.categoryId?'AI로 다시 분류':'이 거래 AI 분류 요청'}</button>{requestOpen&&<form onSubmit={event=>{event.preventDefault();void request();}}><label>구매·거래 설명 (선택)<textarea value={explanation} maxLength={500} placeholder="예: 업무 중 구입한 간식" onChange={event=>setExplanation(event.target.value)}/></label><small>선택한 거래에만 사용합니다. 외부 검색은 별도 허용 경로에서 진행합니다.</small><button className="money-primary" disabled={busy} type="submit">이 거래만 AI 요청</button></form>}</>:<small>{eligibility.data?.items[0]?.reason??'이 거래의 분류 요청 가능 여부를 확인합니다.'}</small>}{notice&&<p role="status">{notice}</p>}{requestError&&<p role="alert">{requestError}</p>}{onEdit&&<button onClick={()=>onEdit(row)}>거래 상세 편집</button>}</section>}
 {id&&<form className="money-classification-question" onSubmit={event=>{event.preventDefault();ask();}}><label>이 거래에 대해 질문<input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="분류 이유나 구매 의미를 물어보세요"/></label><button disabled={!question.trim()} type="submit">AI 대화에서 질문</button><small>질문을 검토한 후 대화에서 전송합니다. 외부 검색은 별도 허용이 필요합니다.</small></form>}
 </>:<div className="money-classification-rail-idle"><p>거래를 선택하면 분류 의견과 실제 근거를 확인합니다.</p><p>분류는 표에서 바로 수정할 수 있습니다.</p></div>}</>;
}
