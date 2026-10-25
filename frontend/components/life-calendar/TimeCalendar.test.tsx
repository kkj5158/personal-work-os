import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import TimeCalendar from './TimeCalendar';
import RecordSurface from './RecordSurface';
import {workoutEvents,calendarEvents,sleepEvents,type Event} from '../../lib/life-calendar/model';
import type {Session} from '../../lib/sleep/model';
const workout={id:'workout-id',kind:'SESSION',revision:9,date:'2026-10-12',name:'30분 근력 운동',startedAt:'2026-10-12T01:00:00Z',finishedAt:'2026-10-12T01:30:00Z',exercises:[]};
async function harness(events:Event[],mode:'day'|'week'|'month'='day',sleepOnly=false){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://orbit.local/life/calendar'});Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 Object.assign(dom.window.HTMLElement.prototype,{setPointerCapture:()=>{},hasPointerCapture:()=>true,releasePointerCapture:()=>{}});
 const previews:{id:string;start:string;end:string}[]=[],selected:string[]=[],errors:string[]=[],days:string[]=[],created:{day:string;start:string;end:string}[]=[];const root=createRoot(document.getElementById('root')!);
 await act(()=>root.render(<TimeCalendar events={events} date="2026-10-12" mode={mode} sleepOnly={sleepOnly} selected={null} disabled={false} onSelect={e=>selected.push(e.id)} onPreview={(e,start,end)=>previews.push({id:e.id,start,end})} onDay={d=>days.push(d)} onError={e=>errors.push(e)} onCreate={(day,start,end)=>created.push({day,start,end})}/>));
 return {dom,root,previews,selected,errors,days,created,close:async()=>{await act(()=>root.unmount());dom.window.close();}};
}
test('rendered workout card is at least 96px, occupancy remains 32px, keyboard edits create ONLY a preview',async()=>{const h=await harness(workoutEvents([workout]));try{const block=document.querySelector<HTMLElement>('[data-source="workout"]')!,line=document.querySelector<HTMLElement>('.life-occupancy.workout')!;assert.equal(parseFloat(block.style.height),96);assert.ok(Math.abs(parseFloat(line.style.height)-32)<1e-8);assert.match(block.textContent!,/30분 근력 운동/);await act(()=>block.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})));assert.deepEqual(h.previews,[{id:workout.id,start:'2026-10-12T01:05:00.000Z',end:'2026-10-12T01:35:00.000Z'}]);assert.equal(workout.startedAt,'2026-10-12T01:00:00Z');assert.deepEqual(h.errors,[]);}finally{await h.close();}});
test('end resize handle uses actual time end, and keyboard resize preserves original start',async()=>{const h=await harness(workoutEvents([workout]));try{const handle=document.querySelector<HTMLElement>('.life-resize.end')!;assert.ok(Math.abs(parseFloat(handle.style.top)-26)<1e-8);await act(()=>handle.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));assert.deepEqual(h.previews,[{id:workout.id,start:'2026-10-12T01:00:00.000Z',end:'2026-10-12T01:35:00.000Z'}]);}finally{await h.close();}});
test('dense workouts and a SYS overlay expand readable lanes while retaining the single clock scale',async()=>{const workouts=workoutEvents([workout,{...workout,id:'second',startedAt:'2026-10-12T01:35:00Z',finishedAt:'2026-10-12T02:05:00Z'}]),sys=calendarEvents({planBlocks:[{id:'sys',title:'회의',startAt:'2026-10-12T10:00:00',endAt:'2026-10-12T12:00:00'}],actualBlocks:[],stateBlocks:[]}),h=await harness([...workouts,...sys]);try{const grid=document.querySelector<HTMLElement>('.life-time-grid')!;assert.ok(parseFloat(grid.style.getPropertyValue('--life-col-min'))>=444);assert.equal(grid.style.getPropertyValue('--life-hour'),'64px');assert.equal(document.querySelectorAll('[data-source="workout"]').length,2);assert.equal(document.querySelectorAll('[data-source="calendar"]').length,1);}finally{await h.close();}});
test('SYS cards expose read-only details, no handles, no movement, and retain a true full interval cue',async()=>{const event=calendarEvents({planBlocks:[{id:'plan',title:'회의',startAt:'2026-10-12T10:00:00',endAt:'2026-10-12T12:00:00'}],actualBlocks:[],stateBlocks:[]})[0],h=await harness([event]);try{const block=document.querySelector<HTMLElement>('[data-source="calendar"]')!;assert.equal(parseFloat(block.style.height),30);assert.equal(document.querySelector('.life-resize'),null);assert.ok(Math.abs(parseFloat(document.querySelector<HTMLElement>('.life-occupancy.calendar')!.style.height)-128)<1e-8);await act(()=>block.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})));await act(()=>block.click());assert.deepEqual(h.previews,[]);assert.deepEqual(h.selected,['plan']);}finally{await h.close();}});
test('pointer drag changes instants by true grid minutes and does not mutate original',async()=>{const h=await harness(workoutEvents([workout]));try{const block=document.querySelector<HTMLElement>('[data-source="workout"]')!,column=block.closest<HTMLElement>('.life-time-column')!;column.getBoundingClientRect=()=>({width:150,left:0,top:0,right:150,bottom:1536,height:1536,x:0,y:0,toJSON:()=>({})});block.setPointerCapture=()=>{};block.hasPointerCapture=()=>true;block.releasePointerCapture=()=>{};const pointer=(type:string,x:number,y:number)=>{const event=new h.dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:1});return event;};await act(()=>block.dispatchEvent(pointer('pointerdown',40,100)));await act(()=>block.dispatchEvent(pointer('pointermove',40,132)));await act(()=>block.dispatchEvent(pointer('pointerup',40,132)));assert.deepEqual(h.previews,[{id:workout.id,start:'2026-10-12T01:30:00.000Z',end:'2026-10-12T02:00:00.000Z'}]);assert.equal(workout.finishedAt,'2026-10-12T01:30:00Z');}finally{await h.close();}});
test('monthly overnight distribution keeps one ID and date links open daily detail',async()=>{const night:Session={id:'night',revision:1,bedtimeIntentAt:'2026-10-12T14:15:00Z',wakeAt:'2026-10-12T22:30:00Z',logicalWakeDate:'2026-10-13',expectedWakeDate:'2026-10-13',status:'CLOSED',excludedAt:null,intervalMinutes:495},h=await harness(sleepEvents([night],[]),'month');try{assert.equal(document.querySelectorAll('.life-month-cell').length,42);const strips=document.querySelectorAll<HTMLButtonElement>('.life-month-strip');assert.equal(strips.length,2);await act(()=>strips[0].click());await act(()=>strips[1].click());assert.deepEqual(h.selected,['night','night']);await act(()=>document.querySelector<HTMLButtonElement>('.life-day-link')!.click());assert.equal(h.days.length,1);assert.deepEqual(h.previews,[]);}finally{await h.close();}});

