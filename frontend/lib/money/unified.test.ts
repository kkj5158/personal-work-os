import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitUnified,allowedTypes,financialTypeFields,financialDraftValue,type UnifiedRow} from './unified';
test('lost response recovers committed outcome using the exact operation identity',async()=>{const operation={id:'fact',command:{requestId:'stable-operation',action:'TYPE',expectedVersion:4}};let reads=0;const result=await submitUnified(operation,async()=>{throw Error('response lost');},async path=>{reads++;assert.ok(path.endsWith('/stable-operation'));return {status:'APPLIED'};});assert.equal(result.status,'APPLIED');assert.equal(reads,1);});
test('unavailable outcome stays UNKNOWN and never reposts automatically',async()=>{let posts=0;const result=await submitUnified({id:'fact',command:{requestId:'same',action:'TYPE',expectedVersion:4}},async()=>{posts++;throw Error('offline');},async()=>{throw Error('offline');});assert.equal(posts,1);assert.equal(result.status,'UNKNOWN');});
test('direction and loan constraints restrict available financial meanings',()=>{assert.deepEqual(allowedTypes({type:'EXPENSE',from_account_id:'a',to_account_id:null} as UnifiedRow),['EXPENSE','TRANSFER','LOAN_PAYMENT']);assert.deepEqual(allowedTypes({type:'INCOME',from_account_id:null,to_account_id:'a'} as UnifiedRow),['INCOME','REFUND','TRANSFER']);assert.deepEqual(allowedTypes({type:'TRANSFER',from_account_id:'a',to_account_id:'b'} as UnifiedRow),[]);});
test('editing one repayment component sends the other persisted components',()=>{
 const row={type:'LOAN_PAYMENT',principal:420000,interest:70000,fee:10000} as UnifiedRow;
 assert.deepEqual(financialTypeFields(row,{interest:60000,fee:20000}),{principal:420000,interest:60000,fee:20000});
 assert.deepEqual(financialTypeFields(row,{principal:null,interest:null,fee:null}),{principal:null,interest:null,fee:null});
 assert.equal(financialDraftValue({interest:null},'interest',70000),null);
});
test('explicit refund unlink is preserved while an untouched link is inherited',()=>{
 const row={type:'REFUND',refund_of:'purchase'} as UnifiedRow;
 assert.deepEqual(financialTypeFields(row,{}),{refundOf:'purchase'});
 assert.deepEqual(financialTypeFields(row,{refundOf:null}),{refundOf:null});
});
