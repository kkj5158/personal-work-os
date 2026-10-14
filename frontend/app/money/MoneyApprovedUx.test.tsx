import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api,type Category} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import type {BookRow} from './MoneyWebData';
import type {Props} from './MoneyWebViews';
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){if(url.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return next(url,context);}});
const ROOT='/ai/classification/recommendations';
const categories=[{id:'food',name:'식비',kind:'EXPENSE',parentId:null,color:'#123456',version:1,archived:false}] as Category[];
const book=(id:string,type='EXPENSE')=>({id,title:`선택 ${id}`,counterpartyText:`거래처 ${id}`,type,accountId:'account',categoryId:null,occurredAt:'2026-10-14T01:00:00Z',amount:1000,currency:'KRW',version:1,transactionVersion:1,projectionVersion:1,classificationVersion:0,source:{},overrides:{}} as BookRow);
async function mount(){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/workbench'});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
  Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
  const {createRoot}=await import('react-dom/client');return {dom,root:createRoot(document.getElementById('root')!)};
}
function button(text:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent===text);assert.ok(node,'Missing '+text);return node;}
async function tick(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});}
test('manual bulk selection stages guarded drafts, includes hidden targets, and writes only on explicit save',async()=>{
  const {RecommendationProvider}=await import('./MoneyBookkeepingRecommendations');
  const {ManualBulkClassification}=await import('./MoneyManualBulkClassification');
  const {dom,root}=await mount(),get=api.get,post=api.post;
  const calls:{path:string;body:unknown}[]=[],applied:string[][]=[],choices:{command:{id:string};book:BookRow}[]=[];
  api.get=async<T,>(path:string)=>{
    if(path.startsWith(ROOT+'/current/')){const id=path.split('/').at(-1)!;if(id==='financial')throw Error('전용 금융 경로 필요');return {stamp:`stamp-${id}`,book:book(id,id==='income'?'INCOME':'EXPENSE')} as T;}
    return (path.endsWith('/choices')?{items:choices}:path.endsWith('/activity')?{recommendations:[],saves:[]}:{items:[]}) as T;
  };
  api.post=async<T,>(path:string,body:unknown)=>{
    calls.push({path,body});
    const input=body as {item:{id:string};items:{id:string}[];requestId:string};
    if(path.endsWith('/choices')){choices.push({command:input.item,book:book(input.item.id)});return {status:'APPLIED',result:{transactionId:input.item.id},requestId:input.requestId} as T;}
    if(path.endsWith('/save-preview'))return {selected:input.items.length,ready:input.items.map(command=>({id:command.id,command,book:book(command.id)})),excluded:[]} as T;
    if(path.endsWith('/save'))return {id:'saved',items:input.items.map((command,i)=>({id:`result-${i}`,transactionId:command.id,status:i===0?'SAVED':'FAILED_KNOWN',eventId:i===0?'event':undefined,attempts:1,result:i===0?{book:{...book(command.id),categoryId:'food',version:2}}:{reason:'검증된 실패'}}))} as T;
    throw Error('Unexpected write '+path);
  };
  try{
    await act(()=>root.render(<MoneyDataProvider><RecommendationProvider workbench={false} filters={{}} selected={['visible','hidden','income','financial']} visible={['visible']} categories={categories} accounts={[]} onSavedSelection={ids=>applied.push(ids)}><ManualBulkClassification selected={['visible','hidden','income','financial']} visible={['visible']} categories={categories} onClear={()=>{}}/></RecommendationProvider></MoneyDataProvider>));await tick();
    await act(()=>button('카테고리 지정').click());await act(()=>button(' 식비').click());await act(()=>button('소분류 없음').click());
    assert.equal(calls.length,0,'Picker navigation and final selection do not write');
    await act(async()=>button('변경안 확인').click());await tick();
    assert.equal(calls.filter(call=>call.path.endsWith('/save')).length,0);
    assert.match(document.body.textContent??'',/화면 밖 3건/);assert.match(document.body.textContent??'',/적용 가능 2건 · 제외 2건/);
    assert.deepEqual(calls.filter(call=>call.path.endsWith('/choices')).map(call=>(call.body as {item:{id:string}}).item.id),['visible','hidden']);
    await act(async()=>button('카테고리 일괄 저장 · 2건').click());await tick();
    assert.deepEqual(applied,[['visible']]);assert.equal(calls.filter(call=>call.path.endsWith('/save')).length,1);
    assert.match(document.body.textContent??'',/검증된 실패/);assert.ok(button('확인된 실패만 재시도'));
    assert.equal(document.querySelector('.money-manual-bulk button.money-primary'),null,'Partial result cannot resubmit successful frozen items');
  }finally{api.get=get;api.post=post;await act(()=>root.unmount());dom.window.close();}
});
test('unknown bulk response blocks new writes and recovers the original request without resubmitting',async()=>{
  const {RecommendationProvider}=await import('./MoneyBookkeepingRecommendations');
  const {ManualBulkClassification}=await import('./MoneyManualBulkClassification');
  const {dom,root}=await mount(),get=api.get,post=api.post;let writes=0,recover=false;const lookups:string[]=[];
  api.get=async<T,>(path:string)=>{
    if(path.startsWith(ROOT+'/current/'))return {stamp:'original-stamp',book:book('one')} as T;
    if(path.includes('/save-outcomes/')){lookups.push(path);return (recover?{id:'original-save',items:[{id:'item',transactionId:'one',status:'SAVED',attempts:1,result:{book:{...book('one'),version:2,categoryId:'food'}}}]}:{status:'NOT_FOUND'}) as T;}
    return (path.endsWith('/activity')?{recommendations:[],saves:[]}:{items:[]}) as T;
  };
  api.post=async<T,>(path:string,body:unknown)=>{const input=body as {items:{id:string}[]};if(path.endsWith('/choices'))return {status:'APPLIED',result:{transactionId:'one'}} as T;if(path.endsWith('/save-preview'))return {ready:input.items.map(command=>({id:command.id,book:book(command.id),command})),excluded:[]} as T;if(path.endsWith('/save')){writes++;throw Error('response lost');}throw Error('Unexpected '+path);};
  try{
    await act(()=>root.render(<MoneyDataProvider><RecommendationProvider workbench={false} filters={{}} selected={['one']} visible={['one']} categories={categories} accounts={[]}><ManualBulkClassification selected={['one']} visible={['one']} categories={categories} onClear={()=>{}}/></RecommendationProvider></MoneyDataProvider>));await tick();
    await act(()=>button('카테고리 지정').click());await act(()=>button(' 식비').click());await act(()=>button('소분류 없음').click());await act(async()=>button('변경안 확인').click());await act(async()=>button('카테고리 일괄 저장 · 1건').click());
    assert.equal(button('카테고리 지정').disabled,true);
    await act(async()=>button('원래 저장 요청 결과 조회').click());assert.equal(writes,1);assert.equal(button('카테고리 지정').disabled,true);
    recover=true;await act(async()=>button('원래 저장 요청 결과 조회').click());assert.equal(writes,1);assert.equal(lookups.length,2);assert.equal(lookups[0],lookups[1]);
    assert.match(document.body.textContent??'',/저장 완료/);
  }finally{api.get=get;api.post=post;await act(()=>root.unmount());dom.window.close();}
});
test('keyboard group sorting rolls back a rejected write, preserves focus and uses fresh versions for Undo',async()=>{
  const {CategoryManagement}=await import('./MoneyCategoryManagement');
  const {dom,root}=await mount(),get=api.get,put=api.put;
  const groups=[{id:'g1',name:'생활 그룹',kind:'EXPENSE',sortOrder:0,version:1},{id:'g2',name:'다른 그룹',kind:'EXPENSE',sortOrder:1,version:1}];
  const rows=[{...categories[0],id:'a',name:'첫 분류',structuralGroupId:'g1',sortOrder:0},{...categories[0],id:'other',name:'다른 분류',structuralGroupId:'g2',sortOrder:1},{...categories[0],id:'b',name:'둘째 분류',structuralGroupId:'g1',sortOrder:2}] as Category[];
  let fail=true,saved=rows;const calls:{ids:string[];versions:Record<string,number>}[]=[];
  api.get=async<T,>(path:string)=>(path==='/category-groups'?groups:[]) as T;
  api.put=async<T,>(_path:string,input:unknown)=>{const command=input as {ids:string[];versions:Record<string,number>};calls.push(command);if(fail)throw Error('version conflict');saved=command.ids.map((id,index)=>({...saved.find(row=>row.id===id)!,sortOrder:index,version:saved.find(row=>row.id===id)!.version+1}));return saved as T;};
  const props={categories:rows,accounts:[],period:{from:'2026-10-01',to:'2026-10-31'},selected:'a',select(){},kind:'EXPENSE',setKind(){},rules:[],ready:true} as unknown as Props&{kind:'EXPENSE';setKind:()=>void;rules:[]};
  const names=()=>[...document.querySelectorAll('.money-tree-column:nth-child(2) .money-order-label')].map(node=>node.childNodes[0].textContent);
  try{
    await act(()=>root.render(<MoneyDataProvider><CategoryManagement {...props}/></MoneyDataProvider>));await tick();
    let handle=document.querySelector<HTMLButtonElement>('[aria-label="첫 분류 정렬 · Alt 위 아래"]')!;await act(()=>handle.focus());
    await act(async()=>handle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));
    assert.deepEqual(names(),['첫 분류','다른 분류','둘째 분류']);assert.match(document.body.textContent??'',/표시 순서를 되돌렸습니다/);assert.equal(document.activeElement,handle);
    fail=false;await act(async()=>handle.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})));
    assert.deepEqual(names(),['둘째 분류','다른 분류','첫 분류']);assert.deepEqual(calls.at(-1)?.ids,['b','other','a']);
    handle=document.querySelector<HTMLButtonElement>('[aria-label="첫 분류 정렬 · Alt 위 아래"]')!;assert.equal(document.activeElement,handle);
    await act(async()=>button('순서 실행 취소').click());
    assert.deepEqual(names(),['첫 분류','다른 분류','둘째 분류']);assert.deepEqual(calls.at(-1)?.versions,{a:2,other:2,b:2});
  }finally{api.get=get;api.put=put;await act(()=>root.unmount());dom.window.close();}
});
