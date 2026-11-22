import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCampaign,invokeStep} from './campaign.mjs';
test('lost completion acknowledgement reuses the exact output; terminal decision stops all calls',async()=>{
 let calls=0,reservations=0,receipts=[];
 const result=await driveCampaign(async()=>++reservations===1?{action:'CALL',callId:'one',inputDigest:'bound',stage:'blind',payload:[{}]}:{action:'STOP',reason:'BLOCKED'},
 async body=>{receipts.push(body);if(receipts.length===1)throw Error('lost');return {state:'RUNNING'};},
 async permit=>({ok:true,output:await invokeStep(permit,{run:async()=>{calls++;return {items:[]};}})}));
 assert.equal(result.state,'BLOCKED');assert.equal(calls,1);assert.deepEqual(receipts[0],receipts[1]);
});
test('orphaned reservation never invokes another model',async()=>{
 const impossible=()=>assert.fail('unexpected call');assert.deepEqual(await driveCampaign(async()=>({action:'RECONCILE'}),impossible,impossible),{state:'RECONCILE'});
});
