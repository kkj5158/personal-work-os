"use client";
import {seoul,type Account} from '@/lib/money/model';
import {moneyAmount} from '@/lib/money/accounts';
import type {BookRow} from './MoneyWebData';
type Item={id:string;transactionId:string;status:string;result:{reason?:string;book?:BookRow}};
const labels:Record<string,string>={SAVED:'저장 완료',FAILED_KNOWN:'실패 확인',STALE_CONFLICT:'동시 변경 충돌',OUTCOME_UNKNOWN:'결과 미확인',QUEUED:'처리 확인 필요'};
export function ClassificationSaveResults({items,snapshots,accounts}:{items:Item[];snapshots:Record<string,BookRow>;accounts:Account[]}) {
  return <div className="money-table-wrap"><table className="money-table"><thead><tr><th>일시</th><th>거래처·제목</th><th>금액·계좌</th><th>결과</th><th>사유·다음 행동</th></tr></thead><tbody>{items.map(item=>{const book=item.result.book??snapshots[item.transactionId];return <tr key={item.id}><td>{book?seoul(book.occurredAt):'이전 처리 이력'}</td><td>{book?.counterpartyText||book?.title||'보존된 선택 거래'}</td><td>{book&&<>{moneyAmount(book.amount,book.currency??'KRW')}<small>{accounts.find(a=>a.id===book.accountId)?.displayName||'계좌 확인 필요'}</small></>}</td><td>{labels[item.status]??item.status}</td><td>{item.result.reason||'서버 처리 결과'}<small>{item.status==='FAILED_KNOWN'?'확인된 실패만 재시도':item.status==='STALE_CONFLICT'?'최신 값과 선택 초안 비교':['QUEUED','OUTCOME_UNKNOWN'].includes(item.status)?'원래 요청의 커밋 확인·복구':'분류 이력 확인'}</small><details><summary>기술 정보</summary><small>{item.transactionId} · {item.id} · {item.status}</small></details></td></tr>;})}</tbody></table></div>;
}
