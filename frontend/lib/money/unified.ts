import type {BookRow} from '../../app/money/MoneyWebData';
export const UNIFIED='/bookkeeping/unified';
export type UnifiedRow={id:string;type:string;meaning_state:'CONFIRMED'|'UNRESOLVED';from_account_id:string|null;to_account_id:string|null;amount:number;currency:string;occurred_at:string;title:string|null;memo:string|null;counterparty_text:string|null;version:number;loan_id:string|null;principal:number|null;interest:number|null;fee:number|null;refund_of:string|null;sourceCount:number;sources:{raw_event_id:string;parse_attempt_id:string|null;relationship:string;evidence:string}[];book?:BookRow};
export type UnifiedCommand={requestId:string;expectedVersion:number;action:string;[key:string]:unknown};
export type UnifiedOutcome={status:'APPLIED'|'NOT_APPLIED'|'UNKNOWN';result?:{row?:UnifiedRow;undoId?:string;message?:string;reason?:string}};
export type PendingSave={id:string;command:UnifiedCommand};
export const typeLabels:Record<string,string>={EXPENSE:'소비',INCOME:'수입',TRANSFER:'이체',REFUND:'환불',LOAN_PAYMENT:'대출 상환',LOAN_RECEIPT:'대출 입금',INITIAL_BALANCE:'시작 잔액',BALANCE_ADJUSTMENT:'잔액 조정'};
/** Missing keys inherit persisted values; explicit null is an intentional clear. */
export function financialDraftValue(draft:Record<string,unknown>,key:string,persisted:unknown){return Object.hasOwn(draft,key)?draft[key]:persisted;}
export function financialTypeFields(row:UnifiedRow,draft:Record<string,unknown>){
 const type=String(draft.type??row.type);
 if(type==='LOAN_PAYMENT')return Object.fromEntries(['principal','interest','fee'].map(key=>[key,financialDraftValue(draft,key,row[key as 'principal'|'interest'|'fee'])]));
 if(type==='REFUND')return {refundOf:financialDraftValue(draft,'refundOf',row.refund_of)};
 return {};
}
export function allowedTypes(row:UnifiedRow){if(row.from_account_id&&row.to_account_id)return [];if(row.type==='LOAN_PAYMENT')return ['LOAN_PAYMENT'];if(row.type==='INITIAL_BALANCE'||row.type==='BALANCE_ADJUSTMENT'||row.type==='LOAN_RECEIPT')return [];return row.from_account_id?['EXPENSE','TRANSFER',...(row.type==='EXPENSE'?['LOAN_PAYMENT']:[])]:['INCOME','REFUND','TRANSFER'];}
/** Type navigation keeps evidence/correction drafts, but drops incompatible linkage and split fields. */
export function selectFinancialType(row:UnifiedRow,draft:Record<string,unknown>,type:string){
 if(type===String(draft.type??row.type))return {...draft,type};
 const next:Record<string,unknown>={...draft,type};
 for(const key of ['loanId','loanVersion','principal','interest','fee','refundOf','otherId','otherVersion'])delete next[key];
 return next;
}
/** Match the server's two-decimal rule without a floating-point equality tolerance. */
function cents(value:unknown):bigint|null{
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const match=/^(\d+)(?:\.(\d{1,2})0*)?$/.exec(String(value).trim());
 if(!match)return null;
 const result=BigInt(match[1])*BigInt(100)+BigInt((match[2]??'').padEnd(2,'0'));
 return result<BigInt('10000000000000000000')?result:null;
}
export function loanAllocation(row:UnifiedRow,draft:Record<string,unknown>){
 const values=['principal','interest','fee'].map(key=>financialDraftValue(draft,key,row[key as 'principal'|'interest'|'fee']));
 const unknown=values.every(value=>value==null||value==='');
 const parts=values.map(cents),total=parts.reduce<bigint>((sum,value)=>sum+(value??BigInt(0)),BigInt(0));
 return {unknown,total:Number(total)/100,valid:unknown||(parts.every(value=>value!==null)&&cents(row.amount)===total)};
}
/** Keep independent server operations independent; never spread an entire editor draft into a command. */
export function financialCommandFields(row:UnifiedRow,draft:Record<string,unknown>,action:string){
 const pick=(keys:string[])=>Object.fromEntries(keys.filter(key=>Object.hasOwn(draft,key)).map(key=>[key,draft[key]]));
 if(action==='TYPE'){
  const type=String(draft.type??row.type);
  return {type,...financialTypeFields(row,draft),...(type==='LOAN_PAYMENT'?pick(['loanId','loanVersion']):{}),...(type==='REFUND'?pick(['otherVersion']):{})};
 }
 if(action==='CORRECT')return pick(['accountId','amount','occurredAt','reason']);
 if(action==='LINK_TRANSFER')return pick(['otherId','otherVersion','reason']);
 if(action==='ATTACH_SOURCE')return {otherId:draft.sourceId,reason:draft.reason};
 if(action==='UNDO_UNLINK')return pick(['undoId']);
 return {};
}
/** A failed HTTP response does not prove that the transaction rolled back. */
export async function submitUnified(pending:PendingSave,post:(path:string,body:unknown)=>Promise<UnifiedOutcome>,get:(path:string)=>Promise<UnifiedOutcome>):Promise<UnifiedOutcome>{
 try{return await post(UNIFIED+'/rows/'+pending.id,pending.command);}catch{try{return await get(UNIFIED+'/outcomes/'+pending.command.requestId);}catch{return {status:'UNKNOWN'};}}
}
