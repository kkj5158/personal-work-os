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
test('a paired citation and rubric repair retains every other candidate field',async()=>{
 const previous={question:{id:'keep'},key:{answer:'B',hints:['1','2','3'],model:'원래 해설',citations:[],rubric:[]}};
 const result=await invokeStep({action:'CALL',callId:'reserved',inputDigest:'bound',stage:'write',
   payload:{kind:'single_choice',previous,repairComponent:'citationsAndRubric'}},{run:async schema=>{
    assert.deepEqual(schema.required,['citations','rubric']);return {citations:[{excerptId:'same',quote:'근거'}],rubric:['기준']};
 }});
 assert.deepEqual(result,{...previous,key:{...previous.key,citations:[{excerptId:'same',quote:'근거'}],rubric:['기준']}});
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

test('approved policy binds response mode, hints and alternatives without changing historical instructions',async()=>{
 const run=async authoringPolicy=>{
   let observed;
   await invokeStep({action:'CALL',callId:'reserved',inputDigest:'bound',stage:'review',authoringPolicy,payload:[{}]},
     {run:async(schema,prompt)=>{observed={schema,prompt};return {items:[]};}});
   return observed;
 };
 const current=await run('study-education-v1-golden-v2'),old=await run('study-engine-policy-v320');
 for(const phrase of ['basic_application','cause_analysis','advanced_integration','best option ID','H1 orients','H2 compares','H3 gives','conditional answers','unresolved issue does not prove blocked work'])
   assert.ok(current.prompt.includes(phrase),phrase);
 assert.ok(current.schema.properties.items.items.required.includes('uncertainty'));
 assert.ok(!old.schema.properties.items.items.required.includes('uncertainty'));
 assert.ok(!old.prompt.includes('basic_application'));
});