test('Sleep weekly day summaries use confirmed attribution and keep incomplete nights missing',async()=>{const complete:Session={id:'complete',revision:1,bedtimeIntentAt:'2026-10-11T14:15:00Z',wakeAt:'2026-10-11T22:30:00Z',logicalWakeDate:'2026-10-12',expectedWakeDate:'2026-10-12',status:'CLOSED',excludedAt:null,intervalMinutes:495},incomplete={...complete,id:'incomplete',logicalWakeDate:null,expectedWakeDate:'2026-10-13',wakeAt:null,status:'INCOMPLETE',intervalMinutes:null},h=await harness(sleepEvents([complete,incomplete],[]),'week',true);try{const heads=[...document.querySelectorAll('.life-time-head')];assert.match(heads.find(e=>e.textContent?.includes('10-12'))!.textContent!,/야간 8h 15m/);assert.match(heads.find(e=>e.textContent?.includes('10-13'))!.textContent!,/야간 —/);}finally{await h.close();}});

test('Sleep week navigation and empty future columns stay Monday to Sunday without changing the timeline',async()=>{
 const h=await harness([],'week',true);
 try{
  function Surface(){const [date,setDate]=React.useState('2026-10-15');return <RecordSurface serverNow="2026-10-15T03:00:00Z" date={date} mode="week" integrated={false} events={[]} sessions={[]} naps={[]} filters={{sleep:true,nap:true,workout:true,calendar:true}} loading={false} disabled={false} selected={null} editor={null} onSelect={()=>{}} onPreview={()=>{}} onError={()=>{}} onContext={next=>{if(next.date)setDate(next.date);}} onFilter={()=>{}} onCreate={()=>{}}/>;}
  await act(()=>h.root.render(<Surface/>));
  const columns=()=>[...document.querySelectorAll<HTMLElement>('.life-time-column')].map(e=>e.dataset.day);
  assert.deepEqual(columns(),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
  assert.match(document.querySelector('.sleep-toolbar b')!.textContent!,/2026-10-12 – 2026-10-18/);
  assert.equal(document.querySelectorAll('.sleep-weekly-metrics .sleep-panel').length,3);assert.equal(document.querySelector('.sleep-week-chart h2')!.textContent,'주간 수면 추이');assert.ok(!document.querySelector('.sleep-metrics')!.textContent!.includes('KST'));
  assert.equal(document.querySelector('.life-time-axis span')!.textContent,'18:00');
  assert.equal(document.querySelector<HTMLElement>('.life-time-grid')!.style.getPropertyValue('--life-hour'),'26px');
  assert.ok([...document.querySelectorAll('button')].some(e=>e.textContent==='이번 주'));
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="이전 주"]')!.click());
  assert.equal(columns()[0],'2026-10-05');assert.equal(columns()[6],'2026-10-11');
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="다음 주"]')!.click());
  await act(()=>document.querySelector<HTMLButtonElement>('[aria-label="다음 주"]')!.click());
  assert.equal(columns()[0],'2026-10-19');assert.equal(columns()[6],'2026-10-25');
 }finally{await h.close();}
});

