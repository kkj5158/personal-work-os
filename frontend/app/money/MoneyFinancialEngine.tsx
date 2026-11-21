"use client";

import {useRef,useState} from 'react';
import {moneyApi as api,seoul} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {ledgerTypes,type LedgerRow} from '@/lib/money/accountLedger';
import type {UnifiedOutcome} from '@/lib/money/unified';
import {useMoneyCache,useMoneyViewState} from './MoneyDataProvider';
import {LoadState,useMoneyData} from './MoneyWebData';

const root='/financial-engine';
const take=25;
type Candidate={id:string;version:number;occurredAt:string;currency:string;amount:number;currentType:string;proposedType:string|null;decision:string;reason:string;evidence:Record<string,string|number>};
type Page={total:number;items:Candidate[]};
type Status={engineVersion:string;autoConfirmEnabled:boolean;unresolvedCount:number;commandOutcomes:{command:string;status:string;count:number}[]};
type Shadow=Page&{id?:string;evaluated:number;fingerprint:string;distribution:Record<string,number>;truncated:boolean;cashDelta:number};
type Rule={id:string;basisId:string;basisVersion:number;version:number;merchantKey:string;provider:string;direction:string;active:boolean};
type PendingRule={requestId:string;basisId:string;expectedBasisVersion:number;expectedRuleVersion:number;active:boolean};

const decisions:Record<string,string>={
  AUTO_CONFIRM_ELIGIBLE:'자동 확정 요건 충족',
  PROPOSE_ONLY:'확정 후보',
  REVIEW_REQUIRED:'추가 검토',
};
const reasons:Record<string,string>={
  OWNER_DECISION_PROTECTED:'기존 직접 결정 보호',
  INACTIVE_OR_CONFIRMED:'이미 확정되었거나 제외됨',
  CANONICAL_FINANCIAL_REVIEW_REQUIRED:'연결 금융 거래 상세 검토',
  SOURCE_INCOMPLETE_OR_CONFLICTED:'원본 근거 부족 또는 충돌',
  NO_CURRENT_APPROVED_RULE:'승인된 규칙 없음',
  EXACT_OWNER_RULE_AND_SOURCE:'입출금 근거와 승인 규칙 일치',
  AMBIGUOUS_TRANSFER_PAIR:'이체 반대편 후보가 여러 건',
  TRANSFER_COUNTERPART_PROTECTED:'반대편 거래의 기존 결정 보호',
};

