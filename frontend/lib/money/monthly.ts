import type { MeaningKind } from "./meaning";
import { UNIFIED } from "./unified";
export type RepaymentPart = "PRINCIPAL" | "INTEREST" | "FEE" | "UNALLOCATED";
export type LoanFilter = {kind:"LOAN_PAYMENT";label:string} & ({loanId:string|null;part?:never} | {part:RepaymentPart;loanId?:never});
export type BookCategoryFilter = {kind:MeaningKind;categoryId:string;label:string};
export type SavingsFilter = {kind:"SAVINGS";bucket:"SI"|"SO";label:string};
export type MonthlyFilter = BookCategoryFilter | SavingsFilter | { kind: "INSTALLMENT"; accountId: string; label: string } | LoanFilter;
export type LoanRepaymentSummary = {
  currency:"KRW";
  loanRepayment:string;
  loanRepaymentBreakdown:{
    byLoan:{loanId:string|null;label:string;amount:string}[];
    byPart:{principal:string;interest:string;fee:string;unallocated?:string};
  };
  unallocatedAmount:string;
  unallocatedCount:number;
};
export function loanRepaymentPath(from:string,to:string,accounts:string[]|null){
  if(accounts===null)return null; // Tracking has not loaded.
  const query=new URLSearchParams({from,to,bookkeepingScope:"true",accountIds:accounts.join(",")||"none"});
  return UNIFIED+"/loan-repayments?"+query;
}
const krwDigits=new Intl.NumberFormat("ko-KR");
/** The endpoint returns exact KRW decimals. Conversion to Number is only for drawing chart angles. */
export function repaymentWon(amount:string){
  const [whole,fraction]=amount.split(".");
  return krwDigits.format(BigInt(whole))+(fraction?"."+fraction:"")+"원";
}
export type SavingsTransfer = { occurrencePrecision?:"SECOND"|"DAY"; id:string; transactionVersion?:number; amount:number; currency:string; occurredAt:string; fromAccountId:string; toAccountId:string; title:string|null; memo:string|null; counterpartyText:string|null; fromName:string; toName:string };
export type SavingsPage = { total:number; items:SavingsTransfer[]; totals:{gross:number|null;withdrawals:number|null;net:number|null;analyticsUnavailable:boolean;unknownHistoryCount:number;currencies:string[];composition:{accountId:string;label:string;amount:number;count:number}[]} };
export function savingsPath(from:string,to:string,accountId?:string,search="",offset=0){const q=new URLSearchParams({from,to,search,limit:"50",offset:String(offset)});if(accountId)q.set("destinationAccountId",accountId);return "/bookkeeping/savings?"+q;}
export type InstallmentPage = {from:string;to:string;timezone:string;currency:string;classificationBasis:string;total:number;items:SavingsTransfer[];filteredAmount:number|null;totals:{amount:number|null;count:number;analyticsUnavailable:boolean;unknownHistoryCount:number;currencies:string[];composition:{accountId:string;label:string;amount:number;count:number}[]}};
export function installmentPath(from:string,to:string,accountId?:string,search="",offset=0){const q=new URLSearchParams({from,to,search,limit:"50",offset:String(offset)});if(accountId)q.set("destinationAccountId",accountId);return "/bookkeeping/installment-contributions?"+q;}
/** Positive sectors stay distinct from signed net amounts after refunds. */
export function donutSectors<T extends {id:string;amount:number}>(rows:T[]){const positive=rows.reduce((sum,row)=>sum+Math.max(0,row.amount),0);let start=0;return rows.map(row=>{const share=positive?Math.max(0,row.amount)/positive:0;const sector={...row,start,share};start+=share;return sector;});}

export type V4Summary = {
 actualIncome:number; consumption:number; totalExpense:number; loanRepayment:number;
 savingsIn:number|null; savingsOut:number|null; savingsNet:number|null; savingsMovement:number|null;
 unqualifiedIncomeCount:number; unknownSavingsCount:number;
 composition:{bucket:string;categoryId:string|null;loanId:string|null;amount:number;count:number}[];
};
export function v4Path(from:string,to:string,accounts:string[]|null,bucket?:"SI"|"SO",search="",offset=0) {
 const q=new URLSearchParams({from,to,currency:"KRW"});
 if(accounts!==null)q.set("accountIds",accounts.join(",")||"none");
 if(bucket){q.set("bucket",bucket);q.set("search",search);q.set("offset",String(offset));}
 return "/v4/"+(bucket?"contributions":"summary")+"?"+q;
}
