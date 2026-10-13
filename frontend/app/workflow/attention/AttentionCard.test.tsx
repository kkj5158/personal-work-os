import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import AttentionCard from './AttentionCard';
import {attentionApi,type AttentionItem} from '@/lib/api/attention';
import {ApiError} from '@/lib/api/client';

test('response loss retries the same operation; conflict keeps draft until explicit owner resolution',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/workflow/attention'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');
 const item={id:crypto.randomUUID(),action:'한국어 메모',projectLabel:'QA',memo:'원래 메모',memoRevision:2,revision:4,status:'OPEN',createdAt:new Date().toISOString(),source:{kind:'CHATGPT',intent:'RESPONSE_COMPLETED',generation:'g'}} as AttentionItem;
 const original=attentionApi.memo,calls:Parameters<typeof attentionApi.memo>[1][]=[],held:boolean[]=[],acks:string[]=[];let failure:'network'|'conflict'|'none'='network';
 attentionApi.memo=async(_id,body)=>{calls.push({...body});if(failure==='network')throw new Error('response lost');if(failure==='conflict')throw new ApiError(409,'conflict',{latest:{...item,memo:'서버 최신 메모',memoRevision:5}});return {operationId:body.operationId,queueRevision:10,item:{...item,memo:body.memo,memoRevision:body.expectedMemoRevision+1}};};
 const root=createRoot(document.getElementById('root')!);const button=(text:string)=>[...document.querySelectorAll('button')].find(node=>node.textContent===text)!;
 try{
  await act(()=>root.render(<AttentionCard item={item} lanes={[]} disabled={false} onComplete={()=>{}} onSource={()=>{}} onEdit={()=>{}} onHold={(_id,value)=>held.push(value)} onMemo={result=>acks.push(result.item!.memo!)}/>));
  await act(()=>document.querySelector<HTMLElement>('[data-memo-preview]')!.click());
  await act(async()=>{button('메모 저장').click();});assert.equal(document.querySelector('textarea')?.value,'원래 메모');assert.match(document.querySelector('[role="status"]')!.textContent!,/유지/);
  failure='none';await act(async()=>{button('메모 저장').click();});assert.deepEqual(calls[0],calls[1]);assert.deepEqual(acks,['원래 메모']);assert.equal(document.querySelector('textarea'),null);
  await act(()=>document.querySelector<HTMLElement>('[data-memo-preview]')!.click());failure='conflict';await act(async()=>{button('메모 저장').click();});assert.equal(document.querySelector('textarea')?.value,'원래 메모');assert.equal(document.querySelector('pre')?.textContent,'서버 최신 메모');assert.equal(button('메모 저장').disabled,true);assert.equal(calls.at(-1)?.expectedMemoRevision,2);
  await act(()=>button('최신 메모 확인 후 내 입력 유지').click());assert.equal(calls.length,3);failure='none';await act(async()=>{button('메모 저장').click();});assert.equal(calls.at(-1)?.expectedMemoRevision,5);assert.notEqual(calls.at(-1)?.operationId,calls[2].operationId);assert.equal(held.at(-1),false);
 }finally{attentionApi.memo=original;await act(()=>root.unmount());dom.window.close();}
});
