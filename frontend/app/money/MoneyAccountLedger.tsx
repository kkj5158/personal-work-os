"use client";
import {Fragment,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {moneyApi as api,seoul,type Category,type Account} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {ACCOUNT_LEDGER,ledgerTypes,ledgerPath,categoryEligible,ledgerDisplayType,changeLedgerScope,type LedgerFilters,type LedgerPage,type LedgerRow,type PendingPage,type LedgerOperation,recoverLedgerOperation} from '@/lib/money/accountLedger';
import type {UnifiedOutcome} from '@/lib/money/unified';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData,LoadState} from './MoneyWebData';
import {Pagination,type Props} from './MoneyWebViews';
import {RecommendationProvider,useRecommendations,type SavePreview} from './MoneyBookkeepingRecommendations';
import {AccountLedgerEditor} from './MoneyAccountLedgerEditor';
import {MoneyFinancialEngine} from './MoneyFinancialEngine';
import {DecisionStatus,FinancialTypePicker,directionHint,useFinancialDecisions} from './MoneyLedgerFinancialType';
import './money-account-ledger.css';

type Pending={id:string;operation:LedgerOperation};
type CategoryPending={id:string;command:{requestId:string;expectedVersion:number;fingerprint:string;categoryId:string;expectedClassificationVersion:number;thisTransactionOnly:boolean}};
type MetadataPending={id:string;field:"title"|"memo";command:{requestId:string;expectedVersion:number;fingerprint:string;title:string;memo:string|null}};
function usePendingRows<T extends {id:string}>(key:string){
 const [byId,setById]=useMoneyViewState<Record<string,T>>(key,()=>({}));
 function update(id:string,value:T|null){setById(old=>{const next={...old};if(value)next[id]=value;else delete next[id];return next;});}
 return [byId,update] as const;
}
export function AccountLedger(p:Props){
 const query=useSearchParams(),cache=useMoneyCache();
 const transactionId=query.get('transactionId');
 const validLink=transactionId!==null&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(transactionId);
 const [closedLink,setClosedLink]=useState<string|null>(null);
 const linked=useMoneyData<LedgerRow>(validLink&&closedLink!==transactionId?ACCOUNT_LEDGER+'/rows/'+transactionId:null);
 const [filters,setFilters]=useMoneyViewState<LedgerFilters>('account-ledger-filters',()=>({accountId:query.get('accountId')??query.get('account'),type:'',state:'ALL',search:'',view:'ledger',offset:0}));
 const [selection,setSelection]=useState<LedgerRow[]>([]),[expanded,setExpanded]=useState<{id:string;type?:string}|null>(null),[context,setContext]=useState(0),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [pendingRows,setPending]=usePendingRows<Pending>('ledger-advanced-requests'),[recovering,setRecovering]=useState(false);
 const [metadataRows,setMetadataPending]=usePendingRows<MetadataPending>('ledger-metadata-requests');
 const [categoryRows,setCategoryPending]=usePendingRows<CategoryPending>('ledger-category-requests');
 const page=useMoneyData<LedgerPage>(filters.view!=='pending'?ledgerPath(p.period.from,p.period.to,filters):null),raw=useMoneyData<PendingPage>(filters.view==='pending'?ledgerPath(p.period.from,p.period.to,filters):null);
 const result=filters.view==='pending'?raw:page,data=result.data,counts=new Map(data?.accountCounts.map(a=>[a.accountId,a.count])??[]);
 const active=p.accounts.find(a=>a.id===filters.accountId),scope=active?.displayName??'전체 계좌';
 function change(next:Partial<LedgerFilters>){setFilters(old=>({...old,...next,offset:0}));setExpanded(null);setSelection([]);setContext(value=>value+1);setError('');setMessage('필터를 변경하여 미확정 편집과 선택을 닫았습니다.');}
 function account(accountId:string|null){setFilters(old=>changeLedgerScope(old,accountId));setExpanded(null);setSelection([]);setContext(value=>value+1);setError('');setMessage('계좌 관점을 전환했습니다. 미확정 편집과 선택을 닫았습니다.');}
 async function recover(pending:Pending,replay=false){if(!pending||recovering)return;setRecovering(true);try{let outcome=await api.get<UnifiedOutcome>('/bookkeeping/unified/outcomes/'+pending.operation.edit.requestId);if(replay&&outcome.status==='UNKNOWN')outcome=await recoverLedgerOperation(pending.id,pending.operation,(path,body)=>api.post(path,body),path=>api.get(path));if(outcome.status==='UNKNOWN'){setMessage('처리 결과를 아직 확인하지 못했습니다. 원래 요청 ID를 유지합니다.');return;}setPending(pending.id,null);cache.mutate('transaction');setMessage(outcome.status==='APPLIED'?'원래 요청의 저장 완료를 확인했습니다.':outcome.result?.message??'원래 요청은 적용되지 않았습니다. 초안을 다시 확인하세요.');}catch(e){setError(e instanceof Error?e.message:'원래 요청 조회 실패');}finally{setRecovering(false);}}
 async function recoverMetadata(metadataPending:MetadataPending){if(!metadataPending||recovering)return;setRecovering(true);try{const outcome=await api.get<UnifiedOutcome>('/bookkeeping/unified/outcomes/'+metadataPending.command.requestId);if(outcome.status==='UNKNOWN'){setMessage('제목·메모 원래 요청을 아직 확인하지 못했습니다. 새 ID로 저장하지 않습니다.');return;}setMetadataPending(metadataPending.id,null);cache.mutate('transaction');setMessage(outcome.status==='APPLIED'?'제목·메모 저장 완료를 확인했습니다.':outcome.result?.message??'제목·메모가 저장되지 않았습니다.');}catch(e){setError(e instanceof Error?e.message:'원래 요청 확인 실패');}finally{setRecovering(false);}}
 async function recoverCategory(categoryPending:CategoryPending,replay=false){if(!categoryPending||recovering)return;setRecovering(true);try{let outcome=await api.get<UnifiedOutcome>('/bookkeeping/unified/outcomes/'+categoryPending.command.requestId);if(replay&&outcome.status==='UNKNOWN')outcome=await api.post(ACCOUNT_LEDGER+'/rows/'+categoryPending.id+'/category',categoryPending.command);if(outcome.status==='UNKNOWN'){setMessage('카테고리 원래 요청을 아직 확인하지 못했습니다. 원래 요청 ID를 유지합니다.');return;}setCategoryPending(categoryPending.id,null);cache.mutate('transaction');cache.mutate('book');setMessage(outcome.status==='APPLIED'?'카테고리 저장 완료를 확인했습니다.':outcome.result?.message??'카테고리가 저장되지 않았습니다.');}catch(e){setError(e instanceof Error?e.message:'카테고리 원래 요청 확인 실패');}finally{setRecovering(false);}}
 const decisions=useFinancialDecisions(),[engineOpen,setEngineOpen]=useState(false);
 const [bulkType,setBulkType]=useState(''),[bulkBusy,setBulkBusy]=useState(false),[bulkMessage,setBulkMessage]=useState('');
 const rows=(page.data?.items??[]).map(row=>{
  const receipt=decisions.entries[row.id]?.receipt;
  if(!receipt||receipt.currentVersion<=row.version)return row;
  return {...receipt.row,direction:row.direction,signedAmount:row.signedAmount};
 });
 const visible=rows.map(row=>row.id),selectedRows=selection.filter(row=>visible.includes(row.id)),selected=selectedRows.map(r=>r.id);
 function rowBusy(id:string){const phase=decisions.entries[id]?.phase;return !!(pendingRows[id]||metadataRows[id]||categoryRows[id]||phase==='saving'||phase==='unknown');}
 useEffect(()=>{setSelection([]);setBulkMessage('');},[p.period.from,p.period.to]);
 useEffect(()=>{
  if(data&&!result.loading&&!data.items.length&&filters.offset>0){
   const last=Math.max(0,(Math.ceil(data.total/50)-1)*50);
   if(last<filters.offset)setFilters(old=>({...old,offset:last}));
  }
 },[data,result.loading,filters.offset,setFilters]);
 async function applyBulk(){
  if(bulkBusy||!bulkType||!selectedRows.length)return;
  setBulkBusy(true);setBulkMessage('');
  const targets=selectedRows.slice(0,50),remaining:LedgerRow[]=[],totals={saved:0,pending:0,skipped:0,failed:0};
  // Bound concurrent writes. Each command uses the version observed when its checkbox was selected.
  let next=0;
  async function worker(){
   while(next<targets.length){
    const row=targets[next++];
    if(rowBusy(row.id)||directionHint(row,bulkType)||ledgerDisplayType(row)===bulkType){totals.skipped++;continue;}
    const outcome=await decisions.save(row,bulkType,false);
    if(outcome==='saved'||outcome==='pending')totals[outcome]++;
    else{totals.failed++;remaining.push(row);}
   }
  }
  try{
   await Promise.all(Array.from({length:Math.min(4,targets.length)},worker));
   setSelection(remaining);
   setBulkMessage('금융유형 일괄 결과 · 저장 '+totals.saved+'건 · 연결 대기 '+totals.pending+'건 · 제외 '+totals.skipped+'건 · 확인 필요 '+totals.failed+'건');
   cache.mutate('transaction');
  }finally{setBulkBusy(false);}
 }
 return <RecommendationProvider filters={{}} selected={selected} visible={visible} categories={p.categories} accounts={p.accounts} workbench={false}><section className="money-account-ledger" aria-label="계좌 거래장">
  {transactionId&&!validLink&&<p role="alert">연결된 거래 식별자를 확인해 주세요.</p>}
  {validLink&&closedLink!==transactionId&&expanded?.id!==transactionId&&<section aria-label="연결된 원장 거래">
   <h2>검토 이력에서 연결된 거래</h2>
   {linked.data&&<div className="al-linked-decision"><strong>{linked.data.title??'거래'}</strong><FinancialTypePicker row={linked.data} disabled={rowBusy(transactionId)} onChoose={type=>void decisions.save(linked.data!,type)}/><DecisionStatus row={linked.data} entry={decisions.entries[transactionId]} retry={decisions.retry} undo={decisions.undo}/></div>}
   <AccountLedgerEditor key={transactionId} id={transactionId} accounts={p.accounts} categories={p.categories}
    pending={pendingRows[transactionId]?.operation??null} locked={rowBusy(transactionId)}
    onPending={operation=>setPending(transactionId,operation?{id:transactionId,operation}:null)} onClose={()=>setClosedLink(transactionId)}/>
  </section>}
  <div className="al-engine-switch"><button type="button" aria-expanded={engineOpen} onClick={()=>setEngineOpen(open=>!open)}>{engineOpen?'계좌 거래장으로 돌아가기':'금융유형 자동분류'}</button></div>
  {engineOpen?<MoneyFinancialEngine rows={rows}/>:<>
  <div className="al-summary" aria-label="조회 요약">{filters.accountId&&filters.view!=='pending'?<><div><small>선택 계좌 입금 · 필터 기준</small><strong>{data?.summary.incoming!=null?moneyAmount(data.summary.incoming,data.summary.currencies[0]??'KRW'):'—'}</strong></div><div><small>선택 계좌 출금 · 필터 기준</small><strong>{data?.summary.outgoing!=null?moneyAmount(data.summary.outgoing,data.summary.currencies[0]??'KRW'):'—'}</strong></div></>:<div><small>{filters.view==='pending'?'금융 이동 집계':'금융 의미 미확정'}</small><strong>{filters.view==='pending'?'집계 제외':data?.summary.unresolved??'—'}</strong></div>}{filters.view!=='pending'&&data?.summary.relationPending!=null&&<div><small>후속 연결 대기</small><strong>{data.summary.relationPending}<span>건</span></strong></div>}<div><small>조회 거래</small><strong>{data?.total??'—'}<span>건</span></strong></div><div className="al-summary-note">{filters.accountId?<><strong>{scope}</strong><span>해당 계좌 입출금 · 잔액 — / 확인 근거 없음</span></>:<><strong>전체 계좌 잔액 합산은 제공하지 않습니다</strong><span>이체 한 건은 한 행 · 원본 연결 보존</span></>}</div></div>
  <div className="al-panel">
   <div className="al-filters"><div className="al-account-filter" role="group" aria-label="조회 계좌 단일 선택"><div className="al-filter-heading"><strong>계좌 선택</strong><small>단일 선택 · 버튼을 누르면 해당 계좌만 표시</small></div><div className="al-account-controls"><button type="button" className="al-account-all" aria-pressed={filters.accountId===null} onClick={()=>account(null)}>{filters.accountId===null&&<span aria-hidden="true">✓ </span>}전체 계좌 보기</button><div className="al-account-buttons">{p.accounts.map(a=><button type="button" key={a.id} className="al-account-chip" aria-pressed={filters.accountId===a.id} onClick={()=>account(a.id)}>{filters.accountId===a.id&&<span aria-hidden="true">✓ </span>}{a.displayName}{a.archived&&<small>보관</small>}<span className="al-count" aria-label="전체 필터 거래 수">{counts.get(a.id)??(data?0:'—')}</span></button>)}</div></div></div>
    <label>조회 기간<span className="al-period">{p.period.from} ~ {p.period.to}</span></label><label>금융 유형<select aria-label="금융 유형 필터" value={filters.type} onChange={e=>change({type:e.target.value})}><option value="">모든 금융 유형</option>{Object.entries(ledgerTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>상태<select aria-label="금융 상태 필터" value={filters.state} onChange={e=>change({state:e.target.value})}><option value="ALL">모든 상태</option><option value="CONFIRMED">확정</option><option value="UNRESOLVED">금융 의미 미확정</option></select></label><label>거래 검색<input aria-label="계좌 거래 검색" placeholder="거래처·제목·메모 검색" value={filters.search} onChange={e=>change({search:e.target.value})}/></label>
   </div>
   <div className="al-toolbar"><nav aria-label="계좌 거래장 하위 화면">{([['ledger','전체 거래'],['unresolved','금융 의미 미확정'],['followup','후속 연결 대기'],['pending','미처리 알림']] as const).map(([view,label])=><button type="button" key={view} aria-pressed={filters.view===view} onClick={()=>change({view})}>{label}</button>)}</nav><button type="button" className="al-reset" onClick={()=>{change({accountId:null,type:'',state:'ALL',search:'',view:'ledger'});}}>필터 초기화</button></div>
   <LoadState loading={result.loading} error={error||result.error} lastSuccessAt={result.lastSuccessAt}/>
   {Object.values(categoryRows).map(categoryPending=><div key={categoryPending.id} className="al-pending" role="status"><strong>카테고리 저장 결과 확인 필요</strong><span>요청 ID {categoryPending.command.requestId}</span><button disabled={recovering} onClick={()=>void recoverCategory(categoryPending)}>카테고리 원래 요청 결과 확인</button><button disabled={recovering} onClick={()=>void recoverCategory(categoryPending,true)}>카테고리 같은 요청 재시도</button></div>)}
   {Object.values(metadataRows).map(metadataPending=><div key={metadataPending.id} className="al-pending" role="status"><strong>제목·메모 저장 결과 확인 필요</strong><span>요청 ID {metadataPending.command.requestId}</span><button disabled={recovering} onClick={()=>void recoverMetadata(metadataPending)}>제목·메모 원래 요청 결과 확인</button></div>)}
   {Object.values(pendingRows).map(pending=><div key={pending.id} className="al-pending" role="status"><strong>금융 저장 결과 확인 필요</strong><span>요청 ID {pending.operation.edit.requestId}</span><button disabled={recovering} onClick={()=>void recover(pending)}>원래 요청 결과 확인</button><button disabled={recovering} onClick={()=>void recover(pending,true)}>원래 요청으로 재시도</button></div>)}
   {Object.values(decisions.entries).filter(entry=>entry.phase==='unknown'&&!visible.includes(entry.id)).map(entry=><div className="al-pending" key={entry.id} role="status"><strong>{entry.title} · 금융유형 저장 결과 확인 필요</strong><span>{entry.command.requestId}</span><button onClick={()=>void decisions.retry(entry)}>원래 요청 재확인</button></div>)}
   {Object.values(decisions.entries).filter(entry=>(entry.phase==='conflict'||entry.phase==='failed')&&!visible.includes(entry.id)).map(entry=><div className="al-pending" key={entry.id} role="status">{entry.title} · {ledgerTypes[entry.command.financialType]} · {entry.message}<Link href={'/money/ledger?transactionId='+entry.id}>거래에서 확인</Link></div>)}
   {Object.values(decisions.entries).filter(entry=>entry.phase==='saved' &&entry.receipt&&!visible.includes(entry.id)).slice(-1).map(entry=><div className="al-pending" key={entry.id} role="status">{entry.title} · {ledgerTypes[entry.command.financialType]} 저장됨 <button onClick={()=>void decisions.undo(entry)}>실행 취소</button></div>)}
   {filters.view==='pending'?<div className="al-raw"><p>미처리 알림은 금융 거래와 별도입니다. 계좌 잔액·수입·소비에 포함하지 않습니다.</p>{raw.data?.items.map(item=><article key={item.id}><div><strong>{item.title??item.merchant??'은행 알림 확인'}</strong><small>{item.occurredAt?seoul(item.occurredAt):'시각 확인 필요'} · {p.accounts.find(a=>a.id===item.accountId)?.displayName??'계좌 미확인'}</small><small>{item.reason}</small></div><span>{item.amount!=null?moneyAmount(item.amount,'KRW'):'금액 확인 필요'}</span><Link href="/money/review" onClick={e=>{e.preventDefault();p.navigate?.('/money/review');}}>기존 검토 필요에서 확인 →</Link></article>)}{!raw.loading&&!raw.data?.items.length&&<p className="al-empty">조건에 맞는 미처리 알림이 없습니다.</p>}</div>:<>
    {selected.length>0&&<section className="al-bulk" aria-label="선택 거래 금융유형 변경"><strong>현재 페이지 {selected.length}건 선택</strong><select aria-label="일괄 금융유형" disabled={bulkBusy} value={bulkType} onChange={e=>setBulkType(e.target.value)}><option value="">금융유형 선택</option>{Object.entries(ledgerTypes).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select><button disabled={!bulkType||bulkBusy} onClick={()=>void applyBulk()}>{bulkBusy?'저장 중…':'선택 거래에 적용'}</button><button disabled={bulkBusy} onClick={()=>setSelection([])}>선택 해제</button></section>}
    {bulkMessage&&<p className="al-batch-result" role="status">{bulkMessage}</p>}
    <LedgerBulk key={context+':'+p.period.from+':'+p.period.to} selected={selected} rows={rows} categories={p.categories} onClear={()=>setSelection([])}/>
    <div className="al-caption"><span>{scope} · {filters.accountId?'해당 계좌의 입금·출금 표시':'이체 1건은 1행 · 합산 잔액 표시 없음'}</span><span>금융유형을 선택하면 바로 저장됩니다.</span></div>
    <div className="al-table-scroll" aria-label="계좌 거래 목록"><table className="al-table"><thead><tr><th scope="col"><label className="al-check-target"><input type="checkbox" aria-label="현재 페이지 거래 선택" disabled={bulkBusy} checked={!!visible.length&&visible.every(id=>selected.includes(id))} onChange={e=>setSelection(e.target.checked?rows:[])}/></label></th><th scope="col">거래 일시</th><th scope="col">계좌 / 이동</th><th scope="col">거래 내용</th><th scope="col">변동 금액</th><th scope="col">금융 유형</th><th scope="col">카테고리</th><th scope="col">상태</th><th scope="col">상세</th></tr></thead><tbody>{rows.map(row=>{const open=expanded?.id===row.id;return <Fragment key={row.id}><tr data-transaction-id={row.id} className={open?'al-row expanded':'al-row'}><td><label className="al-check-target"><input type="checkbox" disabled={bulkBusy} aria-label={(row.title??'거래')+' 분류 선택'} checked={selected.includes(row.id)} onChange={e=>setSelection(old=>e.target.checked?[...old,row]:old.filter(item=>item.id!==row.id))}/></label></td><td><time dateTime={row.occurred_at}>{seoul(row.occurred_at).replace('T',' ')}</time></td><td><AccountPath row={row} accounts={p.accounts} accountId={filters.accountId}/></td><td><LedgerText disabled={rowBusy(row.id)} key={context+':title:'+row.id} row={row} field="title" value={row.title??row.counterparty_text??''}/><LedgerText disabled={rowBusy(row.id)} key={context+':memo:'+row.id} row={row} field="memo" value={row.memo??''}/></td><td className={'al-amount '+(row.direction==='IN'?'incoming':'')}><strong>{row.signedAmount===null?'↔ ':row.signedAmount<0?'−':row.signedAmount>0?'+':''}{moneyAmount(Math.abs(row.signedAmount??row.amount),row.currency)}</strong><small>{row.direction==='TRANSFER'?'이체 1건':row.direction==='OUT'?'출금':row.direction==='IN'?'입금':'관점 미확인'}</small></td><td><FinancialTypePicker row={row} disabled={rowBusy(row.id)} onChoose={type=>void decisions.save(row,type)}/></td><td>{categoryEligible(row)&&row.book?<LedgerCategory disabled={rowBusy(row.id)} row={row} categories={p.categories}/>:<span className="al-no-category" aria-label={categoryEligible(row)?"가계부 추적 대상 밖":"생활 카테고리 적용 대상 아님"}>{categoryEligible(row)?<Link href="/money/bookkeeping">가계부 추적 대상 밖 · 분류 설정 확인</Link>:"—"}</span>}</td><td><DecisionStatus row={row} entry={decisions.entries[row.id]} retry={decisions.retry} undo={decisions.undo}/></td><td><button type="button" className="al-expand" aria-label={(row.title??'거래')+' 상세 편집'} aria-expanded={open} aria-controls={'ledger-editor-'+row.id} onClick={()=>setExpanded(open?null:{id:row.id})}>{open?'⌃':'⌄'}</button></td></tr>{open&&<tr className="al-editor-row"><td colSpan={9}><AccountLedgerEditor key={context+':'+row.id+':'+(expanded.type??'')} id={row.id} initialType={expanded.type} accounts={p.accounts} categories={p.categories} metadataEditor={<div className="al-editor-metadata"><label>제목<LedgerText disabled={rowBusy(row.id)} row={row} field="title" value={row.title??row.counterparty_text??''}/></label><label>메모<LedgerText disabled={rowBusy(row.id)} row={row} field="memo" value={row.memo??''}/></label></div>} categoryEditor={categoryEligible(row)&&row.book?<LedgerCategory disabled={rowBusy(row.id)} row={row} categories={p.categories}/>:null} pending={pendingRows[row.id]?.operation??null} locked={rowBusy(row.id)} onPending={operation=>setPending(row.id,operation?{id:row.id,operation}:null)} onClose={()=>setExpanded(null)}/></td></tr>}</Fragment>;})}{!rows.length&&!page.loading&&<tr><td colSpan={9} className="al-empty">조건에 맞는 거래가 없습니다.</td></tr>}</tbody></table></div>
   </>}
   <Pagination total={data?.total??0} offset={filters.offset} onChange={offset=>{setFilters(old=>({...old,offset}));setExpanded(null);setSelection([]);setContext(v=>v+1);}}/>
  </div><p className="al-footnote">하나의 정규 금융 거래를 계좌 관점으로 조회합니다. 생활 카테고리는 확정 소비·수입에만 적용하며, 환불은 원소비 분류를 참조합니다. 원본 은행 근거와 정정 이력은 보존됩니다.</p><p className="al-announcement" role="status" aria-live="polite">{message}</p>
  </>}
 </section></RecommendationProvider>;
}
function AccountPath({row,accounts,accountId}:{row:LedgerRow;accounts:Account[];accountId:string|null}){const name=(id:string|null)=>accounts.find(a=>a.id===id)?.displayName??'계좌 미확인';return <div className="al-account-path"><strong>{name(accountId??row.from_account_id??row.to_account_id)}</strong><small>{row.from_account_id&&row.to_account_id?(accountId===row.to_account_id?'← '+name(row.from_account_id):'→ '+name(row.to_account_id)):row.from_account_id?'출금 계좌':row.to_account_id?'입금 계좌':'계좌 확인 필요'}</small></div>;}
function LedgerCategory({row,categories,disabled}:{row:LedgerRow;categories:Category[];disabled:boolean}){
 const cache=useMoneyCache(),[busy,setBusy]=useState(false),[error,setError]=useState(''),inFlight=useRef(false);
 const [,setCategoryPending]=usePendingRows<CategoryPending>('ledger-category-requests');
 const setPending=(value:CategoryPending|null)=>setCategoryPending(row.id,value);
 async function save(categoryId:string){if(!categoryId||inFlight.current||disabled)return;inFlight.current=true;setBusy(true);setError('');try{
  const current=await api.get<LedgerRow>(ACCOUNT_LEDGER+'/rows/'+row.id);
  if(!current.fingerprint||current.version!==row.version||current.book?.classificationVersion!==row.book?.classificationVersion){cache.mutate('transaction');throw Error('거래 또는 분류가 변경되었습니다. 최신 값과 비교한 뒤 다시 선택하세요.');}
  const command={requestId:crypto.randomUUID(),expectedVersion:current.version,fingerprint:current.fingerprint,categoryId,expectedClassificationVersion:current.book?.classificationVersion??0,thisTransactionOnly:true};
  setPending({id:row.id,command});let outcome:UnifiedOutcome;try{outcome=await api.post(ACCOUNT_LEDGER+'/rows/'+row.id+'/category',command);}catch{outcome=await api.get('/bookkeeping/unified/outcomes/'+command.requestId);}
  if(outcome.status==='UNKNOWN'){setError('저장 결과 확인 필요 · 상단에서 원래 요청 결과를 확인하세요.');return;}setPending(null);if(outcome.status!=='APPLIED')throw Error(outcome.result?.message??'분류가 저장되지 않았습니다.');cache.mutate('book');cache.mutate('transaction');
 }catch(e){setError(e instanceof Error?e.message:'분류 저장 실패');}finally{inFlight.current=false;setBusy(false);}}
 return <><select disabled={busy||disabled} aria-label={(row.title??'거래')+' 생활 카테고리'} value={row.book?.categoryId??''} onChange={e=>void save(e.target.value)}><option value="" disabled>미분류 · 분류 선택</option>{categories.filter(c=>c.kind===row.type&&!c.archived&&!c.effectiveArchived).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{row.classificationInScope===false&&<small>가계부 추적 대상 밖 · 통계 범위 유지</small>}{error&&<small role="alert">{error}</small>}</>;
}
function LedgerBulk({selected,rows,categories,onClear}:{selected:string[];rows:LedgerRow[];categories:Category[];onClear:()=>void}){const state=useRecommendations(),[category,setCategory]=useState(''),[preview,setPreview]=useState<SavePreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const eligible=rows.filter(r=>selected.includes(r.id)&&categoryEligible(r)),excluded=selected.length-eligible.length;if(!eligible.length&&!preview)return null;return <section className="al-bulk" aria-label="카테고리만 일괄 변경"><strong>선택 {selected.length}건 · 분류 가능 {eligible.length}건 · 제외 {excluded}건</strong><select aria-label="일괄 생활 카테고리" value={category} disabled={busy||state.pending} onChange={e=>{setCategory(e.target.value);setPreview(null);}}><option value="">카테고리 선택</option>{categories.filter(c=>!c.archived&&!c.effectiveArchived).map(c=><option key={c.id} value={c.id}>{c.kind==='INCOME'?'수입':'소비'} · {c.name}</option>)}</select><button disabled={!category||busy||state.pending||state.busy} onClick={async()=>{setBusy(true);setError('');try{setPreview(await state.prepareManual(eligible.map(r=>r.id),category,false));}catch(e){setError(e instanceof Error?e.message:'일괄 확인 실패');}finally{setBusy(false);}}}>변경안 확인</button><button disabled={busy||state.pending} onClick={()=>{setPreview(null);onClear();}}>선택 해제</button>{preview&&<div role="status"><p>적용 가능 {preview.ready.length}건 · 안전 제외 {preview.excluded.length}건 · 직접 확정 분류 변경 {preview.ready.filter(i=>i.book.directProtected).length}건</p>{preview.excluded.map(i=><p key={i.id}>{i.book?.title??'선택 거래'} · {i.displayReason??i.reason}</p>)}<button disabled={busy||state.busy||state.pending||!preview.ready.length} onClick={async()=>{setBusy(true);try{if(await state.save(preview.ready.map(i=>i.command))){setPreview(null);onClear();}}finally{setBusy(false);}}}>카테고리 일괄 확정 · {preview.ready.length}건</button></div>}{error&&<p role="alert">{error}</p>}</section>;}

function LedgerText({row,field,value,disabled}:{row:LedgerRow;field:'title'|'memo';value:string;disabled:boolean}){const cache=useMoneyCache(),[editing,setEditing]=useState(false),[draft,setDraft]=useState(value),[busy,setBusy]=useState(false),[error,setError]=useState(''),baseline=useRef<LedgerRow|null>(null),inFlight=useRef(false),cancelled=useRef(false);
 const [byId,setGlobalPending]=usePendingRows<MetadataPending>('ledger-metadata-requests');
 const pending=byId[row.id]?.field===field?byId[row.id].command:null;
 const setPending=(command:MetadataPending['command']|null)=>setGlobalPending(row.id,command?{id:row.id,field,command}:null);
 async function open(){setEditing(true);cancelled.current=false;setDraft(pending?String(pending[field]??''):value);setError('');try{baseline.current=await api.get<LedgerRow>(ACCOUNT_LEDGER+'/rows/'+row.id);}catch(e){setError(e instanceof Error?e.message:'최신 거래 조회 실패');}}
 async function save(retry=false){if(inFlight.current||cancelled.current||disabled&&!pending)return;if(!pending&&draft.trim()===value.trim()){setEditing(false);return;}if(field==='title'&&!draft.trim()){setError('제목을 입력하세요.');return;}if(!pending&&!baseline.current?.fingerprint){setError('최신 거래 근거를 확인한 뒤 다시 저장하세요.');return;}inFlight.current=true;setBusy(true);try{const base=baseline.current!,command=pending??{requestId:crypto.randomUUID(),expectedVersion:base.version,fingerprint:base.fingerprint!,title:field==='title'?draft.trim():base.title??base.counterparty_text??'거래',memo:field==='memo'?draft.trim()||null:base.memo};setPending(command);let outcome:UnifiedOutcome={status:'UNKNOWN'};if(pending){outcome=await api.get('/bookkeeping/unified/outcomes/'+command.requestId);if(outcome.status==='UNKNOWN'&&!retry){setError('원래 저장 결과를 확인하지 못했습니다. 명시적으로 같은 요청 재시도를 선택하세요.');return;}}if(outcome.status==='UNKNOWN')try{outcome=await api.post(ACCOUNT_LEDGER+'/rows/'+row.id+'/metadata',command);}catch{outcome=await api.get('/bookkeeping/unified/outcomes/'+command.requestId);}if(outcome.status==='UNKNOWN'){setError('저장 결과 확인 필요 · 원래 요청으로 다시 확인하세요.');return;}setPending(null);if(outcome.status!=='APPLIED')throw Error(outcome.result?.message??'거래가 변경되어 저장하지 못했습니다.');setEditing(false);cache.mutate('transaction');}catch(e){setError(e instanceof Error?e.message:'저장 결과 확인 필요 · 원래 요청 유지');}finally{inFlight.current=false;setBusy(false);}}
 return <div className={'al-text '+field}>{editing?<><input autoFocus aria-label={(row.title??'거래')+' '+(field==='title'?'제목':'메모')+' 편집'} value={draft} readOnly={!!pending} maxLength={field==='title'?200:2000} disabled={busy} onChange={e=>setDraft(e.target.value)} onBlur={()=>void save()} onKeyDown={e=>{if(e.key==='Escape'&&!pending){cancelled.current=true;setEditing(false);setError('');}if(e.key==='Enter'){e.preventDefault();void save();}}}/>{error&&<small role="alert">{error}<button disabled={busy} onClick={()=>void save(true)}>원래 요청 확인·저장</button></small>}</>:<button type="button" disabled={disabled&&!pending} className="al-cell-button" aria-label={(row.title??'거래')+' '+(field==='title'?'제목':'메모')+' 수정'} onClick={()=>void open()}>{value|| (field==='memo'?'메모 추가':'제목 추가')}</button>}</div>;
}
