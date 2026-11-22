import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ledgerPath,changeLedgerScope,categoryEligible,quickConfirmEligible,ledgerInstant,recoverLedgerOperation,type LedgerFilters,type LedgerRow} from './accountLedger';
import {affectedBy} from './cache';
import {tabTarget} from '../globalTabs';
const filters:LedgerFilters={accountId:null,type:'',state:'ALL',search:'',view:'ledger',offset:100};
test('account query accepts exactly one scope, preserves filters, resets offset',()=>{const next=changeLedgerScope({...filters,type:'TRANSFER'},'one');assert.equal(next.accountId,'one');assert.equal(next.offset,0);const q=new URL(ledgerPath('2026-11-01','2026-11-30',next),'https://test.example');assert.equal(q.searchParams.get('accountId'),'one');assert.equal(q.searchParams.has('accountIds'),false);assert.equal(q.searchParams.get('type'),'TRANSFER');assert.equal(new URL(ledgerPath('2026-11-01','2026-11-30',changeLedgerScope(next,null)),'https://test.example').searchParams.has('accountId'),false);});
test('pending RAW uses independent projection and unresolved subview retains period',()=>{assert.match(ledgerPath('2026-11-01','2026-11-30',{...filters,view:'pending'}),/^\/account-ledger\/pending\?/);assert.match(ledgerPath('2026-11-01','2026-11-30',{...filters,view:'unresolved',state:'CONFIRMED'}),/state=UNRESOLVED/);});
test('only confirmed expense/income can receive a lifestyle category',()=>{for(const type of ['EXPENSE','INCOME']){assert.equal(categoryEligible({type,meaning_state:'CONFIRMED'}),true);assert.equal(categoryEligible({type,meaning_state:'UNRESOLVED'}),false);}for(const type of ['TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL','LOAN_PAYMENT','LOAN_RECEIPT','REFUND','UNRESOLVED'])assert.equal(categoryEligible({type,meaning_state:'CONFIRMED'}),false);});
test('correction KST input becomes an unambiguous UTC instant',()=>{assert.equal(ledgerInstant('2026-11-15T12:34:56'),'2026-11-15T03:34:56.000Z');assert.throws(()=>ledgerInstant('2026-11-15'));});
test('lost execute response queries original command identity without a second write',async()=>{const operation={fingerprint:'original',previewToken:'preview',edit:{action:'TYPE',expectedVersion:4,requestId:'same-request'}},calls:string[]=[];const result=await recoverLedgerOperation('row',operation,async(path,body)=>{calls.push(path);assert.equal(body,operation);throw Error('Lost response');},async path=>{calls.push(path);return {status:'APPLIED'};});assert.equal(result.status,'APPLIED');assert.deepEqual(calls,['/account-ledger/rows/row/execute','/bookkeeping/unified/outcomes/same-request']);});
test('unknown financial result stays unknown if outcome query is unavailable',async()=>{const result=await recoverLedgerOperation('row',{fingerprint:'original',edit:{action:'TYPE',expectedVersion:4,requestId:'same-request'}},async()=>{throw Error('Lost response');},async()=>{throw Error('Offline');});assert.equal(result.status,'UNKNOWN');});
test('ledger is part of existing MONEY and FINANCE shell and invalidates canonical projections',()=>{assert.equal(tabTarget('/money/ledger')?.system,'MONEY SYS');assert.equal(tabTarget('/money/ledger')?.title,'MONEY SYS · 계좌 거래장');for(const mutation of ['transaction','book','account','category','loan','reviewItem'] as const)assert.equal(affectedBy(mutation,'/account-ledger?accountId=one'),true);});

test('quick financial confirmation is only for unresolved source-backed single-legged ordinary cash',()=>{
 const base:LedgerRow={
  id:'source-row',meaning_state:'UNRESOLVED',sourceCount:1,type:'EXPENSE',direction:'OUT',from_account_id:'source',to_account_id:null,
  amount:100,currency:'KRW',occurred_at:'2026-11-15T01:00:00Z',version:1,categoryEligible:false,signedAmount:-100,sources:[],
  title:null,memo:null,counterparty_text:null,loan_id:null,principal:null,interest:null,fee:null,refund_of:null,
 };
 assert.equal(quickConfirmEligible(base),true);
 assert.equal(quickConfirmEligible({...base,type:'INCOME',direction:'IN',to_account_id:'target',from_account_id:null}),true);
 const excluded:LedgerRow[]=[{...base,sourceCount:0},{...base,type:'TRANSFER'},{...base,meaning_state:'CONFIRMED'},{...base,to_account_id:'another'},{...base,direction:'IN'}];
 for(const row of excluded)assert.equal(quickConfirmEligible(row),false);
});
