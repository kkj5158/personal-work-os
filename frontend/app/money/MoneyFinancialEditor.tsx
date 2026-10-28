"use client";
import {useRef,useState} from 'react';
import {moneyApi as api,seoul,type Account} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {UNIFIED,typeLabels,financialTypeLabels,financialLabel,financialOptions,selectFinancialOption,allowedTypes,submitUnified,financialDraftValue,financialCommandFields,loanAllocation,type UnifiedRow,type UnifiedOutcome,type PendingSave} from '@/lib/money/unified';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';
import {LoadState,useMoneyData,type Loan} from './MoneyWebData';
import {MoneyAnchoredPopover} from './MoneyCategoryTree';

const descriptions:Record<string,string>={EXPENSE:'일반 결제·지출',INCOME:'생활 수입',TRANSFER:'내 계좌 간 이동',SAVINGS:'일반 → 저축 계좌',SAVINGS_WITHDRAWAL:'저축 → 일반 계좌',REFUND:'원거래 환불',LOAN_PAYMENT:'원금·이자 납입'};
const icons:Record<string,string>={EXPENSE:'↗',INCOME:'↙',TRANSFER:'⇄',SAVINGS:'↓',SAVINGS_WITHDRAWAL:'↑',REFUND:'↩',LOAN_PAYMENT:'▤'};

