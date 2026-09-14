import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {toDateKey} from '@/lib/date';
import {seoulToday} from '@/lib/seoulDate';
import {monthDates,addDays} from '@/lib/workflow/timeline';
import {workflowApi,type WorkflowData} from '@/lib/api/workflow';

test('bar body and both handles persist snapped dates; undo restores only the selected entity',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://orbit.local/workflow/timeline',pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 dom.window.HTMLElement.prototype.setPointerCapture=()=>{};
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return new dom.window.DOMRect(0,0,900,40);};
 const month=toDateKey(seoulToday()).slice(0,7),start=`${month}-05`,end=`${month}-10`,dayWidth=900/monthDates(month).length;
 const data:WorkflowData={projects:[{id:'p',title:'QA Project',status:'ACTIVE',startDate:start,endDate:end,color:'#4488aa',memo:null,order:0}],phases:[{id:'h',projectId:'p',title:'QA Phase',status:'TODO',startDate:start,endDate:end,memo:null,order:0}],tasks:[{id:'t',projectId:'p',phaseId:'h',title:'QA Task',status:'TODO',startDate:start,dueDate:end,priority:'NORMAL',memo:null,order:0}]};
 const original={...workflowApi},writes:string[]=[];
 workflowApi.get=async()=>structuredClone(data);
 workflowApi.saveProject=async input=>{data.projects[0]={...data.projects[0],...input};writes.push('project');return structuredClone(data.projects[0]);};
 workflowApi.savePhase=async input=>{data.phases[0]={...data.phases[0],...input};writes.push('phase');return structuredClone(data.phases[0]);};
 workflowApi.saveTask=async input=>{data.tasks[0]={...data.tasks[0],...input};writes.push('task');return structuredClone(data.tasks[0]);};
 const {createRoot}=await import('react-dom/client'),{WorkflowProvider}=await import('./WorkflowContext'),{default:Timeline}=await import('./Timeline');
 const root=createRoot(document.getElementById('root')!);
 const pointer=(type:string,x:number)=>{const event=new dom.window.MouseEvent(type,{clientX:x,bubbles:true,cancelable:true,button:0});Object.defineProperty(event,'pointerId',{value:1});return event;};
 async function drag(id:string,mode:'move'|'start'|'end',days:number){const bar=document.querySelector<HTMLElement>(`[data-entity-id="${id}"] .wf-timeline-bar`)!;const target=mode==='move'?bar:bar.querySelectorAll<HTMLElement>('.wf-bar-handle')[mode==='start'?0:1];await act(async()=>{target.dispatchEvent(pointer('pointerdown',100));});await act(async()=>{bar.dispatchEvent(pointer('pointermove',100+dayWidth*days));});assert.match(document.querySelector('[role="status"]')!.textContent!,/→/);await act(async()=>{bar.dispatchEvent(pointer('pointerup',100+dayWidth*days));});}
 try{
  await act(async()=>root.render(<WorkflowProvider><Timeline/></WorkflowProvider>));
  assert.equal(document.querySelectorAll('.wf-timeline-day').length,monthDates(month).length);
  await drag('t','move',1.8);assert.equal(data.tasks[0].startDate,addDays(start,2));assert.equal(data.tasks[0].dueDate,addDays(end,2));
  await drag('t','start',-1);assert.equal(data.tasks[0].startDate,addDays(start,1));assert.equal(data.tasks[0].dueDate,addDays(end,2));
  await drag('t','end',1);assert.equal(data.tasks[0].dueDate,addDays(end,3));
  await act(async()=>{window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));});assert.equal(data.tasks[0].dueDate,addDays(end,2));
  const taskBefore=structuredClone(data.tasks[0]);await drag('p','move',3);assert.equal(data.projects[0].startDate,addDays(start,3));assert.equal(data.phases[0].startDate,start);assert.deepEqual(data.tasks[0],taskBefore);
  await drag('h','move',2);assert.equal(data.phases[0].startDate,addDays(start,2));assert.deepEqual(data.tasks[0],taskBefore);
  assert.deepEqual(writes,['task','task','task','task','project','phase']);
 }finally{await act(async()=>root.unmount());Object.assign(workflowApi,original);dom.window.close();}
});
