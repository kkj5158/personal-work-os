import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workbenchAction,previewCanConfirm} from './workbench';
const base={hasChoice:false,adoptable:false,hasDraft:false};
test('unknown outcomes always route to original request lookup even with a chosen draft',()=>{
 assert.equal(workbenchAction({...base,hasChoice:true,adoptable:true,saveStatus:'OUTCOME_UNKNOWN'}),'LOOKUP_SAVE');
 assert.equal(workbenchAction({...base,hasChoice:true,recommendationStatus:'EXTERNAL_OUTCOME_UNKNOWN'}),'LOOKUP_RECOMMENDATION');
});
test('known failure retries are distinct from pending or conflicting work',()=>{
 assert.equal(workbenchAction({...base,recommendationStatus:'FAILED_KNOWN'}),'RETRY_KNOWN');
 for(const recommendationStatus of ['QUEUED','RUNNING','BUDGET_WAIT'])assert.equal(workbenchAction({...base,recommendationStatus}),'WAIT');
 assert.equal(workbenchAction({...base,hasChoice:true,conflict:true}),'COMPARE');
});
test('adoption requires a second explicit save action for a persisted choice',()=>{
 assert.equal(workbenchAction({...base,hasDraft:true,adoptable:true}),'ADOPT');
 assert.equal(workbenchAction({...base,hasDraft:true,adoptable:true,hasChoice:true}),'SAVE_CHOICE');
 assert.equal(workbenchAction(base),'REQUEST');
});
test('preview confirmation requires eligible rows and balanced server counts',()=>{
 assert.equal(previewCanConfirm(3,2,1,false),true);
 assert.equal(previewCanConfirm(3,3,1,false),false);
 assert.equal(previewCanConfirm(3,0,3,false),false);
 assert.equal(previewCanConfirm(3,2,1,true),false);
});
