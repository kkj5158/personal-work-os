import assert from "node:assert/strict";
import { test } from "node:test";
import React,{act} from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { TimeGrid, attendanceHeader } from "./TimeGrid";
import { gestureSpan, snapMove, snapResize } from "./overview";
import { toLocalDateTimeString } from "@/lib/date";
import type { CalendarAttendanceContextDto, CalendarWorkRecordSummaryDto } from "@/lib/api/types";
import type { GridBlock } from "./gridTypes";
Object.assign(globalThis,{React});

test("gesture span widens the 23:59 day-end sentinel to the five-minute grid; aligned spans are unchanged",()=>{
  assert.deepEqual(gestureSpan(1380,1439),{start:1380,end:1440});
  assert.deepEqual(gestureSpan(605,695),{start:605,end:695});
  assert.deepEqual(gestureSpan(1320,1379),{start:1320,end:1380}); // legacy off-grid Plan end
  // Moving the widened span keeps both ends on the grid and within the day.
  const span=gestureSpan(1380,1439),duration=span.end-span.start;
  assert.equal(snapMove(span.start,-60,duration),1320);
  assert.equal(snapMove(span.start,60,duration),1380);
  assert.equal(snapResize(span.end,-15,span.start),1425);
  assert.equal(snapResize(span.end,30,span.start),1440);
});

const record=(date:string,status:CalendarWorkRecordSummaryDto["status"]):CalendarWorkRecordSummaryDto=>({date,status,clockInAt:null,clockOutAt:null,basicWorkMinutes:null});
const plan=(date:string,plannedStatus:CalendarAttendanceContextDto["plannedStatus"],plannedNetWorkMinutes:number|null=null):CalendarAttendanceContextDto=>({date,plannedStatus,plannedNetWorkMinutes});

test("attendance header prefers the recorded WorkRecord and is 근태 미정 only without plan or record",()=>{
  assert.equal(attendanceHeader("2026-09-14",[],[record("2026-09-14","WORK")]),"근무");
  assert.equal(attendanceHeader("2026-09-15",[plan("2026-09-15","WORK",420)],[record("2026-09-15","ABSENT")]),"결근 · 7h");
  assert.equal(attendanceHeader("2026-09-21",[plan("2026-09-21","PAID_LEAVE")],[]),"연차");
  assert.equal(attendanceHeader("2026-09-17",[plan("2026-09-16","WORK")],[record("2026-09-18","WORK")]),"근태 미정");
});

test("week header renders the record on its own date without shifting neighbours",()=>{
  const days=[13,14,15].map(d=>new Date(2026,8,d));
  const html=renderToStaticMarkup(<TimeGrid days={days} blocks={[]} colorMode="ACTIVITY" projects={[]} phases={[]} interactionMode="actual" onBlockClick={()=>{}} onBlockTimeChange={()=>{}} attendanceContext={[]} workRecords={[record("2026-09-14","WORK")]}/>);
  const labels=[...html.matchAll(/붙여넣기 날짜"[^>]*>.*?<div[^>]*>(.*?)<\/div>/g)].map(m=>m[1]);
  assert.deepEqual(labels,["근태 미정","근무","근태 미정"]);
});

for(const kind of ["actual","plan"] as const)test(`${kind} blocks ending at 23:59 move earlier, across dates, resize and return to day end on the grid`,async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost"});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  dom.window.HTMLElement.prototype.setPointerCapture=()=>{};
  const moved:[GridBlock,Date,Date][]=[],errors:string[]=[];
  const root=createRoot(document.getElementById("root")!);
  t.after(async()=>{await act(()=>root.unmount());dom.window.close();});
  const dayEnd:GridBlock={id:"day-end",sourceType:kind === "actual" ? "LIFE_TIME_ENTRY" : undefined,domainType:"LIFE",title:"Late",startAt:"2026-09-14T23:00:00",endAt:"2026-09-14T23:59:00",activityCategoryId:null,lifeCategoryId:null,phaseId:null,memo:null};
  const normal:GridBlock={...dayEnd,id:"normal",title:"Normal",startAt:"2026-09-14T10:05:00",endAt:"2026-09-14T10:40:00"};
  await act(()=>root.render(<TimeGrid days={[new Date(2026,8,14),new Date(2026,8,15)]} blocks={[dayEnd,normal]} colorMode="ACTIVITY" projects={[]} phases={[]} interactionMode={kind} onBlockClick={()=>{}} onBlockTimeChange={(...args)=>moved.push(args)} onInvalidDrop={message=>errors.push(message)}/>));
  const cols=Array.from(document.querySelectorAll<HTMLElement>('[data-calendar-date]'));
  const content=cols[0].parentElement!;
  content.getBoundingClientRect=()=>({top:0,left:0,bottom:1440,right:248,width:248,height:1440,x:0,y:0,toJSON(){}});
  cols.forEach((col,i)=>{col.getBoundingClientRect=()=>({top:0,left:48+i*100,right:148+i*100,bottom:1440,width:100,height:1440,x:48+i*100,y:0,toJSON(){}});});
  document.elementsFromPoint=()=>[];
  const pointer=async(el:Element,type:string,x:number,y:number)=>{await act(()=>{el.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));});};
  const drag=async(selector:string,from:[number,number],to:[number,number])=>{await pointer(document.querySelector(selector)!,"pointerdown",...from);await pointer(content,"pointermove",...to);await pointer(content,"pointerup",...to);};
  const last=()=>{const [,start,end]=moved.at(-1)!;return [toLocalDateTimeString(start),toLocalDateTimeString(end)];};
  const onGrid=(value:string)=>Number(value.slice(14,16)) % 5 === 0 || value.endsWith("23:59:00");

  await drag('[data-calendar-block="normal"]',[90,610],[90,640]);
  assert.deepEqual(last(),["2026-09-14T10:35:00","2026-09-14T11:10:00"]);
  await drag('[data-calendar-block="day-end"]',[90,1390],[90,1330]);
  assert.deepEqual(last(),["2026-09-14T22:00:00","2026-09-14T23:00:00"]);
  await drag('[data-calendar-block="day-end"]',[90,1390],[190,1390]);
  assert.deepEqual(last(),["2026-09-15T23:00:00","2026-09-15T23:59:00"]);
  await drag('[data-calendar-block="day-end"] [aria-label="종료 시간 조절"]',[90,1439],[90,1409]);
  assert.deepEqual(last(),["2026-09-14T23:00:00","2026-09-14T23:30:00"]);
  await drag('[data-calendar-block="day-end"]',[90,1390],[90,1435]);
  assert.deepEqual(last(),["2026-09-14T23:00:00","2026-09-14T23:59:00"]);
  assert.ok(moved.every(([,start,end])=>onGrid(toLocalDateTimeString(start)) && onGrid(toLocalDateTimeString(end)) && start.getDate()===end.getDate()));
  assert.deepEqual(errors,[]);
});
