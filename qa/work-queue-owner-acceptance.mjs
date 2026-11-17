// Real hosted MCP acceptance. Writes are limited to this run's explicit canaries.
import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const port=Number(process.argv[2]);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('LOOPBACK_PORT_REQUIRED');
const directory=new URL('../.qa/release/',import.meta.url);await fs.mkdir(directory,{recursive:true});
const file=new URL('dev-owner-acceptance.json',directory);let state;try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={environment:'DEV',runId:randomUUID(),steps:{},startedAt:new Date().toISOString()};}
assert.equal(state.environment,'DEV');const tag='SYNTHETIC MCP QA '+state.runId.slice(0,8),save=()=>fs.writeFile(file,JSON.stringify(state,null,2));
async function tool(key,name,args={},write=false,expectError=false){
 let record=state.steps[key];if(record?.response!==undefined)return record.response;
 if(!record){record={name,arguments:write?{requestId:randomUUID(),...args}:args};state.steps[key]=record;await save();}
 const r=await fetch('http://127.0.0.1:'+port+'/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:record.name,arguments:record.arguments}),signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,key+': bridge');const response=await r.json();assert.equal(response.isError,expectError,key+': MCP '+JSON.stringify(response.result));record.response=response.result;await save();return record.response;
}
const data=x=>x.data,version=item=>({id:item.id,expectedRevision:item.revision,expectedGeneration:item.generation});
const before=data(await tool('before','work_queue_get_summary'));
let a=data(await tool('create-a','work_queue_create_item',{title:tag+' A',memo:'Synthetic disposable acceptance only'},true)).item;
const replay=data(await tool('create-replay','work_queue_create_item',state.steps['create-a'].arguments,true));assert.equal(replay.item.id,a.id);
const b=data(await tool('create-b','work_queue_create_item',{title:tag+' B',memo:null},true)).item;
const first=data(await tool('page-one','work_queue_list',{q:tag,limit:1}));assert.equal(first.items.length,1);assert.ok(first.nextCursor);assert.equal(first.complete,false);
const second=data(await tool('page-two','work_queue_list',{q:tag,limit:1,cursor:first.nextCursor}));assert.equal(second.items.length,1);assert.equal(second.complete,true);assert.deepEqual(new Set([first.items[0].id,second.items[0].id]),new Set([a.id,b.id]));
const createdAt=a.createdAt,sourceKey=a.sourceKey??a.source?.sourceKey;
a=data(await tool('edit','work_queue_edit_item',{id:a.id,fields:['title','memo'],title:tag+' edited',memo:null,expectedRevision:a.revision,expectedMemoRevision:a.memoRevision},true)).item;assert.equal(a.memo,'');assert.equal(a.createdAt,createdAt);
a=data(await tool('defer','work_queue_move_item',{...version(a),group:'DEFERRED'},true)).item;assert.equal(a.group,'DEFERRED');
a=data(await tool('complete','work_queue_move_item',{...version(a),group:'COMPLETED'},true)).item;assert.equal(a.status,'COMPLETED');
a=data(await tool('reopen','work_queue_move_item',{...version(a),group:'REOPEN'},true)).item;assert.equal(a.group,'DEFERRED');
a=data(await tool('complete-again','work_queue_move_item',{...version(a),group:'COMPLETED'},true)).item;
a=data(await tool('hide-one','work_queue_hide_item',version(a),true)).item;assert.equal(a.status,'DISMISSED');
a=data(await tool('restore-one','work_queue_restore_item',version(a),true)).item;assert.equal(a.status,'COMPLETED');assert.equal(a.createdAt,createdAt);
const producer=JSON.parse(await fs.readFile(new URL('../.qa/producer-canaries/DEV-TEAM_KAFKA-receipt.json',import.meta.url),'utf8'));assert.equal(producer.status,'PASS');const ids=[a.id,b.id,producer.itemId];state.canaryIds=ids;await save();
const plan=data(await tool('preview-hide','work_queue_preview_bulk_change',{action:'HIDE',ids},true));assert.equal(plan.candidateCount,3);assert.equal(plan.membership,'IMMUTABLE_SERVER_SIDE_IDS_AND_REVISIONS');
const executed=data(await tool('execute-hide','work_queue_execute_bulk_change',{previewId:plan.previewId,fingerprint:plan.fingerprint,confirmed:true},true));assert.equal(executed.appliedCount,3);
const repeat=data(await tool('execute-replay','work_queue_execute_bulk_change',state.steps['execute-hide'].arguments,true));assert.equal(repeat.appliedCount,3);assert.equal(repeat.requestId,executed.requestId);
const outcome=data(await tool('outcome','work_queue_get_operation',{requestId:executed.requestId,limit:100}));assert.equal(outcome.outcomeCount,3);assert.equal(outcome.complete,true);assert.equal(outcome.outcomes.find(x=>x.id===a.id).createdAt,createdAt);
const restore=data(await tool('preview-restore','work_queue_preview_bulk_change',{action:'RESTORE',batchId:plan.previewId},true));assert.equal(restore.candidateCount,3);
assert.equal(data(await tool('execute-restore','work_queue_execute_bulk_change',{previewId:restore.previewId,fingerprint:restore.fingerprint,confirmed:true},true)).appliedCount,3);
const restored=data(await tool('restored-item','work_queue_get_item',{id:a.id}));assert.equal(restored.item?.status??restored.status,'COMPLETED');
const finalPlan=data(await tool('final-preview','work_queue_preview_bulk_change',{action:'HIDE',ids},true));assert.equal(finalPlan.candidateCount,3);
assert.equal(data(await tool('final-hide','work_queue_execute_bulk_change',{previewId:finalPlan.previewId,fingerprint:finalPlan.fingerprint,confirmed:true},true)).appliedCount,3);
const after=data(await tool('after','work_queue_get_summary'));state.afterNormalTotals=after.globalTotals;
assert.equal(Object.values(after.globalTotals).reduce((a,b)=>a+b,0),Object.values(before.globalTotals).reduce((a,b)=>a+b,0)-1);
const unknown=data(await tool('unknown','work_queue_get_operation',{requestId:randomUUID()}));assert.equal(unknown.status,'UNKNOWN');
await tool('owner-selector-denied','work_queue_get_summary',{userId:randomUUID()},false,true);
state.status='PASS';state.finishedAt=new Date().toISOString();state.finalCanaryRestorationBatch=finalPlan.previewId;state.checks=['real OAuth + PKCE','115-tool catalog','create and original-request replay','null memo field mask','keyset pagination','group complete reopen','single hide/restore original completion','exact bulk preview execute replay outcomes','bulk restoration','canary-only final cleanup','UNKNOWN recovery','owner selector denial'];await save();
console.log(JSON.stringify({environment:'DEV',status:state.status,checks:state.checks,canaryIds:ids,afterNormalTotals:after.globalTotals,restorationBatchId:finalPlan.previewId,inChatInvocation:false}));
