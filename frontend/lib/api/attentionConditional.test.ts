import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiClient,ApiError} from './client';
test('conditional GET retains ETag, consumes 200 and accepts a bodyless 304',async()=>{
 const original=globalThis.fetch;const requests:RequestInit[]=[];let call=0;
 globalThis.fetch=async(_url,init)=>{requests.push(init!);return call++===0?new Response(JSON.stringify({queueRevision:7}),{headers:{ETag:'"owner-7"'}}):new Response(null,{status:304,headers:{ETag:'"owner-7"'}});};
 try{const first=await apiClient.conditional<{queueRevision:number}>('/snapshot');assert.equal(first.data?.queueRevision,7);assert.equal(first.etag,'"owner-7"');const warm=await apiClient.conditional('/snapshot',first.etag!);assert.equal(warm.data,null);assert.equal((requests[1].headers as Record<string,string>)['If-None-Match'],'"owner-7"');assert.equal(requests[1].cache,'no-store');}finally{globalThis.fetch=original;}
});
test('normal API methods keep their response shape and preserve conflict latest data',async()=>{
 const original=globalThis.fetch;let conflict=false;
 globalThis.fetch=async()=>conflict?new Response(JSON.stringify({code:'MEMO_REVISION_CONFLICT',latest:{memo:'server'}}),{status:409}):new Response(JSON.stringify({item:{memo:'saved'}}));
 try{assert.deepEqual(await apiClient.post('/memo',{}),{item:{memo:'saved'}});conflict=true;await assert.rejects(apiClient.post('/memo',{}),error=>error instanceof ApiError&&error.status===409&&(error.details.latest as {memo:string}).memo==='server');}finally{globalThis.fetch=original;}
});
