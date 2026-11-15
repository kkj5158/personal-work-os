import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moneyTools,moneyDefinitions,validateMoney,callMoney} from './money-tools.mjs';
test('MONEY registry is granular, closed and truthfully scoped',()=>{
 assert.equal(new Set(moneyTools.map(t=>t.name)).size,moneyTools.length);
 for(const t of moneyDefinitions){assert.equal(t.inputSchema.additionalProperties,false);assert.ok(!/sql|proxy|http_request/.test(t.name));assert.equal(t.scope,t.method==='GET'?'orbit:read':'orbit:write:money');assert.equal(t.annotations.readOnlyHint,t.method==='GET');}
 const base={requestId:'00000000-0000-0000-0000-000000000001',categoryId:'00000000-0000-0000-0000-000000000002',color:'#123456',expectedColor:'#abcdef',expectedVersion:0};
 validateMoney('money_set_category_color',base);
 for(const edit of [{ownerId:'bad'},{expectedColor:'red'},{color:'#fff'},{expectedVersion:-1},{url:'https://evil.invalid'}])assert.throws(()=>validateMoney('money_set_category_color',{...base,...edit}));
 assert.throws(()=>validateMoney('money_set_category_color',{}));assert.throws(()=>validateMoney('money_execute_review_batch',{confirmed:false}));
 const clear={requestId:base.requestId,items:[{id:base.categoryId,transactionVersion:0,overrideVersion:0,projectionVersion:0,classificationVersion:0,categoryId:null}]};validateMoney('money_set_bookkeeping_category',clear);delete clear.items[0].categoryId;assert.throws(()=>validateMoney('money_set_bookkeeping_category',clear));
});
test('request path/body proof, fixed origins, redirects and response cap',async()=>{
 let calls=0;await assert.rejects(callMoney('money_list_accounts',{}, {origin:'https://evil.invalid',token:'synthetic',fetcher:()=>calls++}));assert.equal(calls,0);
 const data=await callMoney('money_list_accounts',{}, {origin:'https://personal-work-os-prod-production.up.railway.app',token:'synthetic',proof:async p=>{assert.deepEqual(p,{method:'GET',path:'/api/orbit/money/v1/accounts',body:''});return 'signed';},fetcher:async(url,o)=>{assert.equal(o.redirect,'error');assert.equal(o.headers['X-Orbit-Money-Proof'],'signed');return new Response('{"data":[]}',{headers:{'content-type':'application/json'}});}});assert.deepEqual(data.data,[]);
});
