"use client";
import {useRef,useState} from 'react';
import {seoul,type Account,type Category} from '@/lib/money/model';
import type {AiItem} from '@/lib/money/ai';
import {moneyAmount} from '@/lib/money/accounts';
import {financialTypeLabels,selectFinancialOption,loanAllocation,type UnifiedRow} from '@/lib/money/unified';
import {affectedBy} from '@/lib/money/cache';
import {useMoneyCache,useMoneyRows,useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData,LoadState,type Loan} from './MoneyWebData';

type Candidate={amount:number;direction:'IN'|'OUT';occurredAt:string;postedAt:string;providerOccurredAt:string|null;timeSource:string;counterpartyText:string|null;sourceAccountHint:string|null;destinationAccountHint:string|null;provider:string};
type Partner={id:string;version:number;fingerprint:string;archived:boolean;candidate:Candidate;currency:string;reason:string};
type Existing={id:string;version:number;type:string;title:string|null;merchant:string|null;fromAccountId:string|null;toAccountId:string|null};
type Evidence={fingerprint:string;version:number;amount:number;currency:string;occurredAt:string;direction:'IN'|'OUT';candidate:Candidate;raw:{title:string;body:string};archived:boolean;manualRequired?:boolean;manualReason?:string;partners:Partner[];duplicates:Existing[]};
type Draft=Record<string,unknown>;
const label=(type:string)=>type==='UNRESOLVED'?'유형 미확정':financialTypeLabels[type]??type;

