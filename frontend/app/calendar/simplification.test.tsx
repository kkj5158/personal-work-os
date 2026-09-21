import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { apiClient } from "@/lib/api/client";
import { actualAllowed, calendarToday } from "./actualPolicy";
import { blockEditor, newEditor, validateEditor } from "./editorModel";
import { actualInput, planInput, useCalendarEditor } from "./useCalendarEditor";
import { CalendarEditor } from "./CalendarEditor";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarReview } from "./CalendarReview";
import { PRESET_KEY, RECENT_BLOCK_KEY, readQuickBlocks } from "./creationPresets";
import { writeActualPlacement } from "./calendarWrites";

Object.assign(globalThis,{React});
const noop=()=>{};
const props={date:"2026-09-21",categories:[],status:"",error:null,guard:false,busy:false,onChange:noop,onSave:noop,onFlush:noop,onDelete:noop,onClose:noop,onDiscard:noop,onContinue:noop};

test("Actual rules use Seoul calendar date and allow today's future clock",()=>{
  const now=new Date("2026-09-20T16:00:00Z");
  assert.equal(calendarToday(now),"2026-09-21");
  assert.equal(actualAllowed("2026-09-21",now),true);
  assert.equal(actualAllowed("2026-09-20",now),true);
  assert.equal(actualAllowed("2026-09-22",now),false);
  assert.equal(validateEditor({...newEditor("actual",calendarToday(),1380,1435),title:"later today",domainType:"LIFE"}),null);
  assert.match(validateEditor({...newEditor("actual","2099-01-01",600,660),title:"future",domainType:"LIFE"})!,/Plan/);
});

test("detail begins with accessible Plan/Actual and future Actual explains restriction",()=>{
  const html=renderToStaticMarkup(<CalendarEditor {...props} value={{...newEditor("plan","2099-01-01",600,660),title:"Plan"}}/>);
  const doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelector('.cal-editor-fields')?.firstElementChild?.className,"cal-state-control");
  assert.equal(doc.querySelector('[aria-pressed="true"]')?.textContent,"Plan");
  assert.equal(doc.querySelector<HTMLButtonElement>('[aria-describedby="calendar-actual-date-rule"]')?.disabled,true);
  assert.match(html,/내일 이후 일정은 Plan/);
  assert.match(html,/빠른 블록/);assert.doesNotMatch(html,/프리셋 적용|즐겨찾기/);
});

test("state selector stays clickable during a title blur autosave",()=>{
  const doc=new JSDOM(renderToStaticMarkup(<CalendarEditor {...props} busy value={{...newEditor("plan","2020-01-01",600,660),id:"plan",title:"saved"}}/>)).window.document;
  const actual=[...doc.querySelectorAll<HTMLButtonElement>('.cal-state-selector button')].find(b=>b.textContent==="Actual")!;
  assert.equal(actual.disabled,false);
});

test("Review control and totals work without Plan/Actual links",()=>{
  const toolbar=renderToStaticMarkup(<CalendarToolbar viewMode="day" planMode="review" label="today" onViewModeChange={noop} onPlanModeChange={noop} onPrev={noop} onNext={noop} onToday={noop}/>);
  assert.match(toolbar,/회고/);assert.doesNotMatch(toolbar,/비교/);
  const html=renderToStaticMarkup(<CalendarReview categories={[]} range={{planBlocks:[],actualBlocks:[{sourceId:"a",sourceType:"LIFE_TIME_ENTRY",date:"2026-09-21",durationMinutes:60,title:"exercise",domainType:"LIFE",startAt:"2026-09-21T13:00:00",endAt:"2026-09-21T14:00:00",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null}],unscheduledActual:[],stateBlocks:[],attendanceContext:[],workRecords:[]}}/>);
  assert.match(html,/1시간/);assert.doesNotMatch(html,/비교|차이|실제 − 계획/);
});

