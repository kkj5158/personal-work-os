import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexAdapter} from './adapters.mjs';
import {dependencyIssue, adjudicate, blindViews, CONTRACT} from './reasoning.mjs';

const design={factors:['sample group','capture method'],alternatives:['inspect intake','inspect storage'],
  criteria:'Prefer the check that distinguishes the remaining mechanisms without losing records.',
  cases:[{values:['remote','trace'],best:0},{values:['remote','replay'],best:1},{values:['local','trace'],best:1}],
  target:'multi_evidence',objective:'Identify a discriminating test', pattern:'next_test'};
test('eight rows with one perfectly predictive column still fail',()=>{
 const d={...design,cases:Array.from({length:8},(_,i)=>({values:[i<4?'A':'B',String(i%4)],best:Number(i>=4)}))};
 assert.equal(dependencyIssue(d),'SINGLE_CLUE_SHORTCUT');
});
test('counterfactual and ablation need a change attributable to the removed factor',()=>{
 assert.equal(dependencyIssue(design),null);
 assert.equal(dependencyIssue({...design,cases:[...design.cases,{values:['remote','trace'],best:1}]}),'CONTRADICTORY_CASE');
 assert.ok(dependencyIssue({...design,cases:[design.cases[0],{values:['local','replay'],best:1}]}));
});
test('blind evaluation hides expected winners and actually masks each factor',()=>{
 const views=blindViews(design);
 assert.equal(views.length,5);
 assert.ok(views.every(v=>!('best' in v)));
 assert.equal(views[3].observations.length,1);
 assert.equal(views[3].observations[0].value,'trace');
 const verdict={issue:'none',evidence:'Adjudicated the evidence',answers:[[0],[1],[1],[0,1],[1,0]]};
 assert.equal(adjudicate(design,verdict),null);
 assert.equal(adjudicate(design,{...verdict,answers:[[0,1],...verdict.answers.slice(1)]}),'AMBIGUOUS_CHOICE');
 assert.equal(adjudicate(design,{...verdict,answers:[[0],[0],...verdict.answers.slice(2)]}),'COUNTERFACTUAL_FAILED');
 const open={...design,alternatives:[...design.alternatives,'collect supplementary data']};
 assert.equal(adjudicate(open,{...verdict,answers:[[0,2],[1,2],[1,2],[0,1,2],[0,1,2]]},'essay'),null);
 assert.equal(adjudicate(open,{...verdict,answers:[[0,1],[1,0],[1,0],[0,1],[0,1]]},'essay'),'COUNTERFACTUAL_FAILED');
 assert.equal(adjudicate(design,{...verdict,answers:[...verdict.answers.slice(0,4),[0]]}),'ABLATION_FAILED');
});

test('failed preflight stops drafting and reuses only independently accepted slots on retry',async()=>{
 const ref={excerptId:'fixture',sourceHash:'a'.repeat(64),pdfPage:30,printedPage:null};
 const job={kind:'GENERATE',input:{schemaVersion:'study-engine-v3.1',inputDigest:'frozen',reasoningContract:CONTRACT,
  questionFormat:{required:{single_choice:1},extension:{essay:1}},
  passages:[{id:'fixture',sourceHash:ref.sourceHash,pageIndex:30,materialVersion:2,quality:'usable',text:'Synthetic test passage'}],
  blueprint:{slots:{required:[{order:1,kind:'single_choice',conceptId:'c'}],extension:[{order:1,kind:'essay',conceptId:'c'}]},
   testedConcepts:{c:{sourceVersion:2,sourcePageRefs:[ref]}}}}};
 const build=part=>({...design,part,order:1,excerptId:'fixture',scenario:'Testing contexts',notGiven:['later measurements'],
  rationale:'PRIVATE_RATIONALE_MARKER',hintPolicy:['orientation','factors','blank method']});
 const verdict=part=>({part,order:1,issue:'none',evidence:'Compared each available observation',answers:[[0],[1],[1],[0,1],[0,1]]});
 const phases=[];
 const adapter=new CodexAdapter();
 adapter.run=async(schema,prompt,phase)=>{
  phases.push(phase);
  if(phase==='design')return {slots:[build('required'),build('extension')]};
  assert.equal(phase,'blueprint_review');
  assert.doesNotMatch(prompt,/PRIVATE_RATIONALE_MARKER/);
  return {slots:[{...verdict('required'),issue:'AMBIGUOUS_CHOICE'},verdict('extension')]};
 };
 const rejected=await adapter.reasoningGeneration(job);
 assert.deepEqual(phases,['design','blueprint_review']);
 assert.equal(rejected.required,undefined);
 job.previousPreflight=rejected.preflight;
 const revised=build('required');
 const q=part=>({id:part+'-question',order:1,version:1});
 adapter.run=async(schema,prompt,phase)=>{
  if(phase==='design'){
   assert.equal(schema.properties.slots.maxItems,1);
   return {slots:[revised]};
  }
  if(phase==='blueprint_review')return {slots:[verdict('required')]};
  if(phase==='generation')return {requiredQuestions:[q('required')],extensionQuestions:[q('extension')],keys:[],followUps:[]};
  assert.equal(phase,'candidate_review');
  assert.doesNotMatch(prompt,/PRIVATE_RATIONALE_MARKER/);
  return {verdicts:[]};
 };
 const out=await adapter.reasoningGeneration(job);
 assert.equal(out.preflight.slots[1].questionId,'extension-question');
 assert.deepEqual(out.preflight.slots[1].design,rejected.preflight.slots[1].design);
 assert.equal(out.preflight.inputDigest,'frozen');
 assert.equal(rejected.preflight.slots[1].questionId,undefined);
 job.previousPreflight.inputDigest='another plan';
 await assert.rejects(()=>adapter.reasoningGeneration(job),/INVALID_PREFLIGHT_CHECKPOINT/);
});
