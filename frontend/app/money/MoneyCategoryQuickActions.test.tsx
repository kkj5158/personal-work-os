import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api,type Category} from '@/lib/money/model';
import type {BookRow} from './MoneyWebData';
import {MoneyDataProvider} from './MoneyDataProvider';

const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const categories=[{id:'root',name:'생활',parentId:null},{id:'cafe',name:'카페',parentId:null},{id:'coffee',name:'커피',parentId:'cafe'}].map(c=>({...c,kind:'EXPENSE',archived:false,version:0,color:'#64748b'})) as Category[];
const book={id:'tx',type:'EXPENSE',title:'테스트 거래',memo:null,categoryId:'root',amount:12000,accountId:'account',counterpartyText:'상점',occurredAt:'2026-10-14T00:00:00Z',excluded:false,version:0,transactionVersion:0,projectionVersion:0,classificationVersion:0,ruleDefaults:{},ruleEvidence:{},overrides:{},source:{},refundOf:null} as BookRow;
const run=async(action:()=>void)=>{await act(async()=>{action();for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));});};
const dialog=()=>document.querySelector<HTMLElement>('[role="dialog"]')!;
function button(label:string){const found=[...dialog().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);assert.ok(found,'Missing button: '+label);return found;}

test('ledger quick creation reconciles IDs and double-click uses one guarded explicit save path with retry',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/bookkeeping'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:(cb:()=>void)=>setTimeout(cb,0),IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);
 const {RecommendationProvider,RecommendationCategory}=await import('./MoneyBookkeepingRecommendations');
 const original={get:api.get,post:api.post};
 let current={...book},activeCategories=categories,failSave=false,holdLookup=false,releaseLookup:(()=>void)|undefined,lookupCount=0;
 const writes:{path:string;body:unknown}[]=[];
 api.get=async<T,>(path:string)=>{
  if(path.includes('/current/')){lookupCount++;if(holdLookup)await new Promise<void>(resolve=>{releaseLookup=resolve;});return {stamp:'v'+current.version,book:current} as T;}
  if(path.endsWith('/activity'))return {recommendations:[],saves:[]} as T;
  return {items:[]} as T;
 };
 api.post=async<T,>(path:string,body:unknown)=>{
  writes.push({path,body});
  if(path==='/categories')return {...categories[2],id:'new',name:'음료'} as T;
  if(path.endsWith('/choices'))return {status:'APPLIED'} as T;
  if(path.endsWith('/save')){
   const command=body as {items:{categoryId:string}[]};
   if(!failSave)current={...current,categoryId:command.items[0].categoryId,version:current.version+1};
   return {id:'save-'+writes.length,items:[{id:'item',transactionId:'tx',status:failSave?'NOT_APPLIED':'SAVED',result:failSave?{reason:'다시 시도해 주세요.'}:{book:current}}]} as T;
  }
  throw Error('Unexpected POST '+path);
 };
 const render=()=>run(()=>root.render(<MoneyDataProvider><RecommendationProvider filters={{}} selected={[]} visible={['tx']} categories={activeCategories} accounts={[]} workbench={false}><RecommendationCategory row={current} categories={activeCategories} compact/></RecommendationProvider></MoneyDataProvider>));
 const open=()=>run(()=>document.querySelector<HTMLButtonElement>('[aria-label="테스트 거래 직접 분류"]')!.click());
 const doubleClick=(target:HTMLButtonElement)=>{target.click();target.click();target.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true}));};
 const saves=()=>writes.filter(w=>w.path.endsWith('/save'));
 const lastCommand=()=>((saves().at(-1)!.body as {items:{categoryId:string;thisTransactionOnly:boolean;expectedStamp:string}[]}).items[0]);
 try{
  await render();await open();
  await run(()=>button('카페').click());await run(()=>button('커피').click());
  assert.equal(saves().length,0,'Single clicks only select and reveal children');
  const create=dialog().querySelector<HTMLDetailsElement>('details')!;await run(()=>{create.open=true;});
  assert.ok(button('생성 후 선택').disabled,'Blank input cannot create a category');
  const input=create.querySelector<HTMLInputElement>('input')!;
  assert.equal(input.placeholder,'예: 도서, 음료');assert.match(create.textContent! ,/카페.*새 소분류/);
  await run(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(input,'음료');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await run(()=>button('생성 후 선택').click());
  assert.equal(writes.filter(w=>w.path==='/categories').length,1);
  assert.equal((writes[0].body as {parentId:string}).parentId,'cafe');
  assert.equal(writes.filter(w=>w.path.endsWith('/choices')||w.path.endsWith('/save')).length,0,'Creating never persists transaction classification');
  assert.equal(button('음료').getAttribute('aria-pressed'),'true');
  activeCategories=[...categories,{...categories[2],id:'new',name:'음료'},{...categories[2],id:'twin',name:'음료'}];await render();
  const drinks=()=>[...dialog().querySelectorAll<HTMLButtonElement>('[aria-label="소분류"] button')].filter(b=>b.textContent?.trim()==='음료');
  assert.equal(drinks().length,2,'Refetch reconciles the new ID once and preserves distinct IDs with the same name');
  assert.equal(drinks().filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
  await render();assert.equal(drinks().length,2,'Repeated canonical refresh does not duplicate the bridge');
  await run(()=>button('닫기').click());await run(()=>button('버리기').click());await open();await run(()=>button('카페').click());
  assert.equal(drinks().length,2,'Closing and reopening preserves the two legitimate identities');
  await run(()=>button('커피').click());await run(()=>dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  holdLookup=true;const lookups=lookupCount;
  await run(()=>{const target=button('카페');doubleClick(target);target.dispatchEvent(new dom.window.MouseEvent('dblclick',{bubbles:true}));});
  assert.equal(lookupCount,lookups+1,'Synchronous double-click guard starts one pre-save lookup');
  assert.ok(button('분류 저장').disabled);assert.ok(button('커피').disabled);
  assert.ok(dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled);
  await run(()=>{holdLookup=false;releaseLookup!();});
  assert.equal(saves().length,1);assert.equal(lastCommand().categoryId,'cafe','Middle-level double click clears the previously selected child');
  assert.equal(lastCommand().thisTransactionOnly,true);assert.equal(lastCommand().expectedStamp,'v0');assert.equal(dialog(),null);
  await render();await open();failSave=true;
  await run(()=>doubleClick(button('커피')));
  assert.equal(saves().length,2);assert.equal(lastCommand().categoryId,'coffee');
  assert.ok(dialog(),'Known save failure keeps the popup open');assert.equal(button('커피').getAttribute('aria-pressed'),'true');
  assert.ok(!button('분류 저장').disabled,'Failure releases the guard so the existing button can retry');
  assert.match(dialog().textContent!,/다시 시도/);
  failSave=false;await run(()=>button('분류 저장').click());
  assert.equal(saves().length,3);assert.equal(lastCommand().categoryId,'coffee');assert.equal(lastCommand().thisTransactionOnly,false);
  assert.equal(dialog(),null,'Successful retry uses the same workflow and closes');
 }finally{api.get=original.get;api.post=original.post;await act(()=>root.unmount());dom.window.close();}
});
