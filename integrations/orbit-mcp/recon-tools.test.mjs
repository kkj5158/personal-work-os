import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMoney,moneyDefinitions} from './money-tools.mjs';
const id='00000000-0000-0000-0000-000000000001';
test('reconciliation upload is bounded, closed and never accepts a local path or remote URL',()=>{
 const args={accountId:id,provider:'IBK',format:'PDF',sha256:'a'.repeat(64),byteLength:2000};validateMoney('money_recon_intake_start',args);
 for(const extra of [{path:'C:/private.pdf'},{url:'https://evil.invalid'},{byteLength:2000001},{provider:'UNKNOWN'}])assert.throws(()=>validateMoney('money_recon_intake_start',{...args,...extra}));
 validateMoney('money_recon_intake_chunk',{uploadId:id,index:0,base64:'YWJj'});assert.throws(()=>validateMoney('money_recon_intake_chunk',{uploadId:id,index:0,base64:'a'.repeat(40001)}));
});
test('reconciliation execution always requires exact fresh preview approval and original request ID',()=>{
 validateMoney('money_recon_batch_preview',{runId:id,items:[{rowId:id,action:'REGISTER_CASH'}]});assert.throws(()=>validateMoney('money_recon_batch_preview',{runId:id,items:[{rowId:id,action:'REGISTER_CASH',amount:80000}]}));
 const execute={previewId:id,fingerprint:'b'.repeat(64),requestId:id,confirmed:true};validateMoney('money_recon_batch_execute',execute);assert.throws(()=>validateMoney('money_recon_batch_execute',{...execute,confirmed:false}));
 const d=moneyDefinitions.find(x=>x.name==='money_recon_batch_execute');assert.deepEqual(d.requiredScopes,['orbit:read','orbit:write:money']);assert.equal(d.tier,'B');
});
