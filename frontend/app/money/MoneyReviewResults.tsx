"use client";
import {useState} from 'react';
import type {Account} from '@/lib/money/model';
import {seoul} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import {reviewReasons} from '@/lib/money/meaning';
import {reviewCurrency,reviewDirection,reviewKey,reviewMerchant,type ReviewOutcome,type ReviewPreviewRow} from '@/lib/money/reviewWorkflow';

const labels:Record<string,string>={SAVED:'성공',FAILED:'실패',CONFLICT:'충돌',UNKNOWN:'결과 미확인',SKIPPED:'안전 제외',UNDONE:'취소 완료'};
const next:Record<string,string>={SAVED:'처리 이력 확인',FAILED:'사유 확인 후 다시 검토',CONFLICT:'최신 값과 변경안 비교',UNKNOWN:'원래 요청 결과 확인',SKIPPED:'계좌·원문 및 금융 근거 확인',UNDONE:'현재 검토 상태 확인'};
export function ReviewResults({outcome,snapshots,accounts,disabled,onRecover,onUndo}:{outcome:ReviewOutcome;snapshots:Record<string,ReviewPreviewRow>;accounts:Account[];disabled:boolean;onRecover:()=>void;onUndo:(id:string)=>void}) {
  const [filter,setFilter]=useState('ALL');
  const rows=outcome.items.filter(row=>filter==='ALL'||filter==='SUCCESS'&&row.status==='SAVED'||filter==='FAILED'&&['FAILED','CONFLICT','UNKNOWN'].includes(row.status)||filter==='SKIPPED'&&row.status==='SKIPPED');
  return <><nav className="money-actions" aria-label="처리 결과 필터">{[['ALL','전체'],['SUCCESS','성공'],['FAILED','실패'],['SKIPPED','제외']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</nav><div className="money-table-wrap"><table className="money-table money-review-results"><thead><tr>{['일시','거래처·알림','금액','계좌·방향','결과','사유','다음 행동'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=>{
    const source=snapshots[reviewKey(row)],reason=row.message||(source?.exclusionReason||source?.reason),readable=reason?reviewReasons[reason]??reason:'서버 처리 결과 확인';
    return <tr key={reviewKey(row)}><td>{source?seoul(source.occurredAt):'이전 결과 · 거래 정보 미보관'}</td><td>{source?<><strong>{reviewMerchant(source)}</strong><small>{source.title||'알림 제목 없음'}</small></>:'보존된 처리 이력'}</td><td>{source?moneyAmount(source.amount,reviewCurrency(source)):'—'}</td><td>{source?<>{accounts.find(account=>account.id===source.accountId)?.displayName||'내 계좌 확인 필요'}<small>{reviewDirection(source)}</small></>:'—'}</td><td>{labels[row.status]??row.status}</td><td>{readable}<details><summary>기술 정보</summary><small>항목 {row.id} · {row.kind}<br/>요청 {outcome.requestId}<br/>상태 {row.status}{source?.reason&&<><br/>서버 사유 {source.reason}</>}{row.eventId&&<><br/>이력 {row.eventId}</>}</small></details></td><td>{row.status==='UNKNOWN'?<button disabled={disabled} onClick={onRecover}>원래 요청 결과 조회</button>:<small>{row.status==='SKIPPED'?source?.nextAction||next.SKIPPED:next[row.status]||source?.nextAction}</small>}{row.canUndo&&row.eventId&&row.status==='SAVED'&&<button disabled={disabled} onClick={()=>onUndo(row.eventId!)}>실행 취소</button>}</td></tr>;
  })}</tbody></table>{!rows.length&&<p className="money-empty">이 상태의 처리 결과가 없습니다.</p>}</div></>;
}