export function MoneyFinancialEngine({rows}:{rows:LedgerRow[]}){
  const cache=useMoneyCache();
  const [offset,setOffset]=useState(0);
  const [readOnlyPreview,setReadOnlyPreview]=useState(false);
  const [shadowId,setShadowId]=useMoneyViewState<string|null>('financial-shadow-id',()=>null);
  const [pendingShadow,setPendingShadow]=useMoneyViewState<string|null>('financial-shadow-pending',()=>null);
  const [pendingRule,setPendingRule]=useMoneyViewState<PendingRule|null>('financial-rule-pending',()=>null);
  const [busy,setBusy]=useState(false),lock=useRef(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [basisId,setBasisId]=useState('');
  const status=useMoneyData<Status>(root+'/status');
  const rules=useMoneyData<{items:Rule[]}>(root+'/rules');
  const showingSnapshot=readOnlyPreview||!!shadowId;
  const pagination='?limit='+take+'&offset='+offset;
  const shadow=useMoneyData<Shadow>(readOnlyPreview?root+'/backfill-preview'+pagination:shadowId?root+'/shadow-runs/'+shadowId+pagination:null);
  const candidates=useMoneyData<Page>(showingSnapshot?null:root+'/candidates'+pagination);
  const page=showingSnapshot?shadow:candidates;
  const total=showingSnapshot?shadow.data?.evaluated??0:candidates.data?.total??0;
  const basisRows=rows.filter(row=>row.meaningOrigin==='OWNER');
  const basis=basisRows.find(row=>row.id===basisId);

  async function startShadow(){
    if(lock.current||pendingRule)return;
    lock.current=true;
    setBusy(true);
    setError('');
    const requestId=pendingShadow??crypto.randomUUID();
    setPendingShadow(requestId);
    try{
      const result=await api.post<Shadow>(root+'/shadow-runs',{requestId});
      if(!result.id)throw new Error('Shadow 실행 ID를 확인하지 못했습니다.');
      setReadOnlyPreview(false);
      setOffset(0);
      setShadowId(result.id);
      setPendingShadow(null);
      setMessage('Shadow 결과를 저장했습니다.');
    }catch(e){
      setError(e instanceof Error?e.message:'Shadow 실행 결과를 확인하지 못했습니다.');
    }finally{
      setBusy(false);
      lock.current=false;
    }
  }

  async function saveRule(command:PendingRule){
    if(lock.current||pendingShadow)return;
    lock.current=true;
    setBusy(true);
    setError('');
    setMessage('');
    setPendingRule(command);
    try{
      let result:UnifiedOutcome;
      try{ result=await api.post<UnifiedOutcome>(root+'/rules',command); }
      catch{ result=await api.get<UnifiedOutcome>('/bookkeeping/unified/outcomes/'+command.requestId); }
      if(result.status==='UNKNOWN'){
        setMessage('규칙 저장 결과가 확인되지 않았습니다. 같은 요청으로 복구할 수 있습니다.');
        return;
      }
      setPendingRule(null);
      if(result.status!=='APPLIED'){
        setError(result.result?.message??'현재 거래와 규칙 버전을 확인하세요.');
        return;
      }
      cache.invalidate(key=>key.startsWith(root+'/')&&!key.includes('/shadow-runs/'));
      setMessage(command.active?'자동분류 규칙을 등록했습니다.':'자동분류 규칙을 중지했습니다.');
    }catch(e){
      setError(e instanceof Error?e.message:'규칙 저장 결과를 확인하지 못했습니다.');
    }finally{
      setBusy(false);
      lock.current=false;
    }
  }

  return <section className="al-engine" aria-label="금융유형 자동분류 엔진">
    <div className="al-engine-header">
      <div>
        <h2>금융유형 자동분류</h2>
        <p>정규 거래와 은행 근거를 비교하고, 직접 확정한 결정과 승인한 규칙을 우선합니다.</p>
      </div>
      <div className="al-engine-actions">
        <button type="button" disabled={busy} onClick={()=>{setOffset(0);setReadOnlyPreview(true);}}>과거 미확정 읽기 전용 평가</button>
        <button type="button" disabled={busy||!!pendingRule} onClick={()=>void startShadow()}>
          {pendingShadow?'같은 Shadow 요청 다시 확인':'Shadow 실행'}
        </button>
      </div>
    </div>
    <LoadState loading={status.loading||page.loading} error={error||page.error||status.error||rules.error}/>
    <div className="al-engine-summary">
      <span>미확정 <strong>{status.data?.unresolvedCount??'—'}건</strong></span>
      <span>새 거래 자동 확정 <strong>{status.data?status.data.autoConfirmEnabled?'켜짐':'꺼짐':'—'}</strong></span>
      <span>엔진 <strong>{status.data?.engineVersion??'—'}</strong></span>
    </div>
    {shadow.data&&<div className="al-engine-receipt">
      <strong>{readOnlyPreview?'읽기 전용 평가 결과':'Shadow 결과'} · {shadow.data.evaluated} / {shadow.data.total}건 평가</strong>
      <span>원금·잔액 변동 0</span>
      {Object.entries(decisions).map(([key,label])=><span key={key}>{label} {shadow.data?.distribution[key]??0}건</span>)}
      {shadow.data.truncated&&<span>최신 평가 한도까지 표시합니다.</span>}
      <button type="button" onClick={()=>{setShadowId(null);setReadOnlyPreview(false);setOffset(0);}}>현재 후보 보기</button>
    </div>}
    <div className="al-table-scroll" tabIndex={0} aria-label="금융 판단 결과 표">
      <table className="al-engine-table"><thead><tr><th scope="col">일시</th><th scope="col">금액</th><th scope="col">현재 → 후보</th><th scope="col">판정 및 근거</th></tr></thead>
        <tbody>{page.data?.items.map(row=><tr key={row.id} data-engine-transaction={row.id}>
          <td>{seoul(row.occurredAt).replace('T',' ')}</td>
          <td>{moneyAmount(row.amount,row.currency)}</td>
          <td>{ledgerTypes[row.currentType]??row.currentType} → {row.proposedType?(ledgerTypes[row.proposedType]??row.proposedType):'—'}</td>
          <td><strong>{decisions[row.decision]??row.decision}</strong><br/><small>{reasons[row.reason]??row.reason}</small></td>
        </tr>)}</tbody></table>
    </div>
    {!page.loading&&!total&&<p className="al-empty">표시할 금융 판단이 없습니다.</p>}
    <div className="al-engine-pagination">
      <button type="button" disabled={offset===0} onClick={()=>setOffset(offset-take)}>이전</button>
      <button type="button" disabled={offset+take>=total} onClick={()=>setOffset(offset+take)}>다음</button>
    </div>
    <div className="al-engine-rules">
      <h3>금융유형 규칙</h3>
      <p>거래장에서 직접 확정한 소비·수입을 선택하면 같은 계좌·은행·거래처·입출금 방향에 적용하는 규칙을 등록할 수 있습니다.</p>
      <div className="al-engine-actions">
        <label>규칙 근거 거래 <select value={basisId} onChange={e=>setBasisId(e.target.value)}>
          <option value="">현재 거래장 페이지에서 선택</option>
          {basisRows.map(row=><option key={row.id} value={row.id}>{row.title??row.counterparty_text??row.id} · {moneyAmount(row.amount,row.currency)}</option>)}
        </select></label>
        <button type="button" disabled={!basis||busy||!!pendingRule||!!pendingShadow} onClick={()=>{
          if(basis)void saveRule({requestId:crypto.randomUUID(),basisId:basis.id,expectedBasisVersion:basis.version,expectedRuleVersion:0,active:true});
        }}>이 근거로 규칙 등록</button>
      </div>
      {!rules.data?.items.length&&<p>등록된 금융유형 규칙이 없습니다.</p>}
      {rules.data?.items.map(rule=><div className="al-engine-actions" key={rule.id}>
        <span>{rule.merchantKey} · {rule.provider} · {rule.direction==='IN'?'입금':'출금'} · {rule.active?'활성':'중지'}</span>
        <button type="button" disabled={busy||!!pendingRule||!!pendingShadow} onClick={()=>void saveRule({
          requestId:crypto.randomUUID(),basisId:rule.basisId,expectedBasisVersion:rule.basisVersion,expectedRuleVersion:rule.version,active:!rule.active,
        })}>{rule.active?'규칙 중지':'규칙 다시 활성화'}</button>
      </div>)}
      {pendingRule&&<button type="button" disabled={busy} onClick={()=>void saveRule(pendingRule)}>같은 규칙 요청으로 재시도</button>}
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
