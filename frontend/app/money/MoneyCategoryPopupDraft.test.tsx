import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api, type Category} from '@/lib/money/model';
import type {MoneyCache} from '@/lib/money/cache';
import type {BookRow} from './MoneyWebData';
import {MoneyDataProvider, useMoneyCache} from './MoneyDataProvider';

const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,nextLoad:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,nextLoad){return url.endsWith('.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const categories=[{id:'root',name:'생활',parentId:null},{id:'other',name:'카페',parentId:null},{id:'child',name:'커피',parentId:'other'}].map(category=>({...category,kind:'EXPENSE',archived:false,version:0,color:'#333'})) as Category[];
const book:BookRow={id:'tx',type:'EXPENSE',title:'거래 제목',memo:null,categoryId:'root',amount:12000,accountId:'a',counterpartyText:'상점',occurredAt:'2026-10-14T00:00:00Z',excluded:false,version:0,transactionVersion:0,projectionVersion:0,classificationVersion:0,ruleDefaults:{},ruleEvidence:{},overrides:{},source:{title:'거래 제목',memo:null,categoryId:'root',amount:12000,accountId:'a',counterpartyText:'상점',occurredAt:'2026-10-14T00:00:00Z',excluded:false},refundOf:null};
const run=async(action:()=>void)=>{await act(async()=>{action();for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));});};
function dialog(){const node=document.querySelector<HTMLElement>('[role="dialog"]');assert.ok(node);return node;}
function popupButton(label:string){const node=[...dialog().querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()===label);assert.ok(node,'Missing popup button '+label);return node;}

test('actual category popup retains eviction drafts, guards stale versions, and clears only on discard, successful save or owner change',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/bookkeeping'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(callback:()=>void)=>setTimeout(callback,0),IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const {RecommendationProvider,RecommendationCategory}=await import('./MoneyBookkeepingRecommendations');
 const original={get:api.get,post:api.post};
 let current={...book},shown=true,activeCategories=categories,cache:MoneyCache|null=null,saveFails=false;
 const writes:{path:string;body:unknown}[]=[];
 api.get=async<T,>(path:string)=> {
   if(path.includes('/current/'))return {stamp:'stamp-'+current.version,book:current} as T;
   if(path.endsWith('/activity'))return {recommendations:[],saves:[]} as T;
   return {items:[]} as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
   writes.push({path,body});
   if(path.endsWith('/choices'))return {status:saveFails?'NOT_APPLIED':'APPLIED',reason:'선택 충돌'} as T;
   if(path.endsWith('/save')){
     const command=body as {items:{categoryId:string}[]};current={...current,categoryId:command.items[0].categoryId,version:current.version+1};
     return {id:'saved',items:[{id:'tx',transactionId:'tx',status:'SAVED',result:{book:current}}]} as T;
   }
   throw Error('Unexpected write '+path);
 };
 function Capture(){cache=useMoneyCache();return null;}
 const render=async()=>{await run(()=>root.render(<MoneyDataProvider><Capture/><RecommendationProvider filters={{}} selected={[]} visible={shown?['tx']:[]} categories={activeCategories} accounts={[]} workbench={false}>{shown&&<RecommendationCategory row={current} categories={activeCategories} compact/>}</RecommendationProvider></MoneyDataProvider>));};
 const open=async()=>{await run(()=>document.querySelector<HTMLButtonElement>('[aria-label="거래 제목 직접 분류"]')!.click());};
 const evict=async()=>{shown=false;await render();assert.equal(document.querySelector('[role="dialog"]'),null);shown=true;await render();await open();};
 const choose=async()=>{await run(()=>popupButton('카페').click());await run(()=>popupButton('커피').click());await run(()=>dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());};
 try{
   await render();await open();await choose();
   const search=dialog().querySelector<HTMLInputElement>('[aria-label="카테고리 이름·이모지 검색"]')!;
   await run(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(search,'커피');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
   await evict();
   assert.equal(popupButton('커피').getAttribute('aria-pressed'),'true');
   assert.equal(popupButton('카페').getAttribute('aria-pressed'),'true');
   assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,true);
   assert.equal(dialog().querySelector<HTMLInputElement>('[aria-label="카테고리 이름·이모지 검색"]')!.value,'커피');
   assert.equal(writes.length,0,'Eviction/restoration never writes classification');
   current={...current,version:1};await evict();
   assert.ok(popupButton('분류 저장').disabled,'Original baseline survives eviction and requires acknowledgement');
   await run(()=>popupButton('표시된 최신 값 확인').click());
   saveFails=true;await run(()=>popupButton('분류 저장').click());await evict();
   assert.equal(popupButton('커피').getAttribute('aria-pressed'),'true','Failed command preserves local choice');
   await run(()=>popupButton('닫기').click());await run(()=>popupButton('버리기').click());await open();
   assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,false);
   assert.equal(dialog().querySelector<HTMLInputElement>('[aria-label="카테고리 이름·이모지 검색"]')!.value,'');
   assert.equal(popupButton('생활').getAttribute('aria-pressed'),'true','Explicit discard resets the original saved category');
   await choose();saveFails=false;await run(()=>popupButton('분류 저장').click());
   assert.equal(document.querySelector('[role="dialog"]'),null,'Successful save closes the picker');
   await render();await open();assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,false,'Saved local-only option never leaks into the next edit');
   await run(()=>popupButton('생활').click());await run(()=>popupButton('소분류 없음').click());await evict();
   activeCategories=categories.map(category=>category.id==='root'?{...category,archived:true}:category);await evict();
   assert.ok(popupButton('분류 저장').disabled,'Archived choices cannot be revived as valid saves');
   activeCategories=categories;await run(()=>cache!.setScope('other-owner'));await render();await open();
   assert.equal(popupButton('커피').getAttribute('aria-pressed'),'true','Owner boundary resets local draft to the current saved category');
   assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,false);
   await choose();
   current={...current,type:'INCOME',categoryId:null};activeCategories=[];await evict();
   assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,false,'A different financial kind starts a fresh picker');
   current={...current,type:'EXPENSE',categoryId:'child'};activeCategories=categories;await evict();
   assert.equal(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked,false,'Returning to the former kind cannot resurrect its obsolete draft');
 }finally{api.get=original.get;api.post=original.post;await act(()=>root.unmount());dom.window.close();}
});
