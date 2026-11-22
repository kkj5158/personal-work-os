import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyIssue, adjudicate, blindViews} from './reasoning.mjs';

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
 assert.equal(adjudicate(design,{...verdict,answers:[...verdict.answers.slice(0,4),[0]]}),'ABLATION_FAILED');
});
