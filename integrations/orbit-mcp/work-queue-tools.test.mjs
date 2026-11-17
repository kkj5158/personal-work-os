import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queueTools,validateQueue,callQueue} from './work-queue-tools.mjs';
const id='00000000-0000-0000-0000-000000000001';
test('bounded queue schemas distinguish reads, reversible writes, secrets and field masks',()=>{
 assert.equal(queueTools.length,14);assert.equal(new Set(queueTools.map(t=>t.name)).size,14);
 assert.ok(queueTools.filter(t=>!t.annotations.readOnlyHint).every(t=>t.securitySchemes[0].scopes.includes('orbit:write:work-queue')));
 assert.throws(()=>validateQueue('work_queue_list',{ownerId:id}));assert.throws(()=>validateQueue('work_queue_create_item',{requestId:id,title:'x',token:'secret'}));assert.throws(()=>validateQueue('work_queue_execute_bulk_change',{requestId:id,previewId:id,fingerprint:'0'.repeat(64),confirmed:false}));
 assert.throws(()=>validateQueue('work_queue_preview_bulk_change',{requestId:id,action:'DELETE'}));assert.throws(()=>validateQueue('work_queue_list',{limit:101}));
 validateQueue('work_queue_edit_item',{requestId:id,id,fields:['memo'],memo:null,expectedRevision:2,expectedMemoRevision:1});
 assert.ok(!queueTools.some(t=>/issue|sql|proxy/.test(t.name)));
});
test('queue calls bind exact fixed origin, query and JSON body to the signed entitlement',async()=>{
 let seen;const args={requestId:id,title:'synthetic'};
 const result=await callQueue('work_queue_create_item',args,{origin:'https://personal-work-os-prod-production.up.railway.app',token:'memory-only',proof:async request=>{assert.equal(request.method,'POST');assert.equal(request.path,'/api/orbit/work-queue/v1/create');assert.deepEqual(JSON.parse(request.body),args);return 'signed';},fetcher:async(url,options)=>{seen=url;assert.equal(options.headers['X-Orbit-Work-Queue-Proof'],'signed');assert.equal(options.redirect,'error');return new Response('{"data":{"status":"APPLIED"}}',{headers:{'Content-Type':'application/json'}});}});
 assert.equal(result.data.status,'APPLIED');assert.equal(seen.origin,'https://personal-work-os-prod-production.up.railway.app');await assert.rejects(callQueue('work_queue_get_summary',{}, {origin:'https://evil.invalid',token:'x'}),/FORBIDDEN/);
});
test('conflicts retain actionable canonical codes and do not become a success or automatic retry',async()=>{
 let requests=0;
 await assert.rejects(callQueue('work_queue_execute_bulk_change',{requestId:id,previewId:id,fingerprint:'0'.repeat(64),confirmed:true},{origin:'https://personal-work-os-prod-production.up.railway.app',token:'memory',proof:async()=>'proof',fetcher:async()=>{requests++;return new Response('{"code":"BULK_REVISION_CONFLICT"}',{status:409,headers:{'Content-Type':'application/json'}});}}),e=>e.message==='CONFLICT'&&e.queueResult.code==='BULK_REVISION_CONFLICT');assert.equal(requests,1);
});
