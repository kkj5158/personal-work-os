import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCampaign,invokeStep} from './campaign.mjs';

test('a private rubric repair can only change the requested checklist',async()=>{
 const previous={question:{id:'keep',kind:'single_choice',responseSchema:'option'},key:{answer:'B',hints:['one','two','three'],rubric:['first']},contract:{estimatedMinutes:2}};
 const permit={action:'CALL',callId:'reserved',inputDigest:'bound',stage:'write',
   payload:{kind:'single_choice',previous,repairComponent:'rubric',bounds:{minRubrics:2,maxRubrics:30,maxCitations:4}}};
 const result=await invokeStep(permit,{run:async schema=>{
   assert.deepEqual(schema.required,['rubric']);assert.equal(schema.properties.rubric.minItems,2);
   return {rubric:['identify the observed input','discriminate between candidate mechanisms']};
 }});
 assert.deepEqual(result.question,previous.question);assert.deepEqual(result.key.hints,previous.key.hints);
 assert.equal(result.key.answer,'B');assert.equal(result.key.rubric.length,2);assert.equal(previous.key.rubric.length,1);
});
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
