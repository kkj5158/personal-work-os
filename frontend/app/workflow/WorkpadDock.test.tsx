import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { Note } from '@/lib/notes/types';
import type { NoteEditorSource } from '@/app/notes/editor/NoteEditor';
import type { TopicNote } from '@/lib/api/workflow';

test('dock preserves editors, edits workspace notes, and guards master-detail navigation', async () => {
  const require=createRequire(import.meta.url);require.extensions['.css']=()=>{};
  const dom=new JSDOM('<div id="root"></div>',{url:'https://orbit.local/workflow/today?date=2026-09-24',pretendToBeVisual:true});
  Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const mocks=new Map<string,NodeModule|undefined>();
  const mock=(name:string,exports:unknown)=>{const path=require.resolve(name);mocks.set(path,require.cache[path]);require.cache[path]={id:path,filename:path,loaded:true,exports} as NodeModule;};
  const params=new URLSearchParams('date=2026-09-24');mock('next/navigation',{useSearchParams:()=>params});
  const {NoteContext}=await import('../notes/NoteContext');
  const {useWorkpadDock}=await import('./WorkpadDock');
  const {useWorkpadSessions}=await import('./WorkpadSessions');
  const {workflowApi}=await import('@/lib/api/workflow');
  const {notesApi}=await import('@/lib/api/notes');
  const originalWorkflow={...workflowApi},originalNotes={...notesApi};
  const topic:TopicNote={id:'topic',workspaceId:null,scope:'WORK FLOW',title:'Topic',content:'Original topic',version:0};
  const workspace:TopicNote={...topic,id:'workspace-note',workspaceId:'workspace',scope:'Workspace',title:'Workspace note'};
  const second:TopicNote={...topic,id:'second',title:'Second'};
  const all=[topic,workspace,second];let failSave=false,dailyEdits=0;const writes:string[]=[];
  Object.assign(workflowApi,{
    recordedDates:async()=>['2026-09-23'],fixedTabs:async()=>[{id:'routine',title:'Routine one',revision:0,blocks:[]}],
    getNote:async(id:string)=>{const note=all.find(n=>n.id===id);assert.ok(note);return {...note};},
    resolveNote:async(title:string)=>all.filter(n=>n.title===title),backlinks:async()=>[],
    saveNote:async(note:TopicNote)=>{if(failSave)throw new Error('Keep unsaved note');writes.push('topic:'+note.id);return {...note,version:note.version+1};},
  });
  notesApi.note=async(w,id)=>{assert.equal(w,'workspace');assert.equal(id,workspace.id);return {...workspace,workspaceId:w,type:'NOTE',journalDate:null,pinnedAt:null,deletedAt:null,createdAt:'2026-09-24',updatedAt:'',aliases:[],tags:[]};};
  notesApi.save=async(w,note)=>{assert.equal(w,'workspace');writes.push('workspace:'+note.id);return {...await notesApi.note(w,note.id),...note,version:note.version+1};};
  function RegisteredEditor({initial,source}:{initial:Note;source?:NoteEditorSource}){
    const env=React.useContext(NoteContext),draft=React.useRef(initial.content),saved=React.useRef(initial.content);
    React.useEffect(()=>env.register(initial.id,async()=>{
      if(draft.current===saved.current)return;
      const input={...initial,content:draft.current};
      if(source)await source.save(input);else await notesApi.save(initial.workspaceId,input);
      saved.current=draft.current;
    },()=>draft.current!==saved.current),[initial,env,source]);
    return <div data-note-id={initial.id} data-editor-source={source?'topic':'workspace'}><button onClick={()=>{draft.current+=' edit';}}>Edit {initial.title}</button><button data-wiki-title="Second">Second link</button><button data-wiki-title="Topic">Topic link</button></div>;
  }
  function Daily({embeddedDate,fixedTab}:{embeddedDate?:string;fixedTab?:{id:string}}){
    const dock=useWorkpadDock(),sessions=useWorkpadSessions();
    React.useEffect(()=>sessions?.register(embeddedDate??'fixed:'+fixedTab!.id,async()=>{},()=>false),[sessions,embeddedDate,fixedTab]);
    return <div data-workpad={embeddedDate??fixedTab?.id}><button onClick={()=>{dailyEdits++;}}>Edit daily</button><button onClick={()=>void dock?.openNote('topic')}>Open topic</button><button onClick={()=>void dock?.openNote('workspace-note')}>Open workspace</button></div>;
  }
  mock('../notes/editor/NoteEditor',{__esModule:true,NoteEditor:RegisteredEditor});mock('./Today',{__esModule:true,default:Daily});
  const {default:WorklogStream}=await import('./WorklogStream');const {createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('root')!);
  const click=async(label:string,ctrl=false)=>{const target=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(target,label);await act(async()=>target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,ctrlKey:ctrl})));};
  try{
    await act(async()=>root.render(<WorklogStream/>));await click('Linked Note');
    assert.match(document.querySelector('#dock-panel-linked')!.textContent!,/Daily Workpads/);
    await click('Open topic');assert.ok(document.querySelector('#dock-panel-linked [data-note-id="topic"]'));
    assert.equal(document.querySelector('[aria-modal="true"]'),null);
    await click('Edit daily');assert.equal(dailyEdits,1);
    await click('Edit Topic');await click('Shortcuts');
    assert.match(document.querySelector('#dock-panel-shortcuts')!.textContent!,/Alt \+ X선택한 텍스트 작업 완료 표시 \/ 해제/,'shortcuts dock documents Alt+X');
    assert.ok(document.querySelector('#dock-panel-linked [data-note-id="topic"]'),'hidden detail stays mounted');
    assert.ok(document.querySelector('[data-workpad="routine"]'),'fixed routine stays mounted');
    await click('Linked Note');await click('Open workspace');
    assert.deepEqual(writes,['topic:topic']);
    assert.equal(document.querySelector('#dock-panel-linked [data-editor-source]')?.getAttribute('data-editor-source'),'workspace');
    await click('Edit Workspace note');await click('Second link',true);
    assert.ok(document.querySelector('.wp-main-note [data-note-id="second"]'),'Ctrl-click promotes to main');
    assert.deepEqual(writes,['topic:topic','workspace:workspace-note']);
    assert.ok(document.querySelector('[data-workpad="2026-09-24"]'),'daily workpad stays mounted');
    await click('Topic link');
    assert.ok(document.querySelector('#dock-panel-linked [data-note-id="topic"]'));
    assert.ok(document.querySelector('.wp-main-note [data-note-id="second"]'),'normal click preserves main');
    await click('Edit Topic');failSave=true;await click('Open as main ↗');
    assert.ok(document.querySelector('#dock-panel-linked [data-note-id="topic"]'));
    assert.ok(document.querySelector('.wp-main-note [data-note-id="second"]'));
    assert.match(document.body.textContent!,/Keep unsaved note/);
    failSave=false;await click('Open as main ↗');
    assert.ok(document.querySelector('.wp-main-note [data-note-id="topic"]'));
    assert.equal(document.querySelector('#dock-panel-linked [data-note-id="topic"]'),null,'one save queue per note');
    await click('Back to Workpad');assert.equal(document.querySelector('.wp-stream-scroll')?.hasAttribute('hidden'),false);
  }finally{
    await act(async()=>root.unmount());Object.assign(workflowApi,originalWorkflow);Object.assign(notesApi,originalNotes);
    for(const[path,value]of mocks){if(value)require.cache[path]=value;else delete require.cache[path];}dom.window.close();
  }
});