export function UnifiedFinancialAction({id,accounts,label}:{id:string;accounts:Account[];label?:string}){
 const cache=useMoneyCache(),inFlight=useRef(false),saving=useRef(false);
 const [open,setOpen]=useState(false),[row,setRow]=useState<UnifiedRow|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useMoneyViewState<Record<string,unknown>>('unified-draft-'+id,()=>({}));
 const [baseVersion,setBaseVersion]=useMoneyViewState<number|null>('unified-draft-version-'+id,()=>null);
 const [pending,setPending]=useMoneyViewState<PendingSave|null>('unified-operation-'+id,()=>null);
 const [conflict,setConflict]=useState<UnifiedRow|null>(null),[undo,setUndo]=useState<string|null>(null),[message,setMessage]=useState('');
 const [candidateSearch,setCandidateSearch]=useState('');
 const loans=useMoneyData<Loan[]>(open?'/loans':null);
 const type=String(draft.type??row?.type??''),linked=!!row?.from_account_id&&!!row?.to_account_id;
 const candidates=useMoneyData<{items:{id:string;version:number;title:string|null;counterpartyText:string|null;amount:number;occurredAt:string;accountId:string;transferDisplayType?:string}[]}>(open&&row&&['TRANSFER','REFUND'].includes(type)&&!linked?UNIFIED+'/candidates/'+id+'?'+new URLSearchParams({kind:type,search:candidateSearch}):null);
 const choice=String(draft.transferIntent??type);
 const transferCandidates=candidates.data?.items.filter(c=>!draft.transferIntent||c.transferDisplayType===draft.transferIntent);
 const allocation=row?loanAllocation(row,draft):{unknown:true,valid:false,total:0};
 const loanId=String(financialDraftValue(draft,'loanId',row?.loan_id)??'');
 const loan=loans.data?.find(value=>value.id===loanId);
 const loanReady=!!loan&&loan.status!=='INACTIVE'&&!loans.loading&&!loans.error&&(!row?.loan_id||row.type!=='LOAN_PAYMENT'||loanId===row.loan_id);
 const typeReady=!!row&&allowedTypes(row).includes(type)&&(type!=='LOAN_PAYMENT'||loanReady&&allocation.valid)&&!(type==='TRANSFER'&&(draft.otherId||draft.transferIntent));
 const disabled=busy||!!pending||!!conflict;
 const close=()=>{if(!saving.current&&!pending)setOpen(false);};
 function stage(update:(old:Record<string,unknown>)=>Record<string,unknown>){
  if(!row||disabled)return;
  if(baseVersion===null)setBaseVersion(row.version);
  setDraft(update);setError('');setMessage('');
 }
 const field=(key:string,value:unknown)=>stage(old=>({...old,[key]:value}));
 async function load(){
  if(inFlight.current)return;
  inFlight.current=true;setOpen(true);setBusy(true);setError('');setMessage('');setConflict(null);setRow(null);
  try{
   const latest=await api.get<UnifiedRow>(UNIFIED+'/rows/'+id);setRow(latest);
   if(Object.keys(draft).length&&!pending&&(baseVersion===null||baseVersion!==latest.version))setConflict(latest);
  }catch(e){setError(e instanceof Error?e.message:'거래 조회 실패');}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function accept(result:UnifiedOutcome){
  if(result.status==='UNKNOWN'){setMessage('저장 결과 확인 필요 · 초안을 보존했습니다. 같은 요청으로 확인·재시도하세요.');return;}
  setPending(null);
  if(result.status==='NOT_APPLIED'){
   setError(result.result?.message??'변경하지 못했습니다.');
   if(result.result?.reason==='VERSION_CONFLICT'){
    cache.mutate('loan');
    // Keep writes locked even when fetching the comparison fails.
    setConflict(row);
    try{setConflict(await api.get<UnifiedRow>(UNIFIED+'/rows/'+id));}catch{setError('최신 거래 조회 실패 · 다시 열어 최신 상태를 확인하세요.');setRow(null);}
   }
   return;
  }
  setUndo(result.result?.undoId??null);setDraft({});setBaseVersion(null);setConflict(null);setError('');
  cache.mutate('transaction');
  if(result.result?.row)setRow(result.result.row);
  else{setRow(null);try{setRow(await api.get<UnifiedRow>(UNIFIED+'/rows/'+id));}catch{setError('저장은 완료되었지만 최신 거래 조회에 실패했습니다. 다시 열어 확인하세요.');}}
  setMessage('서버에 저장했습니다.');
 }
 async function run(action:string,extra:Record<string,unknown>={}){
  if(!row||disabled||inFlight.current||action==='TYPE'&&!typeReady)return;
  inFlight.current=true;saving.current=true;setBusy(true);setError('');setMessage('');
  const fields=financialCommandFields(row,draft,action);
  if(action==='TYPE'&&type==='LOAN_PAYMENT')Object.assign(fields,{loanId,loanVersion:draft.loanVersion??loan?.version});
  const operation={id,command:{...fields,...extra,action,requestId:crypto.randomUUID(),expectedVersion:row.version}};
  if(baseVersion===null)setBaseVersion(row.version);
  setPending(operation);
  try{await accept(await submitUnified(operation,(path,body)=>api.post(path,body),path=>api.get(path)));}
  finally{inFlight.current=false;saving.current=false;setBusy(false);}
 }
 async function recover(replay=false){
  if(!pending||inFlight.current)return;
  inFlight.current=true;saving.current=true;setBusy(true);setMessage('');
  try{await accept(replay?await submitUnified(pending,(path,body)=>api.post(path,body),path=>api.get(path)):await api.get<UnifiedOutcome>(UNIFIED+'/outcomes/'+pending.command.requestId));}
  catch{setMessage('결과 확인 필요 · 원래 요청과 초안을 유지합니다.');}
  finally{inFlight.current=false;saving.current=false;setBusy(false);}
 }
 return <span className="money-unified-action"><button type="button" className="money-financial-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={label??'금융 유형 정정'} onClick={()=>void load()}>{label??'금융 유형'} <span aria-hidden="true">⌄</span></button>{open&&
 <MoneyAnchoredPopover label="금융 유형 편집" className="money-financial-popover" focusTarget="[aria-label='금융 편집 닫기']" clampHeight onClose={close}>
  <div className="money-financial-heading"><div><h2>금융 유형 변경</h2><small>실제 거래의 성격을 지정합니다.</small></div><button type="button" disabled={!!pending} aria-label="금융 편집 닫기" onClick={close}>×</button></div>
  {(busy||error)&&<LoadState loading={busy} error={error}/>}
  {row&&<>
   <div className="money-financial-summary"><div><strong>{row.title??row.counterparty_text??'거래'}</strong><small>{accounts.find(a=>a.id===(row.from_account_id??row.to_account_id))?.displayName??'계좌 미확인'} · {seoul(row.occurred_at).replace('T',' ')}</small></div><strong>{row.amount===0?'':(row.from_account_id?-row.amount:row.amount)<0?'−':'+'}{moneyAmount(Math.abs(row.amount),row.currency)}</strong></div>
   <fieldset disabled={disabled} className="money-unified-fields">
    <section className="money-financial-types"><h3>어떤 거래인가요?</h3>{allowedTypes(row).length>0?<div className="money-financial-choice-grid" role="group" aria-label="금융 유형 선택">{financialOptions(row).map(t=><button type="button" key={t} aria-pressed={choice===t} className={'money-financial-choice '+(choice===t?'selected':'')} onClick={()=>stage(old=>selectFinancialOption(row,old,t))}><span className="money-financial-icon" aria-hidden="true">{icons[t]??'·'}</span><span><strong>{financialTypeLabels[t]}</strong><small>{descriptions[t]}</small></span></button>)}</div>:<p>현재 유형: {financialLabel(row)} · {linked?"거래 발생 시점 자금 구역 기준":"별도 정정이 필요한 거래입니다."}</p>}</section>
    {type==='LOAN_PAYMENT'&&<>
     <h3 className="money-financial-subheading">대출 상환 정보</h3>
     <label>대출<select aria-label="상환 대출" value={loanId} disabled={row.type==='LOAN_PAYMENT'} onChange={e=>{const selected=loans.data?.find(l=>l.id===e.target.value);stage(old=>({...old,loanId:e.target.value,loanVersion:selected?.version}));}}><option value="">대출 선택</option>{loans.data?.filter(l=>l.status!=='INACTIVE'||l.id===row.loan_id).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
     {(loans.loading||loans.error)&&<LoadState loading={loans.loading} error={loans.error}/>}
     <small>세 칸을 모두 비우면 상환 배분 미확정입니다. 확정 원금은 부채 감소, 확정 이자·수수료만 소비에 반영됩니다.</small>
     <div className="money-financial-split-grid">{(['principal','interest','fee'] as const).map((key,i)=><label key={key}>{['원금','이자','수수료'][i]}<input aria-label={['원금','이자','수수료'][i]} type="number" min="0" step="0.01" value={String(financialDraftValue(draft,key,row[key])??'')} onChange={e=>field(key,e.target.value===''?null:e.target.value)}/></label>)}</div>
     <small role="status" className={allocation.valid?'money-financial-allocation-ok':'money-financial-allocation-error'}>{allocation.unknown?'상환 배분 미확정 · 출금 '+moneyAmount(row.amount,row.currency):'배분 합계 '+moneyAmount(allocation.total,row.currency)+' / 출금 '+moneyAmount(row.amount,row.currency)}{!allocation.valid?' · 세 금액을 모두 0 이상, 소수 둘째 자리까지 입력하고 합계를 출금액과 맞춰 주세요.':''}{!loanReady&&!loans.loading?' · 비활성 대출은 대출 정보에서 상환 중으로 변경한 뒤 같은 거래를 정정하세요.':''}</small>
    </>}
    {!!draft.transferIntent&&<p role="status">{choice==='SAVINGS'?'일반 계좌에서 저축 계좌로':'저축 계좌에서 일반 계좌로'} 이동한 실제 반대편 거래를 확인하세요. 연결 전에는 순저축에 반영하지 않습니다.</p>}
    {['REFUND','TRANSFER'].includes(type)&&!linked&&<>
     <h3 className="money-financial-subheading">{type==='REFUND'?'원거래 연결':'실제 반대편 거래 연결'}</h3>
     <label>연결할 실제 거래 검색<input aria-label="연결 거래 검색" value={candidateSearch} onChange={e=>setCandidateSearch(e.target.value)}/></label>
     <label>{type==='REFUND'?'원래 구매 거래':'실제 반대편 입출금'}<select aria-label="연결할 실제 거래" value={String((type==='REFUND'?financialDraftValue(draft,'refundOf',row.refund_of):draft.otherId)??'')} onChange={e=>stage(old=>({...old,[type==='REFUND'?'refundOf':'otherId']:e.target.value||null,otherVersion:candidates.data?.items.find(i=>i.id===e.target.value)?.version}))}><option value="">연결 대기 · 거래 선택</option>{transferCandidates?.map(c=><option key={c.id} value={c.id}>{seoul(c.occurredAt)} · {c.title??c.counterpartyText??'거래'} · {moneyAmount(c.amount,row.currency)} · {accounts.find(a=>a.id===c.accountId)?.displayName}</option>)}</select></label>
     <small>{type==='REFUND'?'실제 원구매임을 확인한 경우에만 선택하세요. 입금 월에 소비 차감 · 구매액 초과 연결 금지':'후보는 자동 연결 근거가 아닙니다. 실제 양쪽 소유 계좌 거래인지 확인한 뒤 아래 연결 버튼으로 저장하세요.'}</small>
     {type==='TRANSFER'&&draft.otherId!=null&&<button type="button" disabled={candidates.loading||!!candidates.error||!draft.otherVersion&&draft.otherVersion!==0} onClick={()=>void run('LINK_TRANSFER',{reason:'사용자가 실제 양쪽 소유 계좌 거래를 확인하여 연결'})}>확인한 실제 거래 연결</button>}
     {(candidates.loading||candidates.error)&&<LoadState loading={candidates.loading} error={candidates.error}/>}
    </>}
    {row.type==='TRANSFER'&&!linked&&<p>받는 계좌 미확정 · 실제 반대편 입금 거래를 연결하면 해당 계좌와 순저축을 계산합니다.</p>}
    <details className="money-financial-advanced"><summary>원본 및 고급 금융 정정</summary><p>원본 {row.sourceCount}건 · {row.sources.map(s=>s.raw_event_id).join(' · ')||'수동 등록'}</p><p>현재 원거래: {row.refund_of??'없음'} · 거래 버전 {row.version}</p>
     <label>반대편 거래 ID<input aria-label="연결 대상 ID" value={String(draft.otherId??'')} onChange={e=>stage(old=>({...old,otherId:e.target.value,otherVersion:undefined}))}/></label><label>대상 버전<input aria-label="연결 대상 버전" type="number" min="0" value={String(draft.otherVersion??'')} onChange={e=>field('otherVersion',e.target.value===''?undefined:Number(e.target.value))}/></label>
     <label>근거·정정 사유<input aria-label="금융 정정 사유" value={String(draft.reason??'')} onChange={e=>field('reason',e.target.value)}/></label>
     {!linked&&!draft.transferIntent&&allowedTypes(row).length>0&&row.type!=='LOAN_PAYMENT'&&<button type="button" disabled={!draft.otherId||!Number.isInteger(draft.otherVersion)||!String(draft.reason??'').trim()} onClick={()=>void run('LINK_TRANSFER')}>실제 반대편 거래 연결</button>}
     {linked&&<button type="button" onClick={()=>void run('UNLINK_TRANSFER')}>이체 연결 해제</button>}
     <label>동일 금융 사실의 원본 알림 ID<input aria-label="원본 알림 ID" value={String(draft.sourceId??'')} onChange={e=>stage(old=>({...old,sourceId:e.target.value,sourceVersion:undefined}))}/></label><label>원본 알림 처리 버전<input aria-label="원본 알림 처리 버전" type="number" min="0" step="1" value={String(draft.sourceVersion??'')} onChange={e=>field('sourceVersion',e.target.value===''?undefined:Number(e.target.value))}/></label><button type="button" disabled={!draft.sourceId||!Number.isInteger(draft.sourceVersion)||Number(draft.sourceVersion)<0||!String(draft.reason??'').trim()} onClick={()=>void run('ATTACH_SOURCE')}>동일 금융 사실 알림 연결</button>
     {!['INITIAL_BALANCE','BALANCE_ADJUSTMENT'].includes(row.type)&&!linked&&<>
      <label>정정 계좌<select aria-label="정정 계좌" value={String(draft.accountId??row.from_account_id??row.to_account_id??'')} onChange={e=>field('accountId',e.target.value)}>{accounts.filter(a=>!a.archived||a.id===row.from_account_id||a.id===row.to_account_id).map(a=><option key={a.id} value={a.id}>{a.displayName}</option>)}</select></label><label>실제 금액<input aria-label="정정 금액" type="number" step="0.01" value={String(draft.amount??row.amount)} onChange={e=>field('amount',Number(e.target.value))}/></label><label>발생시각<input aria-label="정정 발생시각" value={String(draft.occurredAt??row.occurred_at)} onChange={e=>field('occurredAt',e.target.value)}/></label><button type="button" disabled={!String(draft.reason??'').trim()} onClick={()=>void run('CORRECT')}>금융 사실 정정</button>
     </>}
     <a href={'/money/reconciliation?accountId='+(row.from_account_id??row.to_account_id)}>기존 잔액 점검 열기</a>
    </details>
   </fieldset>
   <div className="money-financial-footer"><span>원본 거래는 유지됩니다.</span><button type="button" disabled={busy||!!pending} onClick={close}>취소</button>{!linked&&allowedTypes(row).length>0&&<button type="button" disabled={disabled||!typeReady} onClick={()=>void run('TYPE')}>변경 저장</button>}</div>
   {undo&&<button type="button" disabled={disabled} onClick={()=>void run('UNDO_UNLINK',{undoId:undo})}>연결 해제 Undo</button>}
   {conflict&&<div role="alert"><strong>다른 기기에서 변경되었습니다.</strong><p>서버 최신: {typeLabels[conflict.type]} · {moneyAmount(conflict.amount,conflict.currency)} · 버전 {conflict.version}{type==='LOAN_PAYMENT'&&loan?' · 대출 '+loan.name+' 버전 '+loan.version:''}</p><p>내 제안: {JSON.stringify(draft)}</p><button type="button" disabled={busy||type==='LOAN_PAYMENT'&&loans.loading} onClick={()=>{setRow(conflict);setBaseVersion(conflict.version);if(type==='LOAN_PAYMENT')setDraft(old=>({...old,loanVersion:loan?.version}));setConflict(null);setError('최신 버전을 확인했습니다. 제안을 검토한 뒤 다시 저장하세요.');}}>최신 값과 비교 후 재적용 준비</button></div>}
  </>}
  {pending&&<div role="status">저장 결과 확인 필요 <button type="button" disabled={busy} onClick={()=>void recover()}>처리 결과 확인</button><button type="button" disabled={busy} onClick={()=>void recover(true)}>같은 요청 재시도</button></div>}
  {message&&<p role="status">{message}</p>}
 </MoneyAnchoredPopover>}</span>;
}