function pointers(h:Awaited<ReturnType<typeof harness>>,target:HTMLElement) {
 target.setPointerCapture=()=>{};target.hasPointerCapture=()=>true;target.releasePointerCapture=()=>{};
 return async(type:string,x:number,y:number)=>{const e=new h.dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:7});await act(()=>target.dispatchEvent(e));};
}
test('Sleep empty-space selection crosses midnight on the original clock; no create until release',async()=>{
 const h=await harness([],'week',true);try{
  const col=document.querySelector<HTMLElement>('.life-time-column')!;col.getBoundingClientRect=()=>({top:100,width:150,left:0,height:624,right:150,bottom:724,x:0,y:100,toJSON:()=>({})});const fire=pointers(h,col);
  await fire('pointerdown',30,230);await fire('pointermove',30,438);assert.deepEqual(h.created,[]);assert.ok(document.querySelector('.life-create-preview'));assert.match(document.querySelector('output')!.textContent!,/8시간/);
  await fire('pointerup',30,438);assert.deepEqual(h.created,[{day:'2026-10-12',start:'2026-10-11T14:00:00.000Z',end:'2026-10-11T22:00:00.000Z'}]);assert.equal(document.querySelector('.life-create-preview'),null);assert.deepEqual(h.previews,[]);
 }finally{await h.close();}
});
test('Escape cancels live drag and empty selection without producing an edit or record',async()=>{
 const h=await harness(workoutEvents([workout]));try{
  const block=document.querySelector<HTMLElement>('[data-source="workout"]')!,col=block.closest<HTMLElement>('.life-time-column')!;col.getBoundingClientRect=()=>({top:0,width:150,left:0,height:1536,right:150,bottom:1536,x:0,y:0,toJSON:()=>({})});const fire=pointers(h,block);
  await fire('pointerdown',40,100);await fire('pointermove',40,132);assert.ok(document.querySelector('.dragging'));assert.match(document.querySelector('output')!.textContent!,/10:30/);
  await act(()=>window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await fire('pointerup',40,132);assert.deepEqual(h.previews,[]);assert.equal(document.querySelector('.dragging'),null);
  const empty=pointers(h,col);await empty('pointerdown',100,300);await empty('pointermove',100,400);await act(()=>window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await empty('pointerup',100,400);assert.deepEqual(h.created,[]);
 }finally{await h.close();}
});
test('Sleep resize and cross-column movement preview exact nap duration and retain nap identity',async()=>{
 const n={id:'nap',revision:4,startAt:'2026-10-12T04:00:00Z',endAt:'2026-10-12T04:30:00Z',startTimezone:'Asia/Seoul',endTimezone:'Asia/Seoul',startOffsetMinutes:540,endOffsetMinutes:540,startLocalDate:'2026-10-12',intervalMinutes:30},h=await harness(sleepEvents([],[n]),'week',true);try{
  const block=document.querySelector<HTMLElement>('[data-source="nap"]')!,col=block.closest<HTMLElement>('.life-time-column')!;col.getBoundingClientRect=()=>({top:0,width:150,left:0,height:624,right:150,bottom:624,x:0,y:0,toJSON:()=>({})});
  const end=block.querySelector<HTMLElement>('.life-resize.end')!,resize=pointers(h,end);await resize('pointerdown',40,500);await resize('pointermove',40,513);assert.deepEqual(h.previews,[]);await resize('pointerup',40,513);assert.deepEqual(h.previews[0],{id:'nap',start:'2026-10-12T04:00:00.000Z',end:'2026-10-12T05:00:00.000Z'});
  const move=pointers(h,block);await move('pointerdown',40,500);await move('pointermove',190,513);await pointers(h,document.querySelector<HTMLElement>('.life-time-grid')!)('pointerup',190,513);assert.deepEqual(h.previews[1],{id:'nap',start:'2026-10-13T04:30:00.000Z',end:'2026-10-13T05:00:00.000Z'});assert.equal(n.revision,4);
 }finally{await h.close();}
});


test('a captured pointer click opens the original record exactly once without producing a preview',async()=>{
 const h=await harness(workoutEvents([workout]));try{const block=document.querySelector<HTMLElement>('[data-source="workout"]')!,grid=document.querySelector<HTMLElement>('.life-time-grid')!;
  await pointers(h,block)('pointerdown',50,150);await pointers(h,grid)('pointerup',50,150);assert.deepEqual(h.selected,[workout.id]);assert.deepEqual(h.previews,[]);
 }finally{await h.close();}
});