test("Quick Block reads legacy saved data, applies immediately, and saves reusable defaults",async t=>{
  const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost"});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
  const legacy={id:"saved",title:"운동",domainType:"LIFE",categoryId:"exercise",duration:90,color:"#abcdef"};
  localStorage.setItem(PRESET_KEY,JSON.stringify([legacy]));
  localStorage.setItem(RECENT_BLOCK_KEY,JSON.stringify([{...legacy,id:"recent",title:"최근 운동"}]));
  const patches:unknown[]=[],colors:unknown[]=[];
  const value={...newEditor("plan","2026-09-21",600,660),title:"saved new",id:"existing"};
  const root=createRoot(document.getElementById("root")!);t.after(async()=>{await act(()=>root.unmount());dom.window.close();});
  await act(()=>root.render(<CalendarEditor {...props} value={value} onChange={p=>patches.push(p)} onPresetColor={(...args)=>colors.push(args)}/>));
  const picker=document.querySelector<HTMLSelectElement>('[aria-label="빠른 블록"]')!;
  assert.equal(picker.querySelectorAll("optgroup").length,2);
  await act(()=>{picker.value="saved";picker.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
  assert.deepEqual(patches,[{title:"운동",domainType:"LIFE",categoryId:"exercise",phaseId:null,duration:90,end:"11:30"}]);
  assert.deepEqual(colors,[["LIFE","exercise","#abcdef"]]);
  const save=[...document.querySelectorAll('button')].find(b=>b.textContent==="+ 빠른 블록으로 저장")!;
  await act(()=>save.click());
  const stored=readQuickBlocks(localStorage.getItem(PRESET_KEY));
  assert.equal(stored.length,2);assert.equal(stored[0].id,"saved");assert.equal("date" in stored[1],false);
});

test("state conversion flushes edits, persists once, changes identity and supports correction",async t=>{
  const dom=new JSDOM("<div id='root'></div>",{url:"http://localhost"});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  let editor!:ReturnType<typeof useCalendarEditor>;let refreshes=0;
  function Probe(){editor=useCalendarEditor(async()=>{refreshes++;},noop);return null;}
  const root=createRoot(document.getElementById("root")!);t.after(async()=>{await act(()=>root.unmount());dom.window.close();});
  const calls:{path:string;data:unknown}[]=[];
  t.mock.method(apiClient,"put",async(path:string,data:unknown)=>{calls.push({path,data});return {id:"p"};});
  t.mock.method(apiClient,"post",async(path:string,data:{targetState:string})=>{calls.push({path,data});return data.targetState==="ACTUAL" ? {kind:"ACTUAL",id:"a",sourceType:"LIFE_TIME_ENTRY"} : {kind:"PLAN",id:"p2"};});
  await act(()=>root.render(<Probe/>));
  await act(()=>editor.assign({...newEditor("plan",calendarToday(),780,1080),id:"p",title:"exercise",domainType:"LIFE"}));
  await act(()=>editor.change({memo:"keep draft"}));
  await act(async()=>{await editor.changeState("actual");});
  assert.equal(calls[0].path,"/api/planned-blocks/p");assert.equal(calls[1].path,"/api/calendar/state");
  assert.equal(editor.value?.kind,"actual");assert.equal(editor.value?.id,"a");assert.equal(editor.value?.memo,"keep draft");assert.equal(editor.value?.dirty,false);
  await act(async()=>{await editor.changeState("plan");});
  assert.equal(editor.value?.kind,"plan");assert.equal(editor.value?.id,"p2");assert.equal(editor.value?.sourceType,undefined);
  assert.equal(calls.filter(c=>c.path==="/api/calendar/state").length,2);assert.ok(refreshes>=3);
});

test("future Actual drag uses atomic Plan transition with content preserved",async t=>{
  const saved={id:"a",sourceType:"LIFE_TIME_ENTRY",date:"2026-09-21",categoryId:"life",title:"exercise",durationMinutes:60,startTime:"10:00",endTime:"11:00",memo:"keep",phaseId:null};
  t.mock.method(apiClient,"get",async()=>saved);
  const calls:unknown[]=[];t.mock.method(apiClient,"post",async(path:string,body:unknown)=>{calls.push({path,body});return {kind:"PLAN",id:"p"};});
  t.mock.method(apiClient,"put",async()=>{throw new Error("Future Actual must never be written");});
  await writeActualPlacement("LIFE_TIME_ENTRY","a","2099-01-01","13:00","14:00");
  const result=calls[0] as {path:string;body:{targetState:string;plan:{memo:string;startAt:string;lifeCategoryId:string}}};
  assert.equal(result.path,"/api/calendar/state");assert.equal(result.body.targetState,"PLAN");assert.equal(result.body.plan.memo,"keep");assert.equal(result.body.plan.startAt,"2099-01-01T13:00:00");assert.equal(result.body.plan.lifeCategoryId,"life");
});

test("Supplemental Actual totals and content edits retain authoritative duration",()=>{
  const block={sourceId:"s",id:"s",sourceType:"SUPPLEMENTAL_WORK_ENTRY" as const,date:"2026-09-21",durationMinutes:30,title:"supplemental",domainType:"WORK" as const,startAt:"2026-09-21T13:00:00",endAt:"2026-09-21T14:00:00",activityCategoryId:"work",lifeCategoryId:null,phaseId:null,memo:null};
  const editor=blockEditor(block);
  assert.equal(planInput({...editor,kind:"plan"}).durationMinutes,30);assert.equal(editor.duration,30);assert.equal(actualInput({...editor,memo:"updated"}).durationMinutes,30);
  const html=renderToStaticMarkup(<CalendarReview categories={[]} range={{planBlocks:[],actualBlocks:[block],unscheduledActual:[],stateBlocks:[],attendanceContext:[],workRecords:[]}}/>);
  assert.match(html,/30분/);assert.doesNotMatch(html,/1시간/);
});

test("moving supplemental schedule retains recorded duration; resize changes it",async t=>{
  const saved={id:"s",sourceType:"SUPPLEMENTAL_WORK_ENTRY",date:"2026-09-21",categoryId:"work",title:"extra",durationMinutes:30,startTime:"10:00",endTime:"11:00",memo:null,phaseId:null};
  t.mock.method(apiClient,"get",async()=>saved);
  const durations:number[]=[];
  t.mock.method(apiClient,"post",async(_path:string,body:{plan:{durationMinutes:number}})=>{durations.push(body.plan.durationMinutes);return {kind:"PLAN",id:"p"};});
  await writeActualPlacement("SUPPLEMENTAL_WORK_ENTRY","s","2099-01-01","13:00","14:00");
  await writeActualPlacement("SUPPLEMENTAL_WORK_ENTRY","s","2099-01-01","13:00","15:00");
  assert.deepEqual(durations,[30,120]);
});
