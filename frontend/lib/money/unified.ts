import type {BookRow} from '../../app/money/MoneyWebData';
export const UNIFIED='/bookkeeping/unified';
export type UnifiedRow={id:string;type:string;meaning_state:'CONFIRMED'|'UNRESOLVED';from_account_id:string|null;to_account_id:string|null;amount:number;currency:string;occurred_at:string;title:string|null;memo:string|null;counterparty_text:string|null;version:number;loan_id:string|null;principal:number|null;interest:number|null;fee:number|null;refund_of:string|null;sourceCount:number;sources:{raw_event_id:string;parse_attempt_id:string|null;relationship:string;evidence:string}[];book?:BookRow};
export type UnifiedCommand={requestId:string;expectedVersion:number;action:string;[key:string]:unknown};
export type UnifiedOutcome={status:'APPLIED'|'NOT_APPLIED'|'UNKNOWN';result?:{row?:UnifiedRow;undoId?:string;message?:string;reason?:string}};
export type PendingSave={id:string;command:UnifiedCommand};
export const typeLabels:Record<string,string>={EXPENSE:'소비',INCOME:'수입',TRANSFER:'이체',REFUND:'환불',LOAN_PAYMENT:'대출 상환',LOAN_RECEIPT:'대출 입금',INITIAL_BALANCE:'시작 잔액',BALANCE_ADJUSTMENT:'잔액 조정'};
export function allowedTypes(row:UnifiedRow){if(row.from_account_id&&row.to_account_id)return [];if(row.type==='LOAN_PAYMENT')return ['LOAN_PAYMENT'];if(row.type==='INITIAL_BALANCE'||row.type==='BALANCE_ADJUSTMENT'||row.type==='LOAN_RECEIPT')return [];return row.from_account_id?['EXPENSE','TRANSFER','LOAN_PAYMENT']:['INCOME','REFUND','TRANSFER'];}
/** A failed HTTP response does not prove that the transaction rolled back. */
export async function submitUnified(pending:PendingSave,post:(path:string,body:unknown)=>Promise<UnifiedOutcome>,get:(path:string)=>Promise<UnifiedOutcome>):Promise<UnifiedOutcome>{
 try{return await post(UNIFIED+'/rows/'+pending.id,pending.command);}catch{try{return await get(UNIFIED+'/outcomes/'+pending.command.requestId);}catch{return {status:'UNKNOWN'};}}
}
