import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

test('shared note source keeps wiki caret, drafts, undo and autosave isolated',async()=>{
  const require=createRequire(import.meta.url);require.extensions['.css']=()=>{};
  const dom=new JSDOM('<div id="root"></div>',{url:'https://test.local/workflow/today',pretendToBeVisual:true}),win=dom.window;
  Object.assign(globalThis,{React,window:win,document:win.document,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,localStorage:win.localStorage,sessionStorage:win.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(globalThis,'navigator',{value:win.navigator,configurable:true});
  globalThis.requestAnimationFrame=callback=>{callback(0);return 0;};globalThis.cancelAnimationFrame=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};
  const {createRoot}=await import('react-dom/client');
  const {SearchParamsContext}=await import('next/dist/shared/lib/hooks-client-context.shared-runtime');
  const {WorkflowProvider}=await import('./WorkflowContext');const {WorkpadDock}=await import('./WorkpadDock');
  const {default:Today}=await import('./Today');const {workflowApi}=await import('@/lib/api/workflow');
  const {newBlock}=await import('@/lib/workflow/workpad');const {selectionOffsets}=await import('./EditableText');
  const source=newBlock('TEXT','Before [[연결]] after');source.metadata={wikiLinks:[{name:'연결',ordinal:0,noteId:'target-note'}]};
  let saved={date:'2000-01-01',title:'Note title',revision:0,blocks:[source]},saves=0;
  const opens:string[]=[];let release:(()=>void)|null=null,slow=false;
  Object.assign(workflowApi,{get:async()=>({projects:[],phases:[],tasks:[]}),getNote:async(id:string)=>({id,workspaceId:null,title:'Renamed target',content:'',scope:'WORK FLOW',version:0})});
  const documentSource={id:'note-document',title:saved.title,slot:'linked-note',load:async()=>structuredClone(saved),save:async(input:Pick<typeof saved,'title'|'revision'|'blocks'>)=>{
    saves++;if(slow){slow=false;await new Promise<void>(resolve=>{release=resolve;});}
    assert.equal(input.revision,saved.revision);saved={...input,date:'2000-01-01',revision:input.revision+1};return structuredClone(saved);
  }};
  const root=createRoot(document.getElementById('root')!);
  const input=()=>document.querySelector<HTMLElement>('.wp-text-input')!;
  const type=async(text:string)=>act(async()=>{input().textContent=text;input().dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));});
  try{
    await act(async()=>root.render(<SearchParamsContext.Provider value={new URLSearchParams()}><WorkflowProvider><WorkpadDock.Provider value={{openNote:async id=>{opens.push(id);}}}><Today documentSource={documentSource}/></WorkpadDock.Provider></WorkflowProvider></SearchParamsContext.Provider>));
    assert.equal(saves,0,'opening legacy content never rewrites it');
    const link=document.querySelector('.wp-inline-wiki')!;assert.ok(link);
    await act(async()=>link.dispatchEvent(new win.MouseEvent('mousedown',{bubbles:true,cancelable:true})));
    assert.equal(document.activeElement,input());assert.deepEqual(selectionOffsets(input()),{start:13,end:13});
    assert.deepEqual(opens,['target-note']);assert.equal(input().textContent,source.content);
    await type('Before [[연결]] after 추가');slow=true;
    await act(async()=>{win.dispatchEvent(new win.Event('blur'));await Promise.resolve();});
    assert.equal(saves,1);
    await type('Before [[연결]] after 추가 한글');
    await act(async()=>{release!();await new Promise(resolve=>setTimeout(resolve,20));});
    assert.equal(saved.blocks[0].content,'Before [[연결]] after 추가 한글');assert.equal(saves,2,'typing during save drains a second revision');
    assert.equal((saved.blocks[0].metadata.wikiLinks as {noteId:string}[])[0].noteId,'target-note');
    const undo=document.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!;
    await act(async()=>undo.click());assert.equal(input().textContent,'Before [[연결]] after 추가');
    await act(async()=>{win.dispatchEvent(new win.Event('blur'));await new Promise(resolve=>setTimeout(resolve,10));});
    assert.equal(saved.blocks[0].content,'Before [[연결]] after 추가');
  }finally{await act(async()=>root.unmount());dom.window.close();}
});
