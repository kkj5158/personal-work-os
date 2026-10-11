import type { MeaningKind } from "./meaning";
export type MonthlyFilter = { kind: MeaningKind; categoryId: string; label: string } | { kind: "SAVINGS"; accountId: string; label: string };
export type SavingsTransfer = { id:string; amount:number; currency:string; occurredAt:string; fromAccountId:string; toAccountId:string; title:string|null; memo:string|null; counterpartyText:string|null; fromName:string; toName:string };
export type SavingsPage = { total:number; items:SavingsTransfer[]; totals:{gross:number|null;withdrawals:number|null;net:number|null;analyticsUnavailable:boolean;unknownHistoryCount:number;currencies:string[];composition:{accountId:string;label:string;amount:number;count:number}[]} };
export function savingsPath(from:string,to:string,accountId?:string,search="",offset=0){const q=new URLSearchParams({from,to,search,limit:"50",offset:String(offset)});if(accountId)q.set("destinationAccountId",accountId);return "/bookkeeping/savings?"+q;}
/** Positive sectors stay distinct from signed net amounts after refunds. */
export function donutSectors<T extends {id:string;amount:number}>(rows:T[]){const positive=rows.reduce((sum,row)=>sum+Math.max(0,row.amount),0);let start=0;return rows.map(row=>{const share=positive?Math.max(0,row.amount)/positive:0;const sector={...row,start,share};start+=share;return sector;});}
