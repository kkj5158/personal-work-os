import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api,type Category} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
import {ClassificationCells} from './MoneyClassificationCells';
import {ClassificationUndo} from './MoneyClassificationUndo';

async function mount(){
 const dom=new JSDOM("<div id='root'></div>",{url:'https://money.test/money/review'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');
 return {dom,root:createRoot(document.getElementById('root')!)};
}
function button(text:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent===text);assert.ok(node,'Missing button '+text);return node;}
const categories=[{id:'root',name:'생활',parentId:null},{id:'other',name:'카페·간식',parentId:null},{id:'child',name:'카페',parentId:'other'}].map(value=>({...value,kind:'EXPENSE',archived:false,version:0,color:'#333'})) as Category[];

test('root-only is saved, root navigation is a draft, and failed final classification preserves the draft',async()=>{
 const {dom,root}=await mount(),saved:string[]=[];let fail=true;
 try{
  await act(()=>root.render(<MoneyDataProvider><table><tbody><tr><ClassificationCells id="tx" value="root" categories={categories} onSave={async id=>{saved.push(id);if(fail)throw Error('version conflict');}}/></tr></tbody></table></MoneyDataProvider>));
  assert.equal(button('소분류 없음').textContent,'소분류 없음');
  await act(()=>button('생활').click());
  await act(()=>button('카페·간식').click());
  assert.deepEqual(saved,[],'Selecting middle category must not save');
  assert.ok(button('카페·간식 · 입력 중'));
  await act(async()=>button('카페').click());
  assert.deepEqual(saved,['child']);
  assert.match(document.querySelector('[role="alert"]')?.textContent??'',/version conflict/);
  assert.ok(button('카페·간식 · 입력 중'),'Failed selection remains visible');
  fail=false;
  await act(async()=>button('중분류만 적용 · 카페·간식').click());
  assert.deepEqual(saved,['child','other'],'Root-only saves actual root ID, never a virtual child');
  assert.equal(document.querySelector('.money-classification-popup'),null);
 }finally{await act(()=>root.unmount());dom.window.close();}
});

test('immediate undo previews later-edit exclusions and sends only explicit eligible events atomically',async()=>{
 const {dom,root}=await mount(),original=api.post,calls:{path:string;body:unknown}[]=[];
 api.post=async<T,>(path:string,body:unknown)=>{calls.push({path,body});return (path.endsWith('undo-preview')?{eligibleEventIds:['safe'],excluded:[{eventId:'later',reason:'이후 직접 분류 변경 보호'}],fingerprint:'current-snapshot'}:{requestId:'r',status:'APPLIED',result:{restored:1}}) as T;};
 try{
  await act(()=>root.render(<MoneyDataProvider><ClassificationUndo eventIds={['safe','later']}/></MoneyDataProvider>));
  assert.equal(calls.length,0,'Rendering never executes an undo');
  await act(async()=>button('분류 되돌리기').click());
  assert.equal(calls.length,1);
  assert.match(document.body.textContent??'',/이후 직접 분류 변경 보호/);
  await act(async()=>button('1건 함께 되돌리기').click());
  assert.equal(calls.length,2);
  assert.equal(calls[1].path,'/ai/classification/undo');
  const body=calls[1].body as {eventIds:string[];fingerprint:string;requestId:string};
  assert.deepEqual(body.eventIds,['safe']);assert.equal(body.fingerprint,'current-snapshot');assert.ok(body.requestId);
  assert.match(document.body.textContent??'',/제목·메모와 금융 정보는 유지/);
 }finally{api.post=original;await act(()=>root.unmount());dom.window.close();}
});