/** A complete decision rendered by the parent in the next full-width table row. */
export function ReviewFinancialInline({row,accounts,categories,disabled,onSaved,onCancel}:{row:AiItem;accounts:Account[];categories:Category[];disabled:boolean;onCancel?:()=>void;onSaved:(id:string,sourceIds:string[])=>void}){
 const cache=useMoneyCache(),coordinator=useMoneyRows(),lock=useRef(false);
 const [draft,setDraft]=useMoneyViewState<Draft>('review-financial-draft-'+row.id,()=>({type:'UNRESOLVED',accountId:row.accountId??''}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[registered,setRegistered]=useState(''),[preview,setPreview]=useState<Draft|null>(null),[search,setSearch]=useState(''),[pending,setPending]=useState(false);
 const evidence=useMoneyData<Evidence>(registered?null:'/review/owner/'+row.id),loans=useMoneyData<Loan[]>('/loans');
 const e=evidence.data,type=String(draft.type??'UNRESOLVED'),choice=String(draft.transferIntent??type),direction=String(draft.direction??e?.direction??'');
 const amount=Number(draft.amount??e?.amount??0),at=String(draft.occurredAt??(e&&!e.manualRequired?seoul(e.occurredAt).slice(0,16):''));
 const accountId=String(draft.accountId??''),otherId=String(draft.otherAccountId??''),partner=e?.partners.find(p=>p.id===draft.partnerId),loan=loans.data?.find(l=>l.id===draft.loanId);
 const currency=String(draft.currency??e?.currency??'');
 const refundAt=at?new Date(at+'+09:00'):null;
 const refunds=useMoneyData<{items:{id:string;version:number;title:string|null;merchant:string|null;amount:number;occurredAt:string}[]}>(type==='REFUND'&&/^[A-Z]{3}$/.test(currency)&&refundAt&&Number.isFinite(refundAt.getTime())?'/review/owner/'+row.id+'/refunds?'+new URLSearchParams({search,currency,occurredAt:refundAt.toISOString()}):null);
 const similar=useMoneyData<{items:Existing[]}>(e?.manualRequired&&accountId&&amount>0&&/^[A-Z]{3}$/.test(currency)&&refundAt&&Number.isFinite(refundAt.getTime())?'/review/owner/'+row.id+'/duplicates?'+new URLSearchParams({accountId,amount:String(amount),currency,occurredAt:refundAt.toISOString()}):null);
 const duplicates=e?.manualRequired?similar.data?.items??[]:e?.duplicates??[];
 const refund=refunds.data?.items.find(r=>r.id===draft.refundOf),transfer=type==='TRANSFER';
 const base={amount,principal:null,interest:null,fee:null,type:direction==='OUT'?'EXPENSE':'INCOME'} as UnifiedRow;
 const allocation=loanAllocation(base,draft),blocked=disabled||busy||pending||!!registered;
 function field(key:string,value:unknown){if(blocked)return;coordinator.keepDraft(row.id,'review',{type:choice});setDraft(old=>({...old,[key]:value}));setPreview(null);setError('');}
 function selectType(value:string){coordinator.keepDraft(row.id,'review',{type:value});setDraft(old=>{const next=selectFinancialOption(base,old,value);for(const key of ['partnerId','otherAccountId','approveArchived','categoryId','existingTransactionId'])delete next[key];return next;});setPreview(null);setError('');}
 function prepare(action:string,unresolved=false){try{
  if(!e||!accountId||!Number.isFinite(amount)||amount<=0||!at)throw Error('계좌·금액·발생시각을 확인하세요.');
  if(action==='REGISTER'&&!unresolved&&type==='LOAN_PAYMENT'&&(!loan||allocation.unknown||!allocation.valid))throw Error('대출과 원금·이자·수수료의 정확한 합계를 확인하세요.');
  if(!direction||!currency||e.manualRequired&&!String(draft.reason??'').trim())throw Error('방향·통화·확인 사유를 입력하세요.');
  if(type==='REFUND'&&draft.refundOf&&!refund)throw Error('선택한 원거래를 다시 확인하세요.');
  if(e.manualRequired&&(!e.manualReason||!draft.direction||!draft.occurredAt||!draft.reason))throw Error('원문과 비교하여 방향·실제 발생시각·사유를 확인하세요.');
  if(action==='REGISTER'&&!unresolved&&transfer&&!otherId)throw Error('상대 소유 계좌를 선택하세요.');
  const linking=action==='LINK_DUPLICATE';
  setPreview({fingerprint:e.fingerprint,action,accountId,accountVersion:accounts.find(a=>a.id===accountId)?.version,
   otherAccountId:transfer&&!unresolved?otherId:null,otherAccountVersion:accounts.find(a=>a.id===otherId)?.version,
   existingTransactionId:linking?draft.existingTransactionId:null,existingTransactionVersion:duplicates.find(t=>t.id===draft.existingTransactionId)?.version,
   financial:{type:unresolved?'UNRESOLVED':choice,currency:draft.currency??e.currency,direction,amount,occurredAt:draft.occurredAt?new Date(at+'+09:00').toISOString():e.occurredAt,reason:draft.reason||null,title:draft.title||null,memo:draft.memo||null,categoryId:!unresolved&&!linking?draft.categoryId||null:null,
    loanId:['LOAN_PAYMENT','LOAN_RECEIPT'].includes(type)&&!unresolved&&!linking?loan?.id:null,loanVersion:loan?.version,principal:type==='LOAN_PAYMENT'&&!unresolved?draft.principal:null,interest:type==='LOAN_PAYMENT'&&!unresolved?draft.interest:null,fee:type==='LOAN_PAYMENT'&&!unresolved?draft.fee:null,
    refundOf:type==='REFUND'&&!unresolved?refund?.id:null,refundVersion:refund?.version,partnerId:transfer&&!unresolved?partner?.id:null,partnerVersion:partner?.version,partnerFingerprint:partner?.fingerprint,approveArchived:!!draft.approveArchived}});setError('');
 }catch(error){setError(error instanceof Error?error.message:'입력값을 확인하세요.');}}
 async function confirm(){if(!preview||lock.current||disabled)return;lock.current=true;setBusy(true);setError('');try{
  const result=await coordinator.execute<{transactionId:string;sourceIds?:string[]}>('owner-review:'+row.id,'/review/owner/'+row.id,preview);
  const sources=result.sourceIds??[row.id];
  setPending(false);setRegistered(result.transactionId);setPreview(null);cache.invalidate(key=>affectedBy('reviewItem',key)&&!sources.some(id=>key.startsWith('/review/owner/'+id)));cache.mutate('loan');coordinator.discardDraft(row.id,'review');onSaved(result.transactionId,sources);
 }catch(error){setPending(!!error&&typeof error==='object'&&'pending' in error);setError(error instanceof Error?error.message:'처리 결과를 확인하세요.');cache.invalidate(key=>key.includes('/review/owner/'));}finally{setBusy(false);lock.current=false;}}
 function input(key:string,title:string,kind='text',value?:unknown){return <label>{title}<input type={kind} value={String(draft[key]??value??'')} onChange={event=>field(key,event.target.value)}/></label>;}
 function accountOptions(exclude?:string){return accounts.filter(a=>!a.archived&&a.id!==exclude).map(a=><option key={a.id} value={a.id}>{a.displayName}</option>);}
 return <section className="money-review-inline" aria-label="소유자 금융 판단"><header><strong>금융 판단 · 가계부 반영</strong><span>은행 원문과 정정안을 비교하고 한 번에 확정합니다.</span></header><LoadState loading={evidence.loading} error={evidence.error}/>{e&&<>
  <div className="money-review-evidence"><div><h3>은행 원문 · 변경되지 않음</h3><p>{e.raw.title}</p><p>{e.raw.body}</p><p>{e.amount==null?'금액 미확인':moneyAmount(e.amount,e.currency)} · {e.direction==='OUT'?'출금':e.direction==='IN'?'입금':'방향 미확인'}</p><small>은행 {e.candidate.providerOccurredAt?seoul(e.candidate.providerOccurredAt):'시각 없음'} · 관측 {seoul(e.candidate.postedAt)} · {e.candidate.timeSource}</small></div><div><h3>소유자 정정안</h3><p>{label(choice)} · {moneyAmount(amount,currency)} · {direction==='OUT'?'출금':direction==='IN'?'입금':'방향 확인 필요'}</p><p>{accounts.find(a=>a.id===accountId)?.displayName||'소유 계좌 선택 필요'}{transfer&&' ↔ '+(accounts.find(a=>a.id===otherId)?.displayName||'상대 계좌 선택 필요')}</p><p>{at.replace('T',' ')} (서울)</p></div></div>
  {e.manualRequired&&<p>원본 ID {row.id} · 파싱 사유 {row.reason}</p>}
  {e.manualRequired&&<p role="status">{e.manualReason} 원문과 비교하여 계좌·통화·금액·방향·실제 시각을 직접 확인하고 사유를 남기세요.</p>}<fieldset disabled={blocked}><legend>금융 사실과 의미</legend><div className="money-review-fields">
   <label>거래 유형<select value={transfer?'TRANSFER':type==='UNRESOLVED'?'':direction} onChange={event=>{
    const value=event.target.value;
    coordinator.keepDraft(row.id,'review',{type:value});
    setDraft(old=>({...old,type:value==='IN'?'INCOME':value==='OUT'?'EXPENSE':value==='TRANSFER'?'TRANSFER':'UNRESOLVED',
      direction:value==='TRANSFER'?e.direction??'':value,otherAccountId:null,categoryId:null,refundOf:null,loanId:null,transferIntent:undefined,partnerId:null,existingTransactionId:null}));setPreview(null);
   }}><option value="">선택</option><option value="IN">입금</option><option value="OUT">출금</option><option value="TRANSFER">이체</option></select></label>
   {type!=='UNRESOLVED'&&<details><summary>세부 금융 유형</summary><label>금융 의미<select aria-label="Financial Type · 금융 유형" value={choice} onChange={event=>selectType(event.target.value)}>
    {(transfer?['TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL']:direction==='IN'?['INCOME','REFUND','LOAN_RECEIPT']:['EXPENSE','LOAN_PAYMENT']).map(t=><option key={t} value={t}>{label(t)}</option>)}</select></label></details>}
   <label>Category · 분류<select aria-label="Category · 분류" value={String(draft.categoryId??'')} onChange={event=>field('categoryId',event.target.value)} disabled={!['EXPENSE','INCOME'].includes(type)}><option value="">미분류 · 선택 없이 등록 가능</option>{categories.filter(c=>!c.archived&&!c.effectiveArchived&&(c.kind??'EXPENSE')===type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>내 소유 계좌<select aria-label="내 소유 계좌" value={accountId} onChange={event=>field('accountId',event.target.value)}><option value="">계좌 선택</option>{accountOptions()}</select></label>
   {transfer&&<label>입출금 방향<select aria-label="입출금 방향" value={direction} onChange={event=>field('direction',event.target.value)}><option value="">방향 확인</option><option value="OUT">출금</option><option value="IN">입금</option></select></label>}
   {e.manualRequired&&input('currency','원문 통화 (예: KRW)','text',e.currency)}{input('amount','금액 ('+(currency||'통화 확인')+')','number',e.amount)}{input('occurredAt','발생시각 (서울)','datetime-local',at)}{input('title','제목')}{input('memo','메모')}
  </div>
  {transfer&&<div className="money-review-fields"><label>상대 소유 계좌<select aria-label="상대 소유 계좌" value={otherId} onChange={event=>field('otherAccountId',event.target.value)}><option value="">다른 소유 계좌 선택</option>{accountOptions(accountId)}</select></label><label>함께 연결할 반대 방향 RAW<select aria-label="함께 연결할 반대 방향 RAW" value={String(draft.partnerId??'')} onChange={event=>field('partnerId',event.target.value)}><option value="">상대 원문 선택 · 후보 {e.partners.length}건</option>{e.partners.map(p=><option key={p.id} value={p.id}>{p.archived?'[제외] ':''}{p.candidate.provider} · {p.candidate.direction} · {moneyAmount(p.candidate.amount,p.currency)} · {p.candidate.counterpartyText}</option>)}</select></label>{partner&&<p>{partner.reason}<br/>{partner.candidate.sourceAccountHint||partner.candidate.destinationAccountHint} · 은행 {partner.candidate.providerOccurredAt?seoul(partner.candidate.providerOccurredAt):'시각 없음'} · 관측 {seoul(partner.candidate.postedAt)}</p>}<p>두 원문은 이체 한 건에 연결됩니다. 저축 표시는 발생일의 계좌 자금 그룹으로 검증합니다.</p></div>}
  {['LOAN_PAYMENT','LOAN_RECEIPT'].includes(type)&&<div className="money-review-fields"><label>대출<select aria-label="대출" value={String(draft.loanId??'')} onChange={event=>field('loanId',event.target.value)}><option value="">대출 선택</option>{loans.data?.filter(l=>l.status!=='INACTIVE').map(l=><option key={l.id} value={l.id}>{l.name} · 잔여 원금 {moneyAmount(l.remainingPrincipal,'KRW')}</option>)}</select></label>{type==='LOAN_PAYMENT'&&<>{input('principal','원금','number')}{input('interest','이자','number')}{input('fee','수수료','number')}</>}{type==='LOAN_RECEIPT'&&<p>대출 입금은 미상환 원금에 한 번 반영하고 수입으로 집계하지 않습니다.</p>}<p>원금만 부채를 줄이며 상환액 전체는 소비에서 제외합니다. 배분 합계 {moneyAmount(allocation.total,e.currency)}</p></div>}
  {type==='REFUND'&&<div><label>환불 원거래 검색<input value={search} onChange={event=>setSearch(event.target.value)}/></label><label>확정 소비 원거래<select aria-label="확정 소비 원거래" value={String(draft.refundOf??'')} onChange={event=>field('refundOf',event.target.value)}><option value="">원거래 연결 대기</option>{refunds.data?.items.map(r=><option key={r.id} value={r.id}>{seoul(r.occurredAt)} · {r.title||r.merchant} · {moneyAmount(r.amount,e.currency)}</option>)}</select></label><p>구매액 초과 환불은 확정되지 않습니다. 원거래를 모르면 확인된 현금만 등록하세요.</p></div>}
  <label>정정·별도 거래 확정 사유<textarea value={String(draft.reason??'')} onChange={event=>field('reason',event.target.value)} placeholder="원래 금액·방향·계좌·시각과 다르면 근거를 설명하세요."/></label>
  {(e.archived||partner?.archived)&&<label><input type="checkbox" checked={!!draft.approveArchived} onChange={event=>field('approveArchived',event.target.checked)}/>제외된 원문을 이 금융 판단에 연결하는 데 동의합니다.</label>}
  <div className="money-actions">{onCancel&&<button onClick={()=>{if(Object.keys(draft).length>2&&!window.confirm('입력한 초안을 버릴까요?'))return;
   setDraft({type:'UNRESOLVED',accountId:row.accountId??''});coordinator.discardDraft(row.id,'review');setPreview(null);onCancel();}}>취소</button>}<button onClick={()=>prepare('REGISTER')}>거래 확정 · 가계부 반영 미리보기</button><button onClick={()=>prepare('REGISTER',true)}>확인된 현금만 등록 · 유형 미확정</button></div>
  <LoadState loading={similar.loading} error={similar.error}/>{!!duplicates.length&&<div><label>기존 거래·출처 연결<select aria-label="기존 거래·출처 연결" value={String(draft.existingTransactionId??'')} onChange={event=>field('existingTransactionId',event.target.value)}><option value="">동일 사실의 기존 거래 선택</option>{duplicates.map(t=><option key={t.id} value={t.id}>{financialTypeLabels[t.type]} · {t.title||t.merchant||t.id}</option>)}</select></label><button disabled={!draft.existingTransactionId} onClick={()=>prepare('LINK_DUPLICATE')}>기존 거래 연결 미리보기</button></div>}
  </fieldset>
  {preview&&<div className="money-review-impact" role="region" aria-label="금융 영향 미리보기"><h3>확정 전 금융 영향</h3><p>{preview.action==='LINK_DUPLICATE'?'기존 거래에 원문만 연결 · 추가 현금 이동 없음':label(String((preview.financial as Draft).type))+' · '+moneyAmount(amount,currency)+' · '+(direction==='OUT'?'출금':'입금')}</p><p>{String((preview.financial as Draft).type)==='UNRESOLVED'?'잔액 반영 · 수입·소비·저축·대출·환불 통계 미확정':type==='LOAN_PAYMENT'?'원금 '+String(draft.principal)+' / 이자 '+String(draft.interest)+' / 수수료 '+String(draft.fee)+' · 상환액 전체 소비 제외':transfer?'이체 한 건 · 선택된 모든 원문 연결 · 수입·소비 중복 없음':type==='REFUND'?(refund?'원소비의 추적 자격에 따라 환불월 소비에서 차감':'원거래 연결 대기 · 소비 차감 보류')+' · 수입 집계 제외':'선택한 금융 유형으로 한 건 반영'}</p><p>연결 원본 {row.id} · {currency} · {at} (서울)</p><p>원문과 정정 이력을 보존합니다. 서버가 최신 버전과 금융 근거를 다시 검증합니다.</p><button className="money-primary" disabled={disabled||busy||!!registered} onClick={()=>void confirm()}>{pending?'원래 요청 결과 확인 · 같은 요청 재시도':'거래 확정 · 가계부 반영'}</button><button disabled={busy||pending} onClick={()=>setPreview(null)}>계속 수정</button></div>}
 </>}{busy&&<p role="status">금융 판단 처리·결과 확인 중…</p>}{error&&<p role="alert">{error} 초안은 유지됩니다.</p>}{registered&&<p role="status">가계부 반영 완료 <a href={'/money/bookkeeping?transactionId='+registered}>확정 거래 보기</a></p>}</section>;
}
