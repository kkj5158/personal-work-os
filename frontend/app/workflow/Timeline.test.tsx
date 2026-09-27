import assert from 'node:assert/strict';
import {test} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import type {Phase,PlanDay,Project,WorkTask} from '@/lib/api/workflow';

/**
 * S09 over a fake backend with WorkflowPlanningService plan-day semantics (move merges on collision).
 * Every mark writes only the entity it represents: Project bar → Project range, Phase bar → Phase range,
 * Task marker → one plan day. No Task field, deadline, weekly selection or Workpad write may happen.
 */
test('Timeline: Month plan-day move/merge/undo, Quarter Phase move, Year Project move — no cascade', async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/workflow/timeline',pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true,localStorage:dom.window.localStorage});
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 dom.window.HTMLElement.prototype.setPointerCapture=()=>{};
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return new dom.window.DOMRect(0,0,910,40);};
 const {createRoot}=await import('react-dom/client');
 const {workflowApi}=await import('@/lib/api/workflow');
 const {toDateKey}=await import('@/lib/date');
 const {seoulToday}=await import('@/lib/seoulDate');
 const {addDays,periodWindow,periodOf}=await import('@/lib/workflow/timeline');
 const {WorkflowProvider}=await import('./WorkflowContext');
 const {default:Timeline}=await import('./Timeline');
 const original={...workflowApi};
 const today=toDateKey(seoulToday()),month=today.slice(0,7),D=(day:number)=>`${month}-${String(day).padStart(2,'0')}`;
 let projects:Project[]=[{id:'p',title:'Alpha',status:'ACTIVE',startDate:D(2),endDate:D(20),color:'#4488aa',memo:null,order:0,revision:0}];
 let phases:Phase[]=[{id:'h',projectId:'p',title:'Build',status:'TODO',startDate:D(3),endDate:D(12),memo:null,order:0,revision:0}];
 const tasks:WorkTask[]=[{id:'t',projectId:'p',phaseId:'h',title:'Draft spec',status:'TODO',startDate:D(1),dueDate:D(2),priority:'NORMAL',memo:null,order:0,revision:3,deadlineDate:D(25)}];
 let planDays:PlanDay[]=[{taskId:'t',date:D(5),order:0},{taskId:'t',date:D(9),order:0}];
 const writes:string[]=[];
 const forbidden=(name:string)=>async()=>{writes.push(`FORBIDDEN:${name}`);throw new Error(`${name} must not be called`);};
 workflowApi.get=async()=>structuredClone({projects,phases,tasks,planDays});
 workflowApi.week=async weekStart=>({weekStart,revision:0,focusSlots:[],goals:[],projects:[],tasks:[],planDays:[]});
 workflowApi.resources=async()=>[];workflowApi.taskRecords=async()=>[];workflowApi.taskEvents=async()=>[];
 workflowApi.patchProject=async(id,_revision,patch)=>{writes.push(`project:${JSON.stringify(patch)}`);projects=projects.map(item=>item.id===id?{...item,...patch,revision:(item.revision??0)+1}:item);return structuredClone(projects.find(item=>item.id===id)!);};
 workflowApi.patchPhase=async(id,_revision,patch)=>{writes.push(`phase:${JSON.stringify(patch)}`);phases=phases.map(item=>item.id===id?{...item,...patch,revision:(item.revision??0)+1}:item);return structuredClone(phases.find(item=>item.id===id)!);};
 workflowApi.movePlanDay=async(taskId,from,to)=>{
  writes.push(`move:${from}->${to}`);
  const merged=planDays.some(day=>day.taskId===taskId&&day.date===to);
  planDays=merged?planDays.filter(day=>!(day.taskId===taskId&&day.date===from)):planDays.map(day=>day.taskId===taskId&&day.date===from?{...day,date:to}:day);
  return {merged,planDays:planDays.filter(day=>day.taskId===taskId)};
 };
 workflowApi.addPlanDay=async(taskId,date)=>{writes.push(`add:${date}`);if(!planDays.some(day=>day.taskId===taskId&&day.date===date))planDays=[...planDays,{taskId,date,order:0}];return planDays.filter(day=>day.taskId===taskId);};
 Object.assign(workflowApi,{patchTask:forbidden('patchTask'),saveTask:forbidden('saveTask'),changeStatus:forbidden('changeStatus'),selectTask:forbidden('selectTask'),unselectTask:forbidden('unselectTask'),
  saveDay:forbidden('saveDay'),addToToday:forbidden('addToToday'),continueTask:forbidden('continueTask'),removePlanDay:forbidden('removePlanDay')});
 const taskBefore=structuredClone(tasks[0]);
 const root=createRoot(document.getElementById('root')!);
 const $=<T extends Element>(selector:string)=>document.querySelector<T>(selector);
 const click=async(node:Element|null)=>{assert.ok(node,'element exists');await act(async()=>{node!.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));});};
 const button=(text:string)=>[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===text)??null;
 const plans=()=>planDays.filter(day=>day.taskId==='t').map(day=>day.date).sort();
 async function dropPlan(from:string,to:string){
  const data=JSON.stringify({taskId:'t',from});
  await act(async()=>{const event=new dom.window.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:['application/workflow-plan'],getData:(type:string)=>type==='application/workflow-plan'?data:''}});$(`.wf-tl-day[data-date="${to}"]`)!.dispatchEvent(event);});
 }
 const pointer=(type:string,x:number)=>{const event=new dom.window.MouseEvent(type,{clientX:x,bubbles:true,cancelable:true,button:0});Object.defineProperty(event,'pointerId',{value:1});return event;};
 async function dragBar(id:string,dayWidth:number,days:number){const bar=$<HTMLElement>(`[data-entity-id="${id}"] .wf-tl-bar`)!;assert.ok(bar,`bar ${id}`);await act(async()=>{bar.dispatchEvent(pointer('pointerdown',100));});await act(async()=>{bar.dispatchEvent(pointer('pointermove',100+dayWidth*days));});await act(async()=>{bar.dispatchEvent(pointer('pointerup',100+dayWidth*days));});}
 try{
  await act(async()=>root.render(<WorkflowProvider><Timeline/></WorkflowProvider>));
  // ---- Month: plan-day markers + semantic deadline marker; the legacy range is neither.
  assert.equal(document.querySelectorAll('.wf-tl-plan[data-plan-task="t"]').length,2,'one marker per placement');
  assert.ok($(`.wf-tl-day[data-date="${D(25)}"] .wf-tl-deadline`),'deadline marker from deadlineDate');
  assert.equal($(`.wf-tl-day[data-date="${D(2)}"] .wf-tl-deadline`),null,'legacy due_date is not a deadline');
  assert.equal(document.querySelectorAll('.wf-tl-deadline[draggable="true"]').length,0,'deadline is not a drag target');
  assert.ok($('.wf-tl-span'),'Project period span');
  // Display filters: 계획 Task only hides deadlines and spans; 전체 restores.
  await click(button('계획 Task'));
  assert.equal($('.wf-tl-deadline'),null);assert.equal($('.wf-tl-span'),null);assert.equal(document.querySelectorAll('.wf-tl-plan').length,2);
  assert.match(window.location.search,/show=PLAN/);
  await click([...document.querySelectorAll('[aria-label="표시 항목 필터"] button')].find(item=>item.textContent==='전체')!);
  assert.ok($('.wf-tl-deadline'));
  assert.equal(button('잠정 일정'),null,'no 잠정 일정 filter');

  // Drag a plan marker: only that placement moves.
  await dropPlan(D(5),D(7));
  assert.deepEqual(plans(),[D(7),D(9)].sort());
  assert.deepEqual(tasks[0],taskBefore,'deadline and Task fields unchanged');
  // Collision: dropping onto an existing placement merges, never duplicates.
  await dropPlan(D(7),D(9));
  assert.deepEqual(plans(),[D(9)]);
  assert.match($('.wf-tl-status')!.textContent!,/합쳤습니다/);
  // Undo of a merge re-adds the source placement (the pre-existing one stays).
  await click($('[aria-label="Timeline 실행 취소"]'));
  assert.deepEqual(plans(),[D(7),D(9)].sort());
  // Keyboard alternative: Alt+→ moves one day.
  const marker=$<HTMLElement>(`.wf-tl-day[data-date="${D(9)}"] .wf-tl-plan`)!;
  await act(async()=>{marker.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));});
  assert.deepEqual(plans(),[D(7),D(10)].sort());
  assert.equal(projects[0].startDate,D(2));assert.equal(phases[0].startDate,D(3));

  // Task marker opens the shared S10; Timeline view state stays in the URL.
  await click($(`.wf-tl-day[data-date="${D(10)}"] .wf-tl-plan`));
  assert.ok($('.wf-split-detail .wf-td'),'S10 in the split pane');
  assert.match(window.location.search,/task=t/);
  assert.ok($('.wf-tl-month'),'Timeline still rendered (non-modal)');
  await click($('[aria-label="상세 닫기"]'));

  // ---- Quarter: Phase bar move edits the Phase range only.
  await click(button('분기'));
  assert.match(window.location.search,/view=quarter/);
  const quarter=periodWindow('quarter',periodOf('quarter',today)),qWidth=910/91;
  assert.ok(D(3)>=quarter.start&&D(12)<=quarter.end);
  const planSnapshot=plans(),projectSnapshot=structuredClone(projects[0]);
  await dragBar('h',qWidth,2);
  assert.equal(phases[0].startDate,addDays(D(3),2));assert.equal(phases[0].endDate,addDays(D(12),2));
  assert.deepEqual(projects[0],projectSnapshot,'Project untouched by a Phase move');
  assert.deepEqual(plans(),planSnapshot,'plan days untouched');assert.deepEqual(tasks[0],taskBefore,'Task untouched');

  // ---- Year: Project bar move edits the Project range only; Phase / Task / plan days stay.
  await click(button('연간'));
  const yearWindow=periodWindow('year',today.slice(0,4));
  const yearDays=(Date.parse(`${yearWindow.end}T00:00:00Z`)-Date.parse(`${yearWindow.start}T00:00:00Z`))/86400000+1;
  const phaseSnapshot=structuredClone(phases[0]);
  await dragBar('p',910/yearDays,3);
  assert.equal(projects[0].startDate,addDays(D(2),3));assert.equal(projects[0].endDate,addDays(D(20),3));
  assert.deepEqual(phases[0],phaseSnapshot,'Phase untouched by a Project move');
  assert.deepEqual(plans(),planSnapshot);assert.deepEqual(tasks[0],taskBefore);
  assert.equal($('[data-entity-id="h"]'),null,'Year shows Projects only');
  // Undo restores only the Project.
  await act(async()=>{window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));});
  assert.equal(projects[0].startDate,D(2));assert.deepEqual(phases[0],phaseSnapshot);

  // Week and Today route to the existing S05 board and Workpad.
  assert.match($<HTMLAnchorElement>('a.wf-tl-link[href^="/workflow/week"]')!.getAttribute('href')!,/view=board&week=\d{4}-\d{2}-\d{2}/);
  assert.equal($<HTMLAnchorElement>('a.wf-tl-link[href="/workflow/today"]')?.textContent,'오늘 ↗');
  assert.deepEqual(writes.filter(item=>item.startsWith('FORBIDDEN')),[],'no Task / week / Workpad writes');
 }finally{await act(async()=>root.unmount());Object.assign(workflowApi,original);dom.window.close();}
});
