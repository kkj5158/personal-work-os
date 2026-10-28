import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitUnified,financialLabel,financialOptions,selectFinancialOption,allowedTypes,financialTypeFields,financialDraftValue,loanAllocation,selectFinancialType,financialCommandFields,type UnifiedRow} from './unified';
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

test('allocation accepts unresolved or exact nonnegative two-decimal splits, including explicit zeros',()=>{
 const row={type:'EXPENSE',amount:500000,principal:null,interest:null,fee:null} as UnifiedRow;
 assert.equal(loanAllocation(row,{}).unknown,true);
 assert.equal(loanAllocation(row,{}).valid,true);
 for(const draft of [{principal:420000,interest:70000,fee:10000},{principal:500000,interest:0,fee:0}])assert.equal(loanAllocation(row,draft).valid,true);
 for(const draft of [{principal:420000},{principal:420000,interest:70000,fee:9999},{principal:500001,interest:-1,fee:0},{principal:499999.999,interest:0.001,fee:0},{principal:NaN,interest:0,fee:0}])assert.equal(loanAllocation(row,draft).valid,false,JSON.stringify(draft));
 assert.equal(loanAllocation({...row,amount:0.3},{principal:'0.1',interest:'0.2',fee:'0'}).valid,true);
 assert.equal(loanAllocation({...row,amount:0.3},{principal:'0.100001',interest:'0.199999',fee:0}).valid,false);
});

test('type navigation retains evidence and corrections, removes incompatible input and preserves same-type drafts',()=>{
 const row={type:'EXPENSE'} as UnifiedRow;
 const draft={type:'LOAN_PAYMENT',loanId:'loan',loanVersion:4,principal:500000,interest:0,fee:0,sourceId:'source',reason:'verified',accountId:'account',amount:12};
 assert.deepEqual(selectFinancialType(row,draft,'LOAN_PAYMENT'),draft);
 assert.deepEqual(selectFinancialType(row,draft,'TRANSFER'),{type:'TRANSFER',sourceId:'source',reason:'verified',accountId:'account',amount:12});
 assert.deepEqual(selectFinancialType(row,{type:'TRANSFER',otherId:'leg',otherVersion:7},'EXPENSE'),{type:'EXPENSE'});
 assert.deepEqual(selectFinancialType(row,{type:'REFUND',refundOf:'purchase',otherVersion:4},'TRANSFER'),{type:'TRANSFER'});
});

test('each action submits only its own contract and never cached operation metadata',()=>{
 const row={type:'EXPENSE',refund_of:null} as UnifiedRow;
 const draft={type:'EXPENSE',loanId:'loan',loanVersion:5,principal:1,interest:2,fee:3,refundOf:'purchase',otherId:'leg',otherVersion:9,sourceId:'source',reason:'evidence',accountId:'account',amount:100,occurredAt:'date',action:'ATTACH_SOURCE',requestId:'old',expectedVersion:99};
 assert.deepEqual(financialCommandFields(row,draft,'TYPE'),{type:'EXPENSE'});
 assert.deepEqual(financialCommandFields(row,{...draft,type:'LOAN_PAYMENT'},'TYPE'),{type:'LOAN_PAYMENT',loanId:'loan',loanVersion:5,principal:1,interest:2,fee:3});
 assert.deepEqual(financialCommandFields(row,{...draft,type:'REFUND'},'TYPE'),{type:'REFUND',refundOf:'purchase',otherVersion:9});
 assert.deepEqual(financialCommandFields(row,draft,'LINK_TRANSFER'),{otherId:'leg',otherVersion:9,reason:'evidence'});
 assert.deepEqual(financialCommandFields(row,{...draft,sourceVersion:6},'ATTACH_SOURCE'),{otherId:'source',otherVersion:6,reason:'evidence'});
 assert.deepEqual(financialCommandFields(row,draft,'CORRECT'),{accountId:'account',amount:100,occurredAt:'date',reason:'evidence'});
});

test('locked facts and one-sided transfers respect the server transition restrictions',()=>{
 for(const type of ['LOAN_RECEIPT','INITIAL_BALANCE','BALANCE_ADJUSTMENT'])assert.deepEqual(allowedTypes({type,from_account_id:null,to_account_id:'a'} as UnifiedRow),[]);
 assert.deepEqual(allowedTypes({type:'LOAN_PAYMENT',from_account_id:'a',to_account_id:null} as UnifiedRow),['LOAN_PAYMENT']);
 assert.deepEqual(allowedTypes({type:'TRANSFER',from_account_id:'a',to_account_id:null} as UnifiedRow),['EXPENSE','TRANSFER']);
});

test('savings is a display intent and cannot become a stored financial type or unlock linked facts',()=>{
 const row={type:'EXPENSE',from_account_id:'a',to_account_id:null,meaning_state:'CONFIRMED'} as UnifiedRow;
 assert.deepEqual(financialOptions(row),['EXPENSE','TRANSFER','SAVINGS','SAVINGS_WITHDRAWAL','LOAN_PAYMENT']);
 const draft=selectFinancialOption(row,{otherId:'old',otherVersion:2},'SAVINGS');
 assert.equal(draft.type,'TRANSFER');assert.equal(draft.transferIntent,'SAVINGS');assert.equal(draft.otherId,undefined);
 assert.deepEqual(financialCommandFields(row,draft,'TYPE'),{type:'TRANSFER'});
 const linked={...row,type:'TRANSFER',to_account_id:'b',display_type:'SAVINGS'};
 assert.equal(financialLabel(linked),'저축');assert.deepEqual(financialOptions(linked),[]);
 assert.equal(financialLabel({...linked,display_type:'SAVINGS_WITHDRAWAL'}),'저축 회수');
 assert.equal(financialLabel({...linked,meaning_state:'UNRESOLVED'}),'유형 미확정');
});
