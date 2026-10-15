import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as nodeModule from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {moneyApi as api,type Category} from '@/lib/money/model';
import {MoneyDataProvider} from './MoneyDataProvider';
const {registerHooks}=nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,next:(url:string,context:unknown)=>unknown)=>unknown})=>unknown};
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export {};',shortCircuit:true}:next(url,context);}});
const tick=async(action:()=>void=()=>{})=>{await act(async()=>{action();for(let n=0;n<6;n++)await new Promise(resolve=>setTimeout(resolve,0));});};
test('real category editor serializes colors, preserves pending name, reconciles loss and offers visible failure recovery',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://money.test/money/categories'});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,ResizeObserver:class{observe(){}disconnect(){}},IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{attachEvent(){},detachEvent(){}});
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root')!);const {MoneyEditor}=await import('./MoneyEditors');
 let saved={id:'color-category',name:'원래 이름',color:'#123456',kind:'EXPENSE',version:3,archived:false,parentId:null,sortOrder:0} as Category;
 const original={get:api.get,put:api.put},writes:{path:string;body:Record<string,unknown>}[]=[];
 let release:(()=>void)|undefined,hold=true,fail=false,lose=false;
 api.get=async<T,>(path:string)=>(path==='/categories'?[saved]:path.includes('/impact')?{records:0,rules:0,children:0}:[]) as T;
 api.put=async<T,>(path:string,input:unknown)=>{const body=input as Record<string,unknown>;writes.push({path,body});if(path.endsWith('/color')){
  if(hold){hold=false;await new Promise<void>(resolve=>release=resolve);}if(fail)throw Error('합성 연결 실패');assert.equal(body.expectedVersion,saved.version);assert.equal(body.expectedColor,saved.color);saved={...saved,color:body.color as string};if(lose){lose=false;throw Error('response lost');}return {...saved} as T;
 }saved={...saved,...body,version:saved.version+1} as Category;return saved as T;};
 const button=(label:string)=>{const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent?.trim()===label||x.getAttribute('aria-label')===label);assert.ok(b,label);return b;};
 try{
  await tick(()=>root.render(<MoneyDataProvider><MoneyEditor selection={{kind:'category',value:saved}} categories={[saved]} accounts={[]} onSaved={()=>{}} onClose={()=>{}} select={()=>{}}/></MoneyDataProvider>));
  const name=document.querySelector<HTMLInputElement>('input[maxlength="80"]')!;
  await tick(()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value')!.set!.call(name,'아직 저장하지 않은 이름');name.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await tick(()=>button('색상 #5b8def').click());assert.equal(button('색상 #5b8def').getAttribute('aria-pressed'),'true');
  await tick(()=>{button('색상 #2563eb').click();button('색상 #45ae99').click();});assert.equal(writes.length,1);
  await tick(()=>release!());assert.equal(saved.color,'#45ae99');assert.equal(saved.name,'원래 이름');assert.equal(name.value,'아직 저장하지 않은 이름');assert.equal(writes.length,2);
  assert.deepEqual(Object.keys(writes[0].body).sort(),['color','expectedColor','expectedVersion']);assert.match(document.body.textContent??'',/색상 자동 저장됨/);
  fail=true;await tick(()=>button('색상 #0f766e').click());assert.match(document.querySelector('[role="alert"]')?.textContent??'',/색상 저장 실패/);
  fail=false;await tick(()=>button('색상 저장 재시도').click());assert.equal(saved.color,'#0f766e');
  lose=true;await tick(()=>button('색상 #e1a34a').click());assert.equal(saved.color,'#e1a34a');assert.equal(document.querySelector('[role="alert"]'),null,'Lost success is reconciled');
  await tick(()=>document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved.name,'아직 저장하지 않은 이름');assert.equal(writes.at(-1)?.body.expectedVersion,3,'Color autosaves preserve the pending form version');assert.equal(saved.color,'#e1a34a');
 }finally{api.get=original.get;api.put=original.put;await act(()=>root.unmount());dom.window.close();}
});
