"use client";
import {Fragment, useEffect, useId, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {UNIFIED,type UnifiedRow} from '@/lib/money/unified';
import {reviewReasons} from '@/lib/money/meaning';
import {moneyAmount} from '@/lib/money/accounts';
import {seoul} from '@/lib/money/model';
import type {LedgerOperation} from '@/lib/money/accountLedger';
import {useMoneyViewState} from './MoneyDataProvider';
import {useMoneyData,LoadState} from './MoneyWebData';
import {MoneyNavigationTabs} from './MoneyNavigationTabs';
import {AccountLabel,Pagination,type Props} from './MoneyWebViews';
import {NotificationReview} from './MoneyNotificationReview';
import {AccountLedgerEditor} from './MoneyAccountLedgerEditor';
import {DecisionStatus,FinancialTypePicker,relationLabel,useFinancialDecisions} from './MoneyLedgerFinancialType';

const lanes = [
  {value:'UNRESOLVED',label:'금융 의미 미확정'},
  {value:'FOLLOWUP',label:'후속 연결 대기'},
  {value:'PENDING',label:'미처리 알림'},
  {value:'FAILED',label:'처리 오류'},
  {value:'DEFERRED',label:'보류'},
  {value:'COMPLETED',label:'처리 이력'},
] as const;
type Lane=typeof lanes[number]['value'];
type ReviewRow=UnifiedRow&{reviewReason:string};
type Failure={id:string;command:string;reason:string;message?:string;occurredAt:string};
type Page<T>={items:T[];total:number};

export function MoneyReviewLanes(p:Props & {onPendingCount?:(count:number)=>void}){
  const tabs=useId(),query=useSearchParams();
  const [lane,setLane]=useMoneyViewState<Lane>('money-review-workspace',()=>lanes.find(l=>l.value===query.get('lane'))?.value??'PENDING');
  return <section>
    <MoneyNavigationTabs id={tabs} label="검토 업무" selected={lane} items={[...lanes]}
      onSelect={value=>{if(p.changeContext?.()!==false)setLane(value as Lane);}}/>
    <div role="tabpanel" id={tabs+'-panel'} aria-labelledby={tabs+'-tab-'+lane}>
      {lane==='UNRESOLVED'||lane==='FOLLOWUP'?<FinancialLane key={lane} {...p} lane={lane}/>:
       lane==='FAILED'?<><NotificationReview key={lane} {...p} laneState="FAILED_NOTIFICATION"/><FailureLane/></>:
       <NotificationReview key={lane} {...p} laneState={lane==='PENDING'?'PENDING_NOTIFICATION':lane}/>}
    </div>
  </section>;
}

function FinancialLane(p:Props&{lane:'UNRESOLVED'|'FOLLOWUP'}){
  const [offset,setOffset]=useState(0),[expanded,setExpanded]=useState<string|null>(null);
  const [pending,setPending]=useMoneyViewState<Record<string,LedgerOperation|null>>('review-financial-commands',()=>({}));
  const result=useMoneyData<Page<ReviewRow>>(UNIFIED+'/review?'+new URLSearchParams({lane:p.lane,offset:String(offset),limit:'50'}));
  useEffect(()=>{
    if(!result.loading&&result.data&&offset>=result.data.total&&offset>0)setOffset(Math.max(0,Math.floor((result.data.total-1)/50)*50));
  },[offset,result.data,result.loading]);
  const decisions=useFinancialDecisions();
  const rows=result.data?.items??[];
  return <section className="money-card">
    <LoadState loading={result.loading} error={result.error}/>
    <div className="money-table-wrap"><table className="money-table"><thead><tr><th>일시</th><th>거래·계좌</th><th>금액</th><th>검토 사유</th><th>금융 유형</th><th>상세</th></tr></thead>
    <tbody>{rows.map(row=><Fragment key={row.id}><tr data-transaction-id={row.id}>
      <td>{seoul(row.occurred_at,row.occurrence_precision)}</td><td>{row.title??row.counterparty_text??'거래'}<AccountLabel id={row.from_account_id??row.to_account_id??''} accounts={p.accounts}/></td>
      <td>{moneyAmount(row.amount,row.currency)}</td><td>{relationLabel(row)||reviewReasons[row.reviewReason]||row.reviewReason||'원본 금융 근거 확인 필요'}</td>
      <td><FinancialTypePicker row={row} disabled={!!pending[row.id]||['saving','unknown'].includes(decisions.entries[row.id]?.phase)} onChoose={type=>void decisions.save(row,type)}/>
      {decisions.entries[row.id]&&<DecisionStatus row={row} entry={decisions.entries[row.id]} retry={decisions.retry} undo={decisions.undo}/>}</td>
      <td><button aria-expanded={expanded===row.id} onClick={()=>setExpanded(expanded===row.id?null:row.id)}>근거·연결 확인</button></td></tr>
      {expanded===row.id&&<tr><td colSpan={6}><AccountLedgerEditor id={row.id} accounts={p.accounts} categories={p.categories} pending={pending[row.id]??null} onPending={value=>setPending(old=>({...old,[row.id]:value}))} onClose={()=>setExpanded(null)}/></td></tr>}
    </Fragment>)}</tbody></table></div>
    {result.data&&!rows.length&&<p>검토할 거래가 없습니다.</p>}<Pagination offset={offset} total={result.data?.total??0} onChange={setOffset}/>
  </section>;
}

function FailureLane(){
  const [offset,setOffset]=useState(0);
  const result=useMoneyData<Page<Failure>>(UNIFIED+'/review?'+new URLSearchParams({lane:'FAILED',offset:String(offset),limit:'50'}));
  return <section className="money-card"><h2>적용되지 않은 명령 이력</h2><LoadState loading={result.loading} error={result.error}/>
    <div className="money-table-wrap"><table className="money-table"><thead><tr><th>요청 시각</th><th>작업</th><th>실패 사유</th><th>요청 ID</th></tr></thead>
    <tbody>{result.data?.items.map(row=><tr key={row.id}><td>{seoul(row.occurredAt)}</td><td>{row.command}</td><td>{row.message||reviewReasons[row.reason]||row.reason}</td><td>{row.id}</td></tr>)}</tbody></table></div>
    {result.data&&!result.data.total&&<p>처리 오류가 없습니다.</p>}<Pagination offset={offset} total={result.data?.total??0} onChange={setOffset}/>
  </section>;
}
