import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMoney,moneyDefinitions} from './money-tools.mjs';
const id='00000000-0000-0000-0000-000000000001';

test('current parser diagnostic accepts one owned ID and never accepts rewritten source fields or execution',()=>{
 validateMoney('money_get_notification_reparse_diagnostic',{id});
 for(const extra of [{amount:7},{postedAt:'2026-11-17T00:00:00Z'},{rawText:'replacement'},{confirmed:true},{userId:id}])assert.throws(()=>validateMoney('money_get_notification_reparse_diagnostic',{id,...extra}));
 const d=moneyDefinitions.find(x=>x.name==='money_get_notification_reparse_diagnostic');assert.equal(d.method,'GET');assert.deepEqual(d.requiredScopes,['orbit:read']);
});
test('exact cutoff query is read only, closed, owner scoped and does not accept a balance plug',()=>{
 validateMoney('money_get_bank_cutoff_projection',{id,cutoff:'2026-11-17T03:31:19Z'});
 assert.throws(()=>validateMoney('money_get_bank_cutoff_projection',{id}));
 assert.throws(()=>validateMoney('money_get_bank_cutoff_projection',{id,cutoff:'2026-11-17T03:31:19Z',balance:0}));
 const d=moneyDefinitions.find(x=>x.name==='money_get_bank_cutoff_projection');assert.equal(d.method,'GET');assert.deepEqual(d.requiredScopes,['orbit:read']);
});
test('reconciliation upload is bounded, closed and never accepts a local path or remote URL',()=>{
 const args={accountId:id,provider:'IBK',format:'PDF',sha256:'a'.repeat(64),byteLength:2000};validateMoney('money_recon_intake_start',args);
 validateMoney('money_recon_intake_start',{...args,format:'HTML_XLS'});
 assert.throws(()=>validateMoney('money_recon_intake_start',{...args,password:'never-upload-password'}));
 for(const extra of [{path:'C:/private.pdf'},{url:'https://evil.invalid'},{byteLength:2000001},{provider:'UNKNOWN'}])assert.throws(()=>validateMoney('money_recon_intake_start',{...args,...extra}));
 validateMoney('money_recon_intake_chunk',{uploadId:id,index:0,base64:'YWJj'});assert.throws(()=>validateMoney('money_recon_intake_chunk',{uploadId:id,index:0,base64:'a'.repeat(40001)}));
});
test('reconciliation execution always requires exact fresh preview approval and original request ID',()=>{
 validateMoney('money_recon_batch_preview',{runId:id,items:[{rowId:id,action:'REGISTER_CASH'}]});assert.throws(()=>validateMoney('money_recon_batch_preview',{runId:id,items:[{rowId:id,action:'REGISTER_CASH',amount:80000}]}));
 const execute={previewId:id,fingerprint:'b'.repeat(64),requestId:id,confirmed:true};validateMoney('money_recon_batch_execute',execute);assert.throws(()=>validateMoney('money_recon_batch_execute',{...execute,confirmed:false}));
 const d=moneyDefinitions.find(x=>x.name==='money_recon_batch_execute');assert.deepEqual(d.requiredScopes,['orbit:read','orbit:write:money']);assert.equal(d.tier,'B');
});

test('native replay and atomic multi-account plans retain explicit source and exact action gates',()=>{
 validateMoney('money_recon_intake_start',{accountId:id,provider:'KAKAO',format:'NATIVE_JSON',sha256:'c'.repeat(64),byteLength:1000});
 for(const action of ['REPARSE_SOURCE','CORRECT_CHECKPOINT','UNDO_CHANGE','MAP_OVERDRAFT','CREATE_BANK_CHECKPOINT','REGISTER_CASH_WITH_REPARSE'])validateMoney('money_recon_batch_preview',{runId:id,attestNativeSource:true,additionalStatementIds:[id],items:[{rowId:id,action,reason:'exact original bank evidence'}]});
 assert.throws(()=>validateMoney('money_recon_batch_preview',{runId:id,additionalStatementIds:Array(5).fill(id),items:[{rowId:id,action:'REGISTER_CASH'}]}));
 assert.throws(()=>validateMoney('money_recon_batch_preview',{runId:id,sourceApproval:'inferred',items:[{rowId:id,action:'REGISTER_CASH'}]}));
 assert.throws(()=>validateMoney('money_recon_intake_start',{accountId:id,provider:'KAKAO',format:'NATIVE_JSON',sha256:'c'.repeat(64),byteLength:1000,password:'private'}));
});
