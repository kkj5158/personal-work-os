import test from 'node:test';
import assert from 'node:assert/strict';
import {auditIssue, auditDecision, dependencyIssue} from './reasoning.mjs';

const transport = {
  scenario:'A single courier must carry both crates together. Choose the least expensive vehicle that fits both. A bike holds 4 kg, a van 8 kg.',
  criteria:'Choose the least expensive feasible vehicle. The bike costs less.',
  alternatives:['Bike', 'Van'], pattern:'compare_remedies', target:'multi_evidence',
  factors:['first crate','second crate'], cases:[
    {values:['3 kg','2 kg'],best:1},{values:['1 kg','2 kg'],best:0},{values:['3 kg','1 kg'],best:0}]
};
const verdict = {
  hypotheses:['first crate consumes capacity','second crate consumes capacity'],
  pairs:[{left:0,right:1,relation:'compatible',evidence:'The crates travel together.'}],
  otherWorld:'same_best',worldEvidence:'At 5 kg the cheaper bike cannot complete the trip.',
  criterionBasis:'scenario',criterionQuote:'Choose the least expensive feasible vehicle.',
  sufficiency:'Total load exceeds bike capacity and fits the van.',best:[1],
  missingDiscriminator:'None',repair:'No repair needed',tests:[],testsDiscriminate:'not_applicable'
};
test('compatible constraints can identify one action when two visible observations suffice',()=>{
  assert.equal(dependencyIssue(transport),null);
  assert.equal(auditIssue(transport,verdict,''),null);
});
test('an equally consistent rival world overrides an apparently unique choice and ablation',()=>{
  assert.equal(auditIssue(transport,{...verdict,otherWorld:'changes_best'},''),'AMBIGUOUS_CHOICE');
  assert.equal(auditIssue(transport,{...verdict,otherWorld:'uncertain'},''),'UNCERTAIN');
  assert.equal(auditIssue(transport,{...verdict,pairs:[]},''),'UNCERTAIN');
});
test('an unsupported priority and a mismatched source quotation fail',()=>{
  assert.equal(auditIssue(transport,{...verdict,criterionBasis:'unsupported'},''),'UNSUPPORTED_INFERENCE');
  assert.equal(auditIssue(transport,{...verdict,criterionBasis:'source'},'Other passage.'),'UNSUPPORTED_INFERENCE');
});
test('a discriminating test can succeed while the cause is unknown',()=>{
  const d={...transport,pattern:'next_test',scenario:'A sensor or its cable can fail, also together. Spare components are verified. No replacement is authorized.',criteria:'Test both components separately without changing the installation.',alternatives:['Read the original combined alarm again','Use the two isolated test ports'],cases:[{values:['both ports accessible','bench supply available'],best:1}]};
  const a={...verdict,hypotheses:['sensor fault','cable fault'],criterionQuote:d.criteria,
    pairs:[{left:0,right:1,relation:'compatible',evidence:'Both parts can be faulty.'}],worldEvidence:'The combined fault fails both isolated checks.',
    testsDiscriminate:'yes',tests:[
      {option:0,predictions:['alarm','alarm'],costRisk:'read only'},
      {option:1,predictions:['sensor port fails','cable port fails'],costRisk:'available isolated test ports'}]};
  assert.equal(auditIssue(d,a,''),null);
  assert.equal(auditIssue(d,{...a,tests:[a.tests[0],{...a.tests[1],predictions:['alarm','alarm']}]},''),'UNSUPPORTED_INFERENCE');
  assert.equal(auditIssue(d,{...a,testsDiscriminate:'no'},''),'UNSUPPORTED_INFERENCE');
});
test('decision reviewer gets only the actual learner-visible scenario and source', async()=>{
  await auditDecision({...transport,rationale:'HIDDEN_KEY'},'source',async(schema,prompt,stage)=>{
    assert.equal(stage,'decision_audit');
    const payload=JSON.parse(prompt.split('\n').at(-1));
    assert.deepEqual(payload.observations.map(o=>o.value),transport.cases[0].values);
    assert.doesNotMatch(JSON.stringify(payload),/HIDDEN_KEY|"best"|1 kg/);
    return verdict;
  });
});