import {test}from'node:test';
import assert from'node:assert/strict';
import {tools,validate,call,dispatch}from'./server.mjs';
test('exactly 20 read tools and no arbitrary URL/SQL/user selector',()=>{
 assert.equal(new Set(tools.map(t=>t.name)).size,20);
 for(const tool of tools){assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.inputSchema.additionalProperties,false);validate(tool.name,{});}
 for(const [name,args]of [['query',{}],['get_diet_context',{userId:'a'}],['get_workflow_tasks_context',{limit:101}],['get_diet_context',{from:'2026-01-01'}]])assert.throws(()=>validate(name,args));
});
test('token and fixed-origin checks precede the network',async()=>{
 let called=false;const fetcher=()=>{called=true;};
 await assert.rejects(call('get_diet_context',{},{origin:'https://evil.invalid',token:'eyJa.eyJa.sig',fetcher}));
 await assert.rejects(call('get_diet_context',{},{origin:'https://personal-work-os-prod-production.up.railway.app',token:'tk_wf_prod_private',fetcher}));
 assert.equal(called,false);
});
test('only approved GET operation, auth in header, and bounded JSON',async()=>{
 const data=await call('get_diet_context',{},{origin:'https://personal-work-os-prod-production.up.railway.app',token:'eyJa.eyJa.sig',fetcher:async(url,options)=>{
  assert.equal(url.pathname,'/api/orbit/context/get_diet_context');assert.equal(url.search,'');assert.equal(options.redirect,'error');assert.ok(options.headers.Authorization.startsWith('Bearer '));
  return new Response('{"schemaVersion":1,"data":[]}',{headers:{'content-type':'application/json'}});
 }});assert.equal(data.schemaVersion,1);
 await assert.rejects(call('get_diet_context',{},{origin:'https://personal-work-os-prod-production.up.railway.app',token:'eyJa.eyJa.sig',fetcher:async()=>new Response('x'.repeat(262145),{headers:{'content-type':'application/json'}})}));
});
test('MCP initialize/list and sanitized errors',async()=>{
 assert.equal((await dispatch({id:1,method:'initialize'})).result.serverInfo.name,'orbit-pos-context-v1');
 assert.equal((await dispatch({id:2,method:'tools/list'})).result.tools.length,20);
 assert.equal((await dispatch({id:3,method:'tools/call',params:{name:'sql'}})).result.isError,true);
});
