import test from 'node:test';
import assert from 'node:assert/strict';
import {inventory,auditAnswer,auditDigest} from './grounding.mjs';
const plan={inputDigest:'frozen',repairFeedback:{issue:'PRIOR_DIAGNOSTIC'},passages:[
 {id:'excerpt',materialId:'m',text:'A decision can depend on a locally observed state.'},
 {id:'other',materialId:'m',text:'UNRELATED_PASSAGE'}]};
const q={id:'q1',version:1,order:1,kind:'essay',prompt:'What should be checked?',context:'The room was not supplied.',source:{section:'excerpt',materialId:'m'}};
const k={answer:'Inspect the booking.',explanation:'Do not infer the room.',model:'Compare the booking and rule.',
 rubric:['Credit conditional alternatives.'],incorrectReasons:{B:'The replacement leaves retention unknown.'},reasoningMoves:['Compare observations.'],hints:['PRIVATE_HINT']};
test('audit gets all private grading fields and only learner-visible evidence for the primary source',async()=>{
 const a=await auditAnswer(plan,'required',q,k,async(schema,prompt,phase)=>{
  assert.equal(phase,'answer_grounding');
  assert.doesNotMatch(prompt,/PRIOR_DIAGNOSTIC|UNRELATED_PASSAGE|PRIVATE_HINT/);
  const {visible,targets}=JSON.parse(prompt.split('\n').at(-1));
  assert.deepEqual(Object.keys(targets).sort(),['answer','explanation','incorrect.B','model','move.0','rubric.0']);
  assert.deepEqual(Object.keys(visible),['prompt','context','source.excerpt']);
  return {components:[]};
 });
 assert.equal(a.digest.length,64);
 const original=inventory(plan,q,k);
 for (const change of [{...k,model:'The default persists.'},{...k,rubric:['Require the north room.']}]){
  const diff=inventory(plan,q,change);
  assert.notEqual(auditDigest(plan,'required',q,diff.visible,diff.targets),a.digest);
 }
 assert.notEqual(auditDigest(plan,'required',{...q,version:2},original.visible,original.targets),a.digest);
});
