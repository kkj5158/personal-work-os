import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('routine shared editor saves headings, nested reset and selective undo, retaining edits and failed drafts',async()=>{
  const require=createRequire(import.meta.url);require.extensions['.css']=()=>{};
  const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local/workflow/routine',pretendToBeVisual:true}),win=dom.window;
  Object.assign(globalThis,{React,window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,localStorage:win.localStorage,sessionStorage:win.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true});
  globalThis.requestAnimationFrame=callback=>{callback(0);return 0;};globalThis.cancelAnimationFrame=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};
  const {createRoot}=await import('react-dom/client');
  const {SearchParamsContext}=await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
  const {WorkflowProvider}=await import('./WorkflowContext');const {default:Today}=await import('./Today');
  const {workflowApi}=await import('@/lib/api/workflow');const {newBlock}=await import('@/lib/workflow/workpad');
  Object.assign(workflowApi,{get:async()=>({projects:[],phases:[],tasks:[]})});
  const parent=newBlock('CHECKLIST','parent');parent.checked=true;
  const child=newBlock('CHECKLIST','child',parent.id);child.checked=true;
  const text=newBlock('TEXT','Original');
  let saved={date:'2000-01-01',title:'Work Routine',revision:0,blocks:[parent,child,text]},saves=0,fail=false;
  let release:(()=>void)|undefined,slow=false;
  const source={id:'routine-owner',title:'Work Routine',slot:'work-routine',load:async()=>structuredClone(saved),save:async(input:Omit<typeof saved,'date'>)=>{
    saves++;if(fail)throw Error('offline QA');
    if(slow){slow=false;await new Promise<void>(resolve=>{release=resolve;});}
    assert.equal(input.revision,saved.revision);saved={...input,date:'2000-01-01',revision:input.revision+1};return structuredClone(saved);
  }};
  const root=createRoot(document.getElementById('root')!);
  const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===name)!;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
  const flush=async()=>act(async()=>{win.dispatchEvent(new win.Event('blur'));await tick();});
  try {
    await act(async()=>root.render(<SearchParamsContext.Provider value={new URLSearchParams()}><WorkflowProvider><Today documentSource={source} routine/></WorkflowProvider></SearchParamsContext.Provider>));
    assert.equal(saves,0);assert.match(document.querySelector('.routine-progress')!.textContent!,/2 \/ 2/);
    await act(async()=>button('체크 모두 해제').click());assert.ok(saved.blocks.every(b=>!b.checked));
    const textInput=document.querySelector<HTMLElement>(`#wp-${text.id} .wp-text-input`)!;
    await act(async()=>{textInput.textContent='Edited after reset';textInput.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));});
    await act(async()=>button('실행 취소').click());
    assert.equal(saved.blocks.find(b=>b.id===text.id)!.content,'Edited after reset');
    assert.ok(saved.blocks.filter(b=>b.type==='CHECKLIST').every(b=>b.checked));
    for(const level of ['H1','H2','H3']) {
      await act(async()=>button(level).click());await flush();
      assert.ok(saved.blocks.some(b=>b.type===level));
      assert.ok(document.querySelector(`[role="heading"][aria-level="${level[1]}"]`));
    }
    assert.equal(document.querySelectorAll('.routine-bottom button').length,5);
    assert.equal(saved.blocks.find(b=>b.id===child.id)!.parentId,parent.id);
    // A slow in-flight save must drain the next edit before reporting saved.
    slow=true;
    await act(async()=>{textInput.textContent='Slow edit';textInput.dispatchEvent(new win.InputEvent('input',{bubbles:true}));win.dispatchEvent(new win.Event('blur'));await tick();});
    await act(async()=>{textInput.textContent='Latest edit';textInput.dispatchEvent(new win.InputEvent('input',{bubbles:true}));release!();await tick();});
    assert.equal(saved.blocks.find(b=>b.id===text.id)!.content,'Latest edit');
    fail=true;await act(async()=>button('체크 모두 해제').click());
    assert.ok(document.querySelector('[role="alert"]')?.textContent?.includes('offline QA'));
    assert.ok(saved.blocks.filter(b=>b.type==='CHECKLIST').every(b=>b.checked),'failed save cannot falsely update server');
    fail=false;await act(async()=>button('Retry save').click());await flush();
    assert.ok(saved.blocks.every(b=>!b.checked));
    await act(async()=>button('실행 취소').click());
    assert.ok(saved.blocks.filter(b=>b.type==='CHECKLIST').every(b=>b.checked));
    assert.equal(saved.blocks.find(b=>b.id===text.id)!.content,'Latest edit');
  } finally {await act(async()=>root.unmount());dom.window.close();}
});
